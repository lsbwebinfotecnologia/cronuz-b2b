from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.integrators.horus_clients import HorusClients
from typing import Optional, List
from app.core.dependencies import get_current_customer
from app.models.customer import Customer
from datetime import datetime, timezone, timedelta
from app.models.subscription import CustomerSubscription, SubscriptionPlan, SubscriptionBilling
from app.models.company_settings import CompanySettings
from app.integrators.efi_pay import efi_service

router = APIRouter(prefix="/me", tags=["customer_portal"])

def get_current_br_time():
    tz = timezone(timedelta(hours=-3))
    return datetime.now(tz)

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

@router.get("/subscriptions/{sub_id}")
def get_my_subscription_detail(
    sub_id: int,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    sub = db.query(CustomerSubscription).filter(
        CustomerSubscription.id == sub_id,
        CustomerSubscription.customer_id == customer.id
    ).first()
    
    if not sub:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
        
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == sub.plan_id).first()
    
    efi_sync_err = None
    if sub.efi_subscription_id:
        from app.integrators.efi_pay import EFIPayIntegration
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == sub.company_id).first()
        try:
            efi_srv = EFIPayIntegration(
                client_id=settings.efi_client_id if settings else None,
                client_secret=settings.efi_client_secret if settings else None,
                sandbox=settings.efi_sandbox if settings else None,
                certificate_path=settings.efi_certificate_path if settings else None,
                pix_key=settings.efi_payee_code if settings else None
            )
            efi_data = efi_srv.detail_subscription(int(sub.efi_subscription_id))
            
            if 'data' in efi_data:
                efi_status = efi_data['data'].get("status", "").lower()
                local_status = str(sub.status.value) if hasattr(sub.status, 'value') else str(sub.status)
                status_map = {"active": "ACTIVE", "canceled": "CANCELED", "expired": "CANCELED"}
                mapped_status = status_map.get(efi_status)
                if mapped_status and mapped_status != local_status:
                    sub.status = mapped_status
                    db.commit()
                
                efi_history = efi_data['data'].get("history", [])
                local_billings = db.query(SubscriptionBilling).filter(SubscriptionBilling.subscription_id == sub.id).all()
                local_charge_ids = [str(b.efi_charge_id) for b in local_billings if b.efi_charge_id]
                
                try: efi_history = sorted(efi_history, key=lambda x: int(x.get('charge_id', 0)))
                except: pass
                
                max_delivery_number = int(max([b.delivery_number for b in local_billings])) if local_billings else 0
                has_changes = False
                
                for charge in efi_history:
                    charge_id = str(charge.get('charge_id'))
                    charge_status = str(charge.get('status', '')).lower()
                    charge_value = float(charge.get('value', 0)) / 100.0 if charge.get('value') else 0.0
                    
                    c_status_map = {
                        "paid": "PAID", "settled": "PAID", "active": "PAID", "approved": "PAID",
                        "waiting": "PENDING", "unpaid": "PENDING",
                        "canceled": "FAILED", "failed": "FAILED", "refused": "FAILED"
                    }
                    mapped_charge_status = c_status_map.get(charge_status, "PENDING")
                    
                    if charge_id not in local_charge_ids:
                        max_delivery_number += 1
                        new_bill = SubscriptionBilling(
                            subscription_id=sub.id,
                            delivery_number=max_delivery_number,
                            amount=charge_value,
                            status=mapped_charge_status,
                            efi_charge_id=charge_id,
                            due_date=get_current_br_time()
                        )
                        if mapped_charge_status == "PAID":
                            new_bill.paid_at = get_current_br_time()
                        db.add(new_bill)
                        has_changes = True
                    else:
                        existing_bill = next((b for b in local_billings if str(b.efi_charge_id) == charge_id), None)
                        if existing_bill:
                            current_c_status = str(existing_bill.status.value) if hasattr(existing_bill.status, 'value') else str(existing_bill.status)
                            if current_c_status != mapped_charge_status:
                                existing_bill.status = mapped_charge_status
                                if mapped_charge_status == "PAID" and not existing_bill.paid_at:
                                    existing_bill.paid_at = get_current_br_time()
                                has_changes = True
                                
                if has_changes:
                    sub.current_delivery_number = max_delivery_number
                    db.commit()
        except Exception as e:
            db.rollback()
            print(f"[EFI SYNC ERR] {str(e)}", flush=True)

    billings = db.query(SubscriptionBilling).filter(
        SubscriptionBilling.subscription_id == sub.id
    ).order_by(SubscriptionBilling.delivery_number.desc()).all()
    
    billings_data = []
    for b in billings:
        billings_data.append({
            "id": b.id,
            "delivery_number": b.delivery_number,
            "amount": float(b.amount) if b.amount else 0,
            "status": b.status.value if hasattr(b.status, 'value') else b.status,
            "efi_charge_id": b.efi_charge_id,
            "due_date": b.due_date.isoformat() if b.due_date else None,
            "paid_at": b.paid_at.isoformat() if b.paid_at else None
        })
        
    return {
        "id": sub.id,
        "plan_name": plan.name if plan else "Desconhecido",
        "plan_frequency": plan.delivery_frequency.value if (plan and hasattr(plan.delivery_frequency, 'value')) else "MONTHLY",
        "status": sub.status.value if hasattr(sub.status, 'value') else sub.status,
        "current_delivery": sub.current_delivery_number,
        "shipping_address": {
            "street": sub.shipping_street,
            "number": sub.shipping_number,
            "complement": sub.shipping_complement,
            "neighborhood": sub.shipping_neighborhood,
            "city": sub.shipping_city,
            "state": sub.shipping_state,
            "zipcode": sub.shipping_zip_code
        },
        "created_at": sub.created_at.isoformat() if sub.created_at else None,
        "billings": billings_data
    }

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
                err_msg = result[0].get("Mensagem", "Erro na API Horus")
                raise HTTPException(status_code=400, detail=f"{err_msg} | Params: DEST={cnpj_destino} CLI={cnpj_cliente} GUID={id_guid}")
            return result
        elif isinstance(result, dict) and result.get("Falha"):
            err_msg = result.get("Mensagem", "Erro na API Horus")
            raise HTTPException(status_code=400, detail=f"{err_msg} | Params: DEST={cnpj_destino} CLI={cnpj_cliente} GUID={id_guid}")
            
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
