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
