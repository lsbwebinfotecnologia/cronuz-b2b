from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List

from app.db.session import get_db
from app.models.customer import Customer
from app.models.subscription import CustomerSubscription, SubscriptionPlan
from app.models.company_settings import CompanySettings
from app.core.dependencies import get_current_customer
from app.integrators.efi_pay import efi_service
from app.integrators.horus_clients import HorusClients
from typing import Optional

router = APIRouter(prefix="/me", tags=["customer_portal"])

@router.get("/subscriptions")
def get_my_subscriptions(
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    subscriptions = db.query(CustomerSubscription).filter(
        CustomerSubscription.customer_id == customer.id
    ).order_by(CustomerSubscription.created_at.desc()).all()
    
    freq_map = {
        "WEEKLY": 0.25,
        "BIWEEKLY": 0.5,
        "MONTHLY": 1,
        "BIMONTHLY": 2,
        "QUARTERLY": 3,
        "SEMIANNUAL": 6,
        "ANNUAL": 12
    }
    
    results = []
    for sub in subscriptions:
        results.append({
            "id": sub.id,
            "external_reference": sub.efi_subscription_id,
            "product_name": sub.plan.name if sub.plan else "Plano Excluído",
            "periodicity": freq_map.get(sub.plan.delivery_frequency.value, 1) if sub.plan and sub.plan.delivery_frequency else 1,
            "amount": float(sub.plan.price_per_issue) if sub.plan and sub.plan.price_per_issue else 0.0,
            "status": sub.status.value if sub.status else "UNKNOWN",
            "created_at": sub.created_at,
            "next_billing_date": None
        })
        
    return {"subscriptions": results}

@router.post("/subscriptions/{sub_id}/cancel")
def cancel_my_subscription(
    sub_id: int,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    subscription = db.query(CustomerSubscription).filter(
        CustomerSubscription.id == sub_id,
        CustomerSubscription.customer_id == customer.id
    ).first()
    
    if not subscription:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada.")
        
    if subscription.status and subscription.status.value == "CANCELLED":
        raise HTTPException(status_code=400, detail="Esta assinatura já está cancelada.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == customer.company_id).first()
    if not settings or not settings.efi_client_id or not settings.efi_client_secret:
        raise HTTPException(status_code=400, detail="Gateway de pagamento não configurado.")

    efi_service.set_credentials(
        client_id=settings.efi_client_id,
        client_secret=settings.efi_client_secret,
        certificate_path=settings.efi_certificate_path,
        sandbox=settings.efi_sandbox
    )
    
    if not subscription.efi_subscription_id:
        subscription.status = "CANCELLED"
        subscription.updated_at = datetime.utcnow()
        db.commit()
        return {"message": "Assinatura cancelada com sucesso localmente (sem vínculo Efí)."}
        
    try:
        efi_sub_id = int(subscription.efi_subscription_id)
        efi_service.cancel_subscription(subscription_id=efi_sub_id)
    except Exception as e:
        print(f"Erro ao cancelar na EFI [Sub ID: {efi_sub_id}]:", str(e))

    subscription.status = "CANCELLED"
    subscription.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Assinatura cancelada com sucesso na Efí e no sistema local."}
from typing import Optional, List
from pydantic import BaseModel

@router.get("/consignment/summary")
async def get_my_consignment_summary(
    cod_ctr: Optional[str] = None,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    try:
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == customer.company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
            
        cnpj_destino = company.document
        cnpj_cliente = customer.document        
        id_guid = customer.id_guid if customer.id_guid else ""
        if not id_guid:
            from app.models.company_settings import CompanySettings
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == customer.company_id).first()
            id_guid = settings.horus_default_b2b_guid if settings and settings.horus_default_b2b_guid else ""

        
        try:
            horus_client = HorusClients(db, company.id)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
            
        try:
            result = await horus_client.get_consignment_summary(
                cnpj_destino=cnpj_destino,
                cnpj_cliente=cnpj_cliente,
                id_guid=id_guid,
                cod_ctr=cod_ctr
            )
        except HTTPException as e:
            if e.status_code == 404:
                result = []
            else:
                raise e
        finally:
            await horus_client.close()
        
        if isinstance(result, list):
            if len(result) > 0 and result[0].get("Falha"):
                raise HTTPException(status_code=400, detail=result[0].get("Mensagem", "Erro na API Horus"))
            return result
        elif isinstance(result, dict) and result.get("Falha"):
            raise HTTPException(status_code=400, detail=result.get("Mensagem", "Erro na API Horus"))
            
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/consignment/details")
async def get_my_consignment_details(
    cod_ctr: Optional[str] = None,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    try:
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == customer.company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
            
        cnpj_destino = company.document
        cnpj_cliente = customer.document        
        id_guid = customer.id_guid if customer.id_guid else ""
        if not id_guid:
            from app.models.company_settings import CompanySettings
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == customer.company_id).first()
            id_guid = settings.horus_default_b2b_guid if settings and settings.horus_default_b2b_guid else ""

        
        try:
            horus_client = HorusClients(db, company.id)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
            
        try:
            result = await horus_client.get_consignment_details(
                cnpj_destino=cnpj_destino,
                cnpj_cliente=cnpj_cliente,
                id_guid=id_guid,
                cod_ctr=cod_ctr
            )
        except HTTPException as e:
            if e.status_code == 404:
                result = []
            else:
                raise e
        finally:
            await horus_client.close()
        
        if isinstance(result, list):
            if len(result) > 0 and result[0].get("Falha"):
                raise HTTPException(status_code=400, detail=result[0].get("Mensagem", "Erro na API Horus"))
            return result
        elif isinstance(result, dict) and result.get("Falha"):
            raise HTTPException(status_code=400, detail=result.get("Mensagem", "Erro na API Horus"))
            
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from typing import Optional, List
from pydantic import BaseModel

class ConsignmentSubmitItem(BaseModel):
    BARRAS_ISBN: str
    QTD: str

class ConsignmentSubmitRequest(BaseModel):
    tipo_a_d: str
    items: List[ConsignmentSubmitItem]
    cod_ctr: Optional[str] = None

@router.post("/consignment/submit")
async def submit_my_consignment(
    payload: ConsignmentSubmitRequest,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    try:
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == customer.company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
            
        cnpj_destino = company.document
        cnpj_cliente = customer.document        
        id_guid = customer.id_guid if customer.id_guid else ""
        if not id_guid:
            from app.models.company_settings import CompanySettings
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == customer.company_id).first()
            id_guid = settings.horus_default_b2b_guid if settings and settings.horus_default_b2b_guid else ""

        
        if payload.tipo_a_d not in ["A", "D"]:
            raise HTTPException(status_code=400, detail="Invalid tipo_a_d parameters. Must be 'A' or 'D'.")
            
        items_dict = [item.model_dump() for item in payload.items]
        
        try:
            horus_client = HorusClients(db, company.id)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
            
        result = await horus_client.submit_consignment(
            cnpj_destino=cnpj_destino,
            cnpj_cliente=cnpj_cliente,
            id_guid=id_guid,
            tipo_a_d=payload.tipo_a_d,
            items=items_dict,
            cod_ctr=payload.cod_ctr
        )
        await horus_client.close()
        
        if isinstance(result, list):
            if len(result) > 0 and result[0].get("Falha") and "CONTRATO BLOQUEADO" in str(result[0].get("Mensagem", "")):
                 raise HTTPException(status_code=400, detail=result[0].get("Mensagem"))
                 
        elif isinstance(result, dict) and result.get("Falha"):
            raise HTTPException(status_code=400, detail=result.get("Mensagem", "Erro na API Horus"))
            
        # Update draft to COMPLETED
        from app.models.consignment_draft import ConsignmentDraft
        draft = db.query(ConsignmentDraft).filter(
            ConsignmentDraft.company_id == company.id,
            ConsignmentDraft.cnpj_cliente == cnpj_cliente,
            ConsignmentDraft.cod_ctr == (payload.cod_ctr or ""),
            ConsignmentDraft.status == "DRAFT"
        ).first()
        if draft:
            draft.status = "COMPLETED"
            db.commit()

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ConsignmentDraftRequestCustomer(BaseModel):
    cod_ctr: str
    operation_type: str
    items_json: list

@router.get("/consignment/draft")
async def get_my_consignment_draft(
    cod_ctr: str,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    from app.models.consignment_draft import ConsignmentDraft
    draft = db.query(ConsignmentDraft).filter(
        ConsignmentDraft.company_id == customer.company_id,
        ConsignmentDraft.cnpj_cliente == customer.document,
        ConsignmentDraft.cod_ctr == cod_ctr,
        ConsignmentDraft.status == "DRAFT"
    ).first()
    if not draft:
        return {"items_json": [], "operation_type": "A"}
    return {"items_json": draft.items_json, "operation_type": draft.operation_type}

@router.post("/consignment/draft")
async def save_my_consignment_draft(
    payload: ConsignmentDraftRequestCustomer,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    from app.models.consignment_draft import ConsignmentDraft
    draft = db.query(ConsignmentDraft).filter(
        ConsignmentDraft.company_id == customer.company_id,
        ConsignmentDraft.cnpj_cliente == customer.document,
        ConsignmentDraft.cod_ctr == payload.cod_ctr,
        ConsignmentDraft.status == "DRAFT"
    ).first()
    
    if draft:
        draft.operation_type = payload.operation_type
        draft.items_json = payload.items_json
    else:
        draft = ConsignmentDraft(
            company_id=customer.company_id,
            cnpj_cliente=customer.document,
            cod_ctr=payload.cod_ctr,
            operation_type=payload.operation_type,
            items_json=payload.items_json
        )
        db.add(draft)
    
    db.commit()
    return {"success": True}

@router.get("/invoices")
async def get_my_invoices(
    data_ini: str,
    data_fim: str,
    xml_base64: str = "N",
    cod_pedido_origem: Optional[str] = None,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    try:
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == customer.company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
            
        cnpj_destino = company.document
        cnpj_cliente = customer.document        
        id_guid = customer.id_guid if customer.id_guid else ""
        if not id_guid:
            from app.models.company_settings import CompanySettings
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == customer.company_id).first()
            id_guid = settings.horus_default_b2b_guid if settings and settings.horus_default_b2b_guid else ""

        horus_client = HorusClients(db, company.id)
        result = await horus_client.get_customer_invoices(
            cnpj_destino=cnpj_destino,
            cnpj_cliente=cnpj_cliente,
            id_guid=id_guid,
            data_ini=data_ini,
            data_fim=data_fim,
            xml_base64=xml_base64,
            cod_pedido_origem=cod_pedido_origem
        )
        await horus_client.close()
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/debits")
async def get_my_debits(
    data_ini: str,
    data_fim: str,
    arq_base64: str = "N",
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    try:
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == customer.company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
            
        cnpj_destino = company.document
        cnpj_cliente = customer.document        
        id_guid = customer.id_guid if customer.id_guid else ""
        if not id_guid:
            from app.models.company_settings import CompanySettings
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == customer.company_id).first()
            id_guid = settings.horus_default_b2b_guid if settings and settings.horus_default_b2b_guid else ""

        horus_client = HorusClients(db, company.id)
        result = await horus_client.get_customer_debits(
            cnpj_destino=cnpj_destino,
            cnpj_cliente=cnpj_cliente,
            id_guid=id_guid,
            data_ini=data_ini,
            data_fim=data_fim,
            arq_base64=arq_base64
        )
        await horus_client.close()
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
