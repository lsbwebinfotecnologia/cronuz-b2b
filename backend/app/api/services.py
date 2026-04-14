from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime, date

from app.db.session import get_db
from app.models.user import User
from app.core.dependencies import get_current_user

from app.models.service import Service, ServiceOrder, ServiceOrderStatus
from app.schemas.service import (
    ServiceCreate, ServiceUpdate, ServiceResponse,
    ServiceOrderCreate, ServiceOrderUpdate, ServiceOrderResponse,
    ServiceOrderBillRequest, ServiceOrderBulkStatusRequest, ServiceOrderBulkBillRequest
)

router = APIRouter(tags=["services"])

@router.post("/services", response_model=ServiceResponse)
def create_service(
    service_in: ServiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_service = Service(**service_in.model_dump(), company_id=current_user.company_id)
    db.add(new_service)
    db.commit()
    db.refresh(new_service)
    return new_service

@router.get("/services", response_model=dict)
def get_services(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Service).filter(Service.company_id == current_user.company_id)
    if search:
        query = query.filter(Service.name.ilike(f"%{search}%"))
        
    total = query.count()
    items = query.order_by(Service.name).offset(skip).limit(limit).all()
    
    return {
        "items": [ServiceResponse.model_validate(i).model_dump() for i in items],
        "total": total,
        "page": (skip // limit) + 1,
        "pages": (total + limit - 1) // limit
    }

@router.get("/services/{service_id}", response_model=ServiceResponse)
def get_service(
    service_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    service = db.query(Service).filter(Service.id == service_id, Service.company_id == current_user.company_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Serviço não encontrado.")
    return service

@router.put("/services/{service_id}", response_model=ServiceResponse)
def update_service(
    service_id: int,
    service_in: ServiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    service = db.query(Service).filter(Service.id == service_id, Service.company_id == current_user.company_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Serviço não encontrado.")
        
    for key, value in service_in.model_dump(exclude_unset=True).items():
        setattr(service, key, value)
        
    db.commit()
    db.refresh(service)
    return service

@router.post("/service-orders", response_model=ServiceOrderResponse)
def create_service_order(
    order_in: ServiceOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.customer import Customer
    customer = db.query(Customer).filter(Customer.id == order_in.customer_id, Customer.company_id == current_user.company_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    base_data = order_in.model_dump()
    is_recurrent = base_data.get("is_recurrent", False)
    end_date = base_data.get("recurrence_end_date")
        
    from sqlalchemy import func
    max_local_id = db.query(func.max(ServiceOrder.local_id)).filter(ServiceOrder.company_id == current_user.company_id).scalar() or 0
    
    new_order = ServiceOrder(**base_data, company_id=current_user.company_id, local_id=max_local_id + 1)
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    
    if is_recurrent and end_date:
        from dateutil.relativedelta import relativedelta
        current_date = order_in.execution_date + relativedelta(months=1)
        current_local_id = max_local_id + 1
        
        while current_date <= end_date:
            child_data = base_data.copy()
            child_data["execution_date"] = current_date
            current_local_id += 1
            
            child_order = ServiceOrder(**child_data, company_id=current_user.company_id, local_id=current_local_id)
            db.add(child_order)
            
            current_date = current_date + relativedelta(months=1)
            
        db.commit()
    
    return new_order

@router.get("/service-orders", response_model=dict)
def get_service_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(ServiceOrder).options(joinedload(ServiceOrder.customer), joinedload(ServiceOrder.service)).filter(ServiceOrder.company_id == current_user.company_id)
    
    if start_date:
        query = query.filter(ServiceOrder.execution_date >= start_date)
    if end_date:
        query = query.filter(ServiceOrder.execution_date <= end_date)
    if search:
        if search.isdigit():
            query = query.filter(ServiceOrder.id == int(search))
        
    total = query.count()
    
    from sqlalchemy import func, case
    from app.models.service import ServiceOrderStatus
    stats_query = db.query(
        func.sum(case((ServiceOrder.status.in_([ServiceOrderStatus.PENDING, ServiceOrderStatus.IN_PROGRESS]), ServiceOrder.negotiated_value), else_=0)).label("total_pending"),
        func.sum(case((ServiceOrder.status == ServiceOrderStatus.COMPLETED, ServiceOrder.negotiated_value), else_=0)).label("total_completed"),
        func.sum(case((ServiceOrder.status == ServiceOrderStatus.CANCELLED, ServiceOrder.negotiated_value), else_=0)).label("total_cancelled")
    ).filter(ServiceOrder.company_id == current_user.company_id)
    
    if start_date:
        stats_query = stats_query.filter(ServiceOrder.execution_date >= start_date)
    if end_date:
        stats_query = stats_query.filter(ServiceOrder.execution_date <= end_date)
    if search and search.isdigit():
        stats_query = stats_query.filter(ServiceOrder.id == int(search))
        
    stats_res = stats_query.first()
    total_pending = float(stats_res.total_pending or 0.0)
    total_completed = float(stats_res.total_completed or 0.0)
    total_cancelled = float(stats_res.total_cancelled or 0.0)

    items = query.order_by(ServiceOrder.execution_date.asc()).offset(skip).limit(limit).all()
    
    results = []
    from app.models.nfse import NFSeQueue

    for o in items:
        resp = ServiceOrderResponse.model_validate(o).model_dump()
        resp["customer_name"] = o.customer.name if o.customer else None
        resp["service_name"] = o.service.name if o.service else None
        
        # Search for the latest nfse submission to get PDF url
        nfse_q = db.query(NFSeQueue).filter(NFSeQueue.service_order_id == o.id).order_by(NFSeQueue.created_at.desc()).first()
        resp["pdf_url"] = nfse_q.pdf_url_link if nfse_q else None
        resp["nfse_number"] = nfse_q.xml_protocol_id if nfse_q else None
        
        results.append(resp)
        
    return {
        "items": results,
        "total": total,
        "total_expected": total_pending,
        "total_completed": total_completed,
        "total_cancelled": total_cancelled,
        "page": (skip // limit) + 1,
        "pages": (total + limit - 1) // limit
    }

from fastapi.responses import Response, JSONResponse

@router.get("/service-orders/{order_id}/pdf")
def get_service_order_pdf(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.nfse import NFSeQueue
    order = db.query(ServiceOrder).filter(ServiceOrder.id == order_id, ServiceOrder.company_id == current_user.company_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Service order not found")
        
    nfse_q = db.query(NFSeQueue).filter(NFSeQueue.service_order_id == order_id).order_by(NFSeQueue.created_at.desc()).first()
    if not nfse_q:
        raise HTTPException(status_code=404, detail="NFS-e queue record not found")
        
    # Get XML directly from DB (saved by the worker after SEFAZ authorization)
    if not nfse_q.xml_retorno:
        raise HTTPException(
            status_code=400, 
            detail="A nota ainda está em processamento na SEFAZ. Aguarde a conversão para Emitida."
        )
        
    if order.company.nfse_enabled and nfse_q.status == "SUCCESS" and nfse_q.xml_protocol_id:
        chave_str = str(nfse_q.xml_protocol_id).strip()
        import re
        if not re.match(r'^\d{50}$', chave_str):
            return JSONResponse(status_code=400, content={"error": "Chave de acesso inválida (não possui 50 dígitos). A nota deve ser autorizada no padrão nacional."})
            
        from app.integrators.nfse.factory import NFSeFactory
        import asyncio
        client = NFSeFactory.get_provider(order.company)
        
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
        res = loop.run_until_complete(client.baixar_pdf_danfse(chave_str))
        if res.get("success") and res.get("pdf_bytes"):
            return Response(
                content=res["pdf_bytes"], 
                media_type="application/pdf",
                headers={"Content-Disposition": f"inline; filename=NFSe_{order_id}.pdf"}
            )
        else:
            return JSONResponse(status_code=400, content={"error": res.get("error", "Não foi possível baixar o DANFSe. Verifique o status da nota.")})
            
    xml_content = nfse_q.xml_retorno
        
    prestador_nome = order.company.razao_social or order.company.name
    prestador_email = order.company.domain or ""
    tomador_nome = order.customer.name
    tomador_email = order.customer.email or ""
    
    from app.core.danfse_generator import DanfseGenerator
    generator = DanfseGenerator(
        xml_content=xml_content,
        prestador_nome=prestador_nome,
        prestador_email=prestador_email,
        tomador_nome=tomador_nome,
        tomador_email=tomador_email
    )
    
    pdf_bytes = generator.generate_pdf()
    
    return Response(content=bytes(pdf_bytes), media_type="application/pdf")

@router.put("/service-orders/{order_id}")
def update_service_order(
    order_id: int,
    req: ServiceOrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = db.query(ServiceOrder).filter(
        ServiceOrder.id == order_id,
        ServiceOrder.company_id == current_user.company_id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de Serviço não encontrada")
        
    update_data = req.model_dump(exclude_unset=True)
    
    # Restrição de Valor Negociado
    if "negotiated_value" in update_data and update_data["negotiated_value"] != order.negotiated_value:
        # Trava Fiscal
        if order.status_nfse in [ServiceOrderNfseStatus.ISSUED, ServiceOrderNfseStatus.PROCESSING]:
            raise HTTPException(status_code=400, detail="Não é permitido alterar o valor de uma O.S. que já possui processamento fiscal (NFS-e) ativo.")
            
        # Trava Financeira
        from app.models.financial import FinancialTransaction
        has_financials = db.query(FinancialTransaction).filter(
            FinancialTransaction.company_id == current_user.company_id,
            FinancialTransaction.description.like(f"%OS #{order.id}%"),
            FinancialTransaction.transaction_status != "CANCELADO"
        ).first()
        
        if has_financials:
            raise HTTPException(status_code=400, detail="Não é permitido alterar o valor de uma O.S. que já possui faturamento atrelado. Cancele o faturamento atual primeiro.")

    for field, value in update_data.items():
        setattr(order, field, value)
        
    db.commit()
    return ServiceOrderResponse.model_validate(order)

@router.patch("/service-orders/bulk/status")
def update_bulk_service_order_status(
    bulk_req: ServiceOrderBulkStatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    orders = db.query(ServiceOrder).filter(
        ServiceOrder.id.in_(bulk_req.order_ids),
        ServiceOrder.company_id == current_user.company_id
    ).all()
    for order in orders:
        order.status = bulk_req.status
    db.commit()
    return {"status": "success", "updated": len(orders)}



@router.patch("/service-orders/{order_id:int}/status")
def update_service_order_status(
    order_id: int,
    status: ServiceOrderStatus,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = db.query(ServiceOrder).filter(ServiceOrder.id == order_id, ServiceOrder.company_id == current_user.company_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de Serviço não encontrada.")
        
    order.status = status
    db.commit()
    return {"status": "success"}

@router.post("/service-orders/{order_id:int}/bill")
def bill_service_order(
    order_id: int,
    bill_req: ServiceOrderBillRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.financial import FinancialTransaction, FinancialInstallment
    
    order = db.query(ServiceOrder).options(joinedload(ServiceOrder.service)).filter(
        ServiceOrder.id == order_id, 
        ServiceOrder.company_id == current_user.company_id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de Serviço não encontrada.")
        
    if order.status != ServiceOrderStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Somente Ordens de Serviço com status 'Concluido' podem ser faturadas.")
        
    # Check if a transaction already exists for this order. We'll map OS to order_id temporarily or rely on custom description.
    # We will simulate the bill creation
    service_name = order.service.name if order.service else "Ordem de Serviço"
    
    transaction = FinancialTransaction(
        company_id=current_user.company_id,
        description=f"Faturamento OS #{order.id} - {service_name}",
        category_id=order.service.category_id if order.service else None,
        type="RECEIVABLE",
        transaction_status="CONFIRMADO",
        total_amount=order.negotiated_value,
        issue_date=date.today(),
        first_due_date=bill_req.first_due_date,
        customer_id=order.customer_id,
        order_id=None # We might need a service_order_id in FinancialTransaction in the future, but we keep it None for now since order_id maps to B2B orders.
    )
    
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    
    from dateutil.relativedelta import relativedelta
    
    base_installment = round(order.negotiated_value / bill_req.installments_count, 2)
    last_installment = order.negotiated_value - (base_installment * (bill_req.installments_count - 1))
    
    for i in range(bill_req.installments_count):
        amount = last_installment if i == bill_req.installments_count - 1 else base_installment
        due_d = bill_req.first_due_date + relativedelta(months=i)
        
        inst = FinancialInstallment(
            transaction_id=transaction.id,
            number=i + 1,
            due_date=due_d,
            amount=amount,
            status="PENDING",
            account_id=bill_req.account_id
        )
        db.add(inst)
        
    db.commit()
    
    from app.models.service import ServiceOrderNfseStatus
    order.status_nfse = ServiceOrderNfseStatus.PROCESSING
    
    msg = "Faturamento gerado com sucesso."
    if bill_req.print_point_id:
        from app.models.nfse import NFSeQueue
        new_queue_item = NFSeQueue(
            company_id=current_user.company_id,
            service_order_id=order.id,
            print_point_id=bill_req.print_point_id,
            status="PENDING"
        )
        db.add(new_queue_item)
        db.commit()
        db.refresh(new_queue_item)
        
        # Modo Direta Síncrona: Executa imediatamente ignorando o worker e retorna status bruto
        import asyncio
        from app.integrators.nfse.factory import NFSeFactory
        
        try:
            client = NFSeFactory.get_provider(current_user.company)
        except ValueError as e:
            q = new_queue_item
            q.status = "REJECTED"
            q.error_message = str(e)
            order.status_nfse = ServiceOrderNfseStatus.ERROR
            db.commit()
            return {
                "status": "error",
                "message": str(e),
                "status_sefaz": 400,
                "resposta_bruta": str(e),
                "xml_enviado": ""
            }
        
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
        emit_result = loop.run_until_complete(
            client.emitir_nota(
                order, 
                order.service, 
                order.customer, 
                order.customer.addresses[0] if order.customer and order.customer.addresses else None, 
                new_queue_item.print_point
            )
        )
        
        status_sefaz = emit_result.get("status_code", 500)
        raw_body = emit_result.get("raw_body", str(emit_result.get("error", "")))
        xml_enviado = emit_result.get("xml", "")

        q = new_queue_item
        if emit_result.get("success"):
            q.status = "SUCCESS"
            q.xml_protocol_id = emit_result.get("protocol_id", "")
            q.nfse_response_json = emit_result.get("response", {})
            q.xml_retorno = xml_enviado
            order.status_nfse = ServiceOrderNfseStatus.ISSUED
            if q.print_point:
                q.print_point.current_number += 1
            msg = "Faturamento e Emissão realizados com sucesso."
        else:
            q.status = "REJECTED"
            q.error_message = f"HTTP {status_sefaz}: {raw_body}"
            order.status_nfse = ServiceOrderNfseStatus.ERROR
            msg = f"HTTP {status_sefaz}: Emissão não finalizada."

        db.commit()

        return {
            "status": "success", 
            "message": msg, 
            "transaction_id": getattr(transaction, "id", None),
            "status_sefaz": status_sefaz,
            "resposta_bruta": raw_body,
            "xml_enviado": xml_enviado
        }
    else:
        db.commit()
        
    return {"status": "success", "message": msg, "transaction_id": getattr(transaction, "id", None)}

@router.post("/service-orders/bulk/bill")
def bulk_bill_service_orders(
    bulk_req: ServiceOrderBulkBillRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.financial import FinancialTransaction, FinancialInstallment
    from app.models.service import ServiceOrderNfseStatus
    
    orders = db.query(ServiceOrder).options(joinedload(ServiceOrder.service)).filter(
        ServiceOrder.id.in_(bulk_req.order_ids),
        ServiceOrder.company_id == current_user.company_id
    ).all()
    
    if not orders:
        raise HTTPException(status_code=404, detail="Nenhuma Ordem de Serviço encontrada.")
        
    for order in orders:
        if order.status != ServiceOrderStatus.COMPLETED:
            raise HTTPException(status_code=400, detail=f"OS #{order.id} não está Concluída.")
        if order.status_nfse not in [ServiceOrderNfseStatus.NOT_ISSUED, ServiceOrderNfseStatus.ERROR]:
            raise HTTPException(status_code=400, detail=f"OS #{order.id} já possui faturamento vinculado.")
    customer_ids = set(order.customer_id for order in orders)
    if len(customer_ids) > 1:
        raise HTTPException(status_code=400, detail="Todas as Ordens agrupadas devem pertencer ao mesmo Cliente.")
        
    customer_id = customer_ids.pop()
    total_negotiated = round(sum(order.negotiated_value for order in orders), 2)
    category_id = orders[0].service.category_id if orders[0].service else None
    
    order_ids_str = ", ".join(f"#{o.id}" for o in orders)
    
    transaction = FinancialTransaction(
        company_id=current_user.company_id,
        description=f"Faturamento Agrupado OS {order_ids_str}",
        category_id=category_id,
        type="RECEIVABLE",
        transaction_status="CONFIRMADO",
        total_amount=total_negotiated,
        issue_date=date.today(),
        first_due_date=bulk_req.first_due_date,
        customer_id=customer_id,
        order_id=None
    )
    
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    
    from dateutil.relativedelta import relativedelta
    
    base_installment = round(total_negotiated / bulk_req.installments_count, 2)
    last_installment = round(total_negotiated - (base_installment * (bulk_req.installments_count - 1)), 2)
    
    for i in range(bulk_req.installments_count):
        amount = last_installment if i == bulk_req.installments_count - 1 else base_installment
        due_d = bulk_req.first_due_date + relativedelta(months=i)
        
        inst = FinancialInstallment(
            transaction_id=transaction.id,
            number=i + 1,
            due_date=due_d,
            amount=amount,
            status="PENDING",
            account_id=bulk_req.account_id
        )
        db.add(inst)
        
    for order in orders:
        order.status_nfse = ServiceOrderNfseStatus.PROCESSING
        
    msg = "Faturamento agrupado gerado com sucesso."
    if bulk_req.print_point_id:
        from app.models.nfse import NFSeQueue
        for order in orders:
            new_queue_item = NFSeQueue(
                company_id=current_user.company_id,
                service_order_id=order.id,
                print_point_id=bulk_req.print_point_id,
                status="PENDING"
            )
            db.add(new_queue_item)
        db.commit()
        
        from app.tasks.nfse_worker import process_nfse_queue_jobs
        process_nfse_queue_jobs()
        
        db.expire_all()
        failed_orders = []
        for order in orders:
            db.refresh(order)
            q = db.query(NFSeQueue).filter(NFSeQueue.service_order_id == order.id).order_by(NFSeQueue.id.desc()).first()
            if q and q.status.value == "REJECTED":
                err = q.error_message if q.error_message else "Falha de validação ou Certificado não encontrado"
                failed_orders.append(f"OS #{order.id}: {err}")
        
        if failed_orders:
            raise HTTPException(status_code=400, detail="Faturado, mas com erros na emissão:\n" + "\n".join(failed_orders))
            
        msg = "Faturamento agrupado e Emissões realizados com sucesso."
    else:
        db.commit()
    
    return {"status": "success", "message": msg, "transaction_id": transaction.id}

@router.post("/service-orders/bulk/bill-individual")
def bulk_bill_individual_service_orders(
    bulk_req: ServiceOrderBulkBillRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.financial import FinancialTransaction, FinancialInstallment
    from app.models.service import ServiceOrderNfseStatus
    
    orders = db.query(ServiceOrder).options(joinedload(ServiceOrder.service)).filter(
        ServiceOrder.id.in_(bulk_req.order_ids),
        ServiceOrder.company_id == current_user.company_id
    ).all()
    
    if not orders:
        raise HTTPException(status_code=404, detail="Nenhuma Ordem de Serviço encontrada.")
        
    for order in orders:
        if order.status != ServiceOrderStatus.COMPLETED:
            raise HTTPException(status_code=400, detail=f"OS #{order.id} não está Concluída.")
        if order.status_nfse not in [ServiceOrderNfseStatus.NOT_ISSUED, ServiceOrderNfseStatus.ERROR]:
            raise HTTPException(status_code=400, detail=f"OS #{order.id} já possui faturamento vinculado.")
    from dateutil.relativedelta import relativedelta
    
    transaction_ids = []
    
    for order in orders:
        service_name = order.service.name if order.service else "Ordem de Serviço"
        category_id = order.service.category_id if order.service else None
        
        transaction = FinancialTransaction(
            company_id=current_user.company_id,
            description=f"Faturamento OS #{order.id} - {service_name}",
            category_id=category_id,
            type="RECEIVABLE",
            transaction_status="CONFIRMADO",
            total_amount=order.negotiated_value,
            issue_date=date.today(),
            first_due_date=bulk_req.first_due_date,
            customer_id=order.customer_id,
            order_id=None
        )
        db.add(transaction)
        db.flush()
        transaction_ids.append(transaction.id)
        
        base_installment = round(order.negotiated_value / bulk_req.installments_count, 2)
        last_installment = order.negotiated_value - (base_installment * (bulk_req.installments_count - 1))
        
        for i in range(bulk_req.installments_count):
            amount = last_installment if i == bulk_req.installments_count - 1 else base_installment
            due_d = bulk_req.first_due_date + relativedelta(months=i)
            
            inst = FinancialInstallment(
                transaction_id=transaction.id,
                number=i + 1,
                due_date=due_d,
                amount=amount,
                status="PENDING",
                account_id=bulk_req.account_id
            )
            db.add(inst)
            
        order.status_nfse = ServiceOrderNfseStatus.PROCESSING

    msg = f"{len(orders)} faturamentos gerados com sucesso."
    if bulk_req.print_point_id:
        from app.models.nfse import NFSeQueue
        for order in orders:
            new_queue_item = NFSeQueue(
                company_id=current_user.company_id,
                service_order_id=order.id,
                print_point_id=bulk_req.print_point_id,
                status="PENDING"
            )
            db.add(new_queue_item)
        db.commit()
        
        from app.tasks.nfse_worker import process_nfse_queue_jobs
        process_nfse_queue_jobs()
        
        db.expire_all()
        failed_orders = []
        for order in orders:
            db.refresh(order)
            q = db.query(NFSeQueue).filter(NFSeQueue.service_order_id == order.id).order_by(NFSeQueue.id.desc()).first()
            if q and q.status.value == "REJECTED":
                err = q.error_message if q.error_message else "Falha de validação ou Certificado não encontrado"
                failed_orders.append(f"OS #{order.id}: {err}")
        
        if failed_orders:
            raise HTTPException(status_code=400, detail="Faturado, mas com erros na emissão:\n" + "\n".join(failed_orders))
            
        msg = f"{len(orders)} faturamentos agrupados e Emissões realizados com sucesso."
    else:
        db.commit()
        
    return {"status": "success", "message": msg}




from pydantic import BaseModel
from typing import List, Optional
from app.models.print_point import PrintPoint

class BulkIssueRequest(BaseModel):
    order_ids: List[int]
    print_point_id: Optional[int] = None

@router.post("/service-orders/bulk/issue-nf")
def bulk_issue_service_order_nf(
    bulk_req: BulkIssueRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.nfse import NFSeQueue
    from app.models.company import Company
    from app.models.service import ServiceOrderNfseStatus
    
    orders = db.query(ServiceOrder).filter(
        ServiceOrder.id.in_(bulk_req.order_ids), 
        ServiceOrder.company_id == current_user.company_id
    ).all()
    
    if not orders:
        raise HTTPException(status_code=404, detail="Nenhuma Ordem de Serviço encontrada.")
        
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company or not company.nfse_enabled:
        raise HTTPException(status_code=400, detail="Módulo NFS-e Nacional não está ativado nas configurações da empresa.")
        
    print_point_id = bulk_req.print_point_id or company.nfse_default_print_point_id
    if not print_point_id:
        raise HTTPException(status_code=400, detail="Nenhum Ponto de Impressão selecionado ou padrão definido. Configure em Ajustes -> NFS-e.")
        
    point = db.query(PrintPoint).filter(PrintPoint.id == print_point_id, PrintPoint.company_id == company.id).first()
    if not point:
        raise HTTPException(status_code=400, detail="Ponto de Impressão inválido.")
    if not point.is_service:
        raise HTTPException(status_code=400, detail="Ponto de Impressão selecionado é exclusivo para Produtos, não pode emitir NFS-e.")
        
    # Extra check if electronic is required for this action
    if not point.is_electronic:
        raise HTTPException(status_code=400, detail="A emissão Nacional exige um ponto eletrônico.")
        
    import asyncio
    from app.integrators.nfse.factory import NFSeFactory
    from fastapi.responses import JSONResponse
    
    try:
        client = NFSeFactory.get_provider(company)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    for order in orders:
        if order.status_nfse == ServiceOrderNfseStatus.ISSUED:
            continue
            
        order.status_nfse = ServiceOrderNfseStatus.PROCESSING
        
        new_queue_item = NFSeQueue(
            company_id=company.id,
            service_order_id=order.id,
            print_point_id=print_point_id,
            status="PENDING"
        )
        db.add(new_queue_item)
        db.commit()
        db.refresh(new_queue_item)
        
        emit_result = loop.run_until_complete(
            client.emitir_nota(
                order, 
                order.service, 
                order.customer, 
                order.customer.addresses[0] if order.customer and order.customer.addresses else None, 
                new_queue_item.print_point
            )
        )
        
        status_sefaz = emit_result.get("status_code", 500)
        raw_body = emit_result.get("raw_body", str(emit_result.get("error", "")))
        xml_enviado = emit_result.get("xml", "")

        q = new_queue_item
        if emit_result.get("success"):
            q.status = "SUCCESS"
            q.xml_protocol_id = emit_result.get("protocol_id", "")
            q.nfse_response_json = emit_result.get("response", {})
            q.xml_retorno = xml_enviado
            order.status_nfse = ServiceOrderNfseStatus.ISSUED
            if q.print_point:
                q.print_point.current_number += 1
        else:
            q.status = "REJECTED"
            q.error_message = f"HTTP {status_sefaz}: {raw_body}"
            order.status_nfse = ServiceOrderNfseStatus.ERROR
            db.commit()
            
            return JSONResponse(status_code=400, content={
                "status_sefaz": status_sefaz,
                "resposta_bruta": raw_body,
                "xml_enviado": xml_enviado,
                "detail": f"Erro na emissão: {status_sefaz}"
            })

    db.commit()
    
    # Se formos processar lote 100% com sucesso, retornamos o primeiro emit_result ou info basica
    return {
        "status": "success", 
        "message": f"{len(orders)} notas emitidas com sucesso."
    }

class CancelNfseRequest(BaseModel):
    codigo_cancelamento: str
    motivo: str

@router.post("/service-orders/{order_id}/nfse/cancel")
def cancel_service_order_nfse(
    order_id: int,
    req: CancelNfseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.service import ServiceOrderNfseStatus
    from app.models.nfse import NFSeQueue
    from app.integrators.nfse.factory import NFSeFactory
    import asyncio
    
    order = db.query(ServiceOrder).filter(
        ServiceOrder.id == order_id,
        ServiceOrder.company_id == current_user.company_id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de Serviço não encontrada.")
    
    if order.status_nfse != ServiceOrderNfseStatus.ISSUED:
        raise HTTPException(status_code=400, detail="Apenas notas Emitidas podem ser canceladas.")
        
    nfse_queue = db.query(NFSeQueue).filter(
        NFSeQueue.service_order_id == order.id,
        NFSeQueue.status == "SUCCESS"
    ).order_by(NFSeQueue.id.desc()).first()
    
    if not nfse_queue or not nfse_queue.xml_protocol_id:
        raise HTTPException(status_code=400, detail="Chave de Acesso da NFS-e não encontrada para realizar o cancelamento.")
        
    try:
        client = NFSeFactory.get_provider(order.company)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    chave_acesso = nfse_queue.xml_protocol_id
    result = loop.run_until_complete(
        client.cancelar_nota(chave_acesso, req.codigo_cancelamento, req.motivo)
    )
    
    if result.get("success"):
        order.status_nfse = "Cancelado"  # Se existir no Enum, ou trataremos pelo Cancelado na transaction
        # actually, ServiceOrderNfseStatus only has NOT_ISSUED, PROCESSING, ISSUED, ERROR.
        # Sefin cancels the bill, but the OS can revert its nfse back to NOT_ISSUED or ERROR
        order.status_nfse = ServiceOrderNfseStatus.ERROR # Temporary representation until we add CANCELLED
        
        # update financial transaction to CANCELLED if we want
        from app.models.financial import FinancialTransaction
        tx = db.query(FinancialTransaction).filter(
            FinancialTransaction.description.like(f"%OS #{order.id}%"),
            FinancialTransaction.company_id == current_user.company_id
        ).first()
        if tx:
            tx.transaction_status = "CANCELADO"
            for installment in tx.installments:
                installment.status = "CANCELLED"
                
        # save the cancel context
        nfse_queue.error_message = f"CANCELADA. Motivo: {req.codigo_cancelamento} - {req.motivo}"
        db.commit()
        return {"status": "success", "message": "NFS-e Cancelada com sucesso na Sefin Nacional.", "response": result.get("response")}
    else:
        raise HTTPException(status_code=400, detail=f"Erro ao cancelar NFS-e: {result.get('error')}")

@router.get("/service-orders/{order_id}/nfse/consult")
def consult_service_order_nfse(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.nfse import NFSeQueue
    from app.integrators.nfse.factory import NFSeFactory
    from app.models.service import ServiceOrderNfseStatus
    import asyncio
    
    order = db.query(ServiceOrder).filter(
        ServiceOrder.id == order_id,
        ServiceOrder.company_id == current_user.company_id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de Serviço não encontrada.")
        
    nfse_queue = db.query(NFSeQueue).filter(
        NFSeQueue.service_order_id == order.id,
        NFSeQueue.status.in_(["SUCCESS", "PROCESSING"])
    ).order_by(NFSeQueue.id.desc()).first()
    
    if not nfse_queue or not nfse_queue.xml_protocol_id:
        raise HTTPException(status_code=400, detail="Chave de Acesso/Protocolo não encontrada para consulta.")
        
    try:
        client = NFSeFactory.get_provider(order.company)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    protocol_dps = nfse_queue.xml_protocol_id
    # Se for DPS 45 posicoes, é chave, senao é protocolo
    if protocol_dps and len(protocol_dps) >= 50:
        result = loop.run_until_complete(
            client.consultar_nota_por_chave(protocol_dps)
        )
    else:
        result = loop.run_until_complete(
            client.consultar_dps_por_protocolo(protocol_dps)
        )
    
    if result.get("success"):
        data = result.get("response", {})
        cancelado = result.get("is_cancelled", False)
        
        message_ret = "NFS-e Consultado"
        if cancelado and order.status_nfse != ServiceOrderNfseStatus.ERROR:
            # Auto-sync
            from app.models.service import ServiceOrderStatus
            from app.models.financial import FinancialTransaction
            
            order.status_nfse = ServiceOrderNfseStatus.ERROR
            nfse_queue.error_message = "Sincronizado via Consulta: Nota marcada como CANCELADA na base Federal."
            order.status = ServiceOrderStatus.CANCELLED
            
            txs = db.query(FinancialTransaction).filter(
                FinancialTransaction.description.like(f"%OS #{order.id}%"),
                FinancialTransaction.company_id == current_user.company_id
            ).all()
            for tx in txs:
                tx.transaction_status = "CANCELADO"
                for installment in tx.installments:
                    installment.status = "CANCELLED"
                    
            db.commit()
            message_ret = "NFS-e Cancelada! Venda Cronuz e Financeiro foram estornados automaticamente."
            
        return {"status": "success", "message": message_ret, "data": data, "xml_legivel": result.get("xml_legivel", ""), "situacao": result.get("status_serpro"), "is_cancelado": cancelado}
    else:
        print(f"SEFIN NA CONSULTA ERROU: {result}")
        raise HTTPException(status_code=400, detail=f"Erro na consulta: {result.get('error')}")

@router.post("/service-orders/{order_id}/nfse/sync")
def sync_service_order_nfse_status(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.nfse import NFSeQueue
    from app.models.service import ServiceOrderNfseStatus, ServiceOrderStatus
    from app.integrators.nfse.factory import NFSeFactory
    from app.models.financial import FinancialTransaction
    import asyncio
    
    order = db.query(ServiceOrder).filter(
        ServiceOrder.id == order_id,
        ServiceOrder.company_id == current_user.company_id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de Serviço não encontrada.")
        
    nfse_queue = db.query(NFSeQueue).filter(
        NFSeQueue.service_order_id == order.id,
        NFSeQueue.status.in_(["SUCCESS", "PROCESSING"])
    ).order_by(NFSeQueue.id.desc()).first()
    
    if not nfse_queue or not nfse_queue.xml_protocol_id:
        raise HTTPException(status_code=400, detail="Chave de Acesso/Protocolo não encontrada para consulta.")
        
    try:
        client = NFSeFactory.get_provider(order.company)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    protocol_dps = nfse_queue.xml_protocol_id
    if protocol_dps and len(protocol_dps) >= 50:
        result = loop.run_until_complete(client.consultar_nota_por_chave(protocol_dps))
    else:
        result = loop.run_until_complete(client.consultar_dps_por_protocolo(protocol_dps))
        
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=f"Erro na consulta com Serpro/Sefin Nacional: {result.get('error')}")
        
    data = result.get("response", {})
    cancelado = result.get("is_cancelled", False)
    
    if cancelado:
        # 1. Update NFSe status
        order.status_nfse = ServiceOrderNfseStatus.ERROR
        nfse_queue.error_message = "Sincronizado: Nota marcada como CANCELADA na base."
        
        # 2. Cancel Service Order
        order.status = ServiceOrderStatus.CANCELLED
        
        # 3. Cancel Financial Transactions associated through description pattern
        txs = db.query(FinancialTransaction).filter(
            FinancialTransaction.description.like(f"%OS #{order.id}%"),
            FinancialTransaction.company_id == current_user.company_id
        ).all()
        for tx in txs:
            tx.transaction_status = "CANCELADO"
            for installment in tx.installments:
                installment.status = "CANCELLED"
                
        db.commit()
        return {"status": "success", "message": "Ordem de Serviço, NFS-e e Faturamento cancelados via Sincronização Sefin"}
    else:
        return {"status": "success", "message": "Nenhuma alteração de status detectada. O Governo não acusou cancelamento."}

@router.get("/service-orders/{order_id}/details")
def get_service_order_details(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from sqlalchemy.orm import joinedload
    order = db.query(ServiceOrder).options(
        joinedload(ServiceOrder.customer),
        joinedload(ServiceOrder.service)
    ).filter(
        ServiceOrder.id == order_id,
        ServiceOrder.company_id == current_user.company_id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Service Order not found")
        
    from app.models.nfse import NFSeQueue
    from app.models.financial import FinancialTransaction
    
    nfse_history = db.query(NFSeQueue).filter(NFSeQueue.service_order_id == order.id).order_by(NFSeQueue.created_at.desc()).all()
    txs = db.query(FinancialTransaction).filter(
        FinancialTransaction.description.like(f"%OS #{order.id}%"),
        FinancialTransaction.company_id == current_user.company_id
    ).all()
    
    from app.schemas.service import ServiceOrderResponse
    resp = ServiceOrderResponse.model_validate(order).model_dump()
    resp["customer"] = {"id": order.customer.id, "name": order.customer.name, "document_number": order.customer.document} if order.customer else None
    resp["service_details"] = {"id": order.service.id, "name": order.service.name} if order.service else None
    
    resp["txs"] = [
        {
            "id": tx.id,
            "status": tx.transaction_status,
            "amount": tx.total_amount,
            "installments_count": len(tx.installments)
        } for tx in txs
    ]
    
    resp["nfse_history"] = [
        {
            "id": q.id,
            "status": q.status,
            "xml_protocol_id": q.xml_protocol_id,
            "pdf_url_link": q.pdf_url_link,
            "error_message": q.error_message,
            "created_at": q.created_at.isoformat() if q.created_at else None
        } for q in nfse_history
    ]
    
    return {"status": "success", "data": resp}

@router.post("/service-orders/{order_id}/cancel-local")
def cancel_local_service_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = db.query(ServiceOrder).filter(
        ServiceOrder.id == order_id, 
        ServiceOrder.company_id == current_user.company_id
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Service Order not found")
        
    from app.models.service import ServiceOrderNfseStatus
    if order.status_nfse in [ServiceOrderNfseStatus.ISSUED, ServiceOrderNfseStatus.PROCESSING]:
        raise HTTPException(status_code=400, detail="Esta ordem é eletrônica e possui trâmite Sefaz ativo, deve ser cancelada adequadamente pelo Governo, não localmente.")
        
    from app.models.service import ServiceOrderStatus
    from app.models.financial import FinancialTransaction
    
    if order.status == ServiceOrderStatus.CANCELLED:
        return {"status": "success", "message": "O.S já estava cancelada localmente."}
        
    order.status = ServiceOrderStatus.CANCELLED
    
    txs = db.query(FinancialTransaction).filter(
        FinancialTransaction.description.like(f"%OS #{order.id}%"),
        FinancialTransaction.company_id == current_user.company_id
    ).all()
    for tx in txs:
        tx.transaction_status = "CANCELADO"
        for installment in tx.installments:
            installment.status = "CANCELLED"
            
    db.commit()
    return {"status": "success", "message": "Ordem avulsa e faturamento cancelados com sucesso localmente."}
