from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
import pytz

from app.db.session import get_db
from app.models.subscription import SubscriptionPlan, CustomerSubscription, SubscriptionBilling
from app.models.company import Company
from app.models.user import User
from app.core import security
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

def get_current_br_time():
    return datetime.now(pytz.timezone('America/Sao_Paulo'))

# ----------------- ADMIN SELLER CRUD -----------------

@router.get("")
def list_subscription_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.user import UserRole
    if current_user.type != UserRole.SELLER:
        raise HTTPException(status_code=403, detail="Acesso restrito a vendedores")
        
    plans = db.query(SubscriptionPlan).filter(SubscriptionPlan.company_id == current_user.company_id).all()
    
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "price_per_issue": float(p.price_per_issue) if p.price_per_issue else 0.0,
            "issues_per_delivery": p.issues_per_delivery,
            "delivery_frequency": p.delivery_frequency,
            "max_subscribers_limit": p.max_subscribers_limit,
            "current_subscribers_count": p.current_subscribers_count,
            "presale_discount_percent": float(p.presale_discount_percent) if p.presale_discount_percent else 0.0,
            "launch_discount_percent": float(p.launch_discount_percent) if p.launch_discount_percent else 0.0,
            "postlaunch_discount_percent": float(p.postlaunch_discount_percent) if p.postlaunch_discount_percent else 0.0,
            "is_active": p.is_active,
            "hotsite_slug": p.hotsite_slug
        } for p in plans
    ]

@router.post("")
def create_subscription_plan(
    plan_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.user import UserRole
    if current_user.type != UserRole.SELLER:
        raise HTTPException(status_code=403, detail="Acesso restrito a vendedores")
        
    # Basic data mapping from dict
    new_plan = SubscriptionPlan(
        company_id=current_user.company_id,
        name=plan_data.get("name"),
        description=plan_data.get("description"),
        price_per_issue=plan_data.get("price_per_issue"),
        issues_per_delivery=plan_data.get("issues_per_delivery", 1),
        max_subscribers_limit=plan_data.get("max_subscribers_limit"),
        presale_discount_percent=plan_data.get("presale_discount_percent", 0),
        launch_discount_percent=plan_data.get("launch_discount_percent", 0),
        postlaunch_discount_percent=plan_data.get("postlaunch_discount_percent", 0),
        is_active=plan_data.get("is_active", True),
        hotsite_slug=plan_data.get("hotsite_slug"),
        hotsite_config=plan_data.get("hotsite_config")
    )
    
    db.add(new_plan)
    db.commit()
    db.refresh(new_plan)
    
    return {
        "id": new_plan.id,
        "name": new_plan.name,
        "description": new_plan.description,
        "price_per_issue": float(new_plan.price_per_issue) if new_plan.price_per_issue else 0.0,
        "issues_per_delivery": new_plan.issues_per_delivery,
        "delivery_frequency": new_plan.delivery_frequency,
        "max_subscribers_limit": new_plan.max_subscribers_limit,
        "current_subscribers_count": new_plan.current_subscribers_count,
        "presale_discount_percent": float(new_plan.presale_discount_percent) if new_plan.presale_discount_percent else 0.0,
        "launch_discount_percent": float(new_plan.launch_discount_percent) if new_plan.launch_discount_percent else 0.0,
        "postlaunch_discount_percent": float(new_plan.postlaunch_discount_percent) if new_plan.postlaunch_discount_percent else 0.0,
        "is_active": new_plan.is_active,
        "hotsite_slug": new_plan.hotsite_slug
    }

@router.get("/{plan_id}")
def get_subscription_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.user import UserRole
    if current_user.type != UserRole.SELLER:
        raise HTTPException(status_code=403, detail="Acesso restrito a vendedores")
        
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.id == plan_id,
        SubscriptionPlan.company_id == current_user.company_id
    ).first()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
        
    return {
        "id": plan.id,
        "name": plan.name,
        "description": plan.description,
        "price_per_issue": float(plan.price_per_issue) if plan.price_per_issue else 0.0,
        "issues_per_delivery": plan.issues_per_delivery,
        "delivery_frequency": plan.delivery_frequency,
        "max_subscribers_limit": plan.max_subscribers_limit,
        "current_subscribers_count": plan.current_subscribers_count,
        "presale_discount_percent": float(plan.presale_discount_percent) if plan.presale_discount_percent else 0.0,
        "launch_discount_percent": float(plan.launch_discount_percent) if plan.launch_discount_percent else 0.0,
        "postlaunch_discount_percent": float(plan.postlaunch_discount_percent) if plan.postlaunch_discount_percent else 0.0,
        "is_active": plan.is_active,
        "hotsite_slug": plan.hotsite_slug,
        "hotsite_config": plan.hotsite_config or {}
    }

@router.put("/{plan_id}")
def update_subscription_plan(
    plan_id: int,
    plan_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.user import UserRole
    if current_user.type != UserRole.SELLER:
        raise HTTPException(status_code=403, detail="Acesso restrito a vendedores")
        
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.id == plan_id,
        SubscriptionPlan.company_id == current_user.company_id
    ).first()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
        
    if "name" in plan_data: plan.name = plan_data["name"]
    if "description" in plan_data: plan.description = plan_data["description"]
    if "price_per_issue" in plan_data: plan.price_per_issue = plan_data["price_per_issue"]
    if "issues_per_delivery" in plan_data: plan.issues_per_delivery = plan_data["issues_per_delivery"]
    if "max_subscribers_limit" in plan_data: plan.max_subscribers_limit = plan_data["max_subscribers_limit"]
    if "presale_discount_percent" in plan_data: plan.presale_discount_percent = plan_data["presale_discount_percent"]
    if "launch_discount_percent" in plan_data: plan.launch_discount_percent = plan_data["launch_discount_percent"]
    if "postlaunch_discount_percent" in plan_data: plan.postlaunch_discount_percent = plan_data["postlaunch_discount_percent"]
    if "is_active" in plan_data: plan.is_active = plan_data["is_active"]
    if "hotsite_slug" in plan_data: plan.hotsite_slug = plan_data["hotsite_slug"]
    if "hotsite_config" in plan_data: plan.hotsite_config = plan_data["hotsite_config"]
    
    db.commit()
    return {"message": "Plano atualizado com sucesso"}

# ----------------- PUBLIC API (HOTSITE) -----------------

@router.get("/hotsite/{slug}")
def get_hotsite_config(slug: str, db: Session = Depends(get_db)):
    """
    Public Route: Used by the Next.js /h/[slug] pages to build the Hotsite
    and determine dynamic pricing based on the current Phase (Pré-venda, etc.)
    """
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.hotsite_slug == slug,
        SubscriptionPlan.is_active == True
    ).first()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Hotsite não encontrado ou inativo.")
        
    company = db.query(Company).filter(Company.id == plan.company_id).first()
    
    # 1. Determine Availability / Urgency
    is_sold_out = False
    is_near_limit = False
    remaining_spots = None
    
    if plan.max_subscribers_limit is not None:
        remaining_spots = plan.max_subscribers_limit - plan.current_subscribers_count
        if remaining_spots <= 0:
            is_sold_out = True
            remaining_spots = 0
        elif remaining_spots <= 10:
            is_near_limit = True
            
    # 2. Determine Current Active Phase Discount (For 1st delivery only)
    now = get_current_br_time()
    
    # Initialize with Post-Launch as base
    current_phase = "POST-LAUNCH"
    active_discount_percent = float(plan.postlaunch_discount_percent or 0)
    
    # Check backwards: Presale -> Launch -> PostLaunch
    # Assumes postlaunch > launch > presale logically
    has_postlaunch = plan.postlaunch_date is not None
    has_launch = plan.launch_date is not None
    has_presale = plan.presale_start_date is not None
    
    # Prioritise finding which bracket "now" falls into
    if has_presale and now >= plan.presale_start_date and (not has_launch or now < plan.launch_date):
        current_phase = "PRE-SALE"
        active_discount_percent = float(plan.presale_discount_percent or 0)
    elif has_launch and now >= plan.launch_date and (not has_postlaunch or now < plan.postlaunch_date):
        current_phase = "LAUNCH"
        active_discount_percent = float(plan.launch_discount_percent or 0)
    elif has_postlaunch and now >= plan.postlaunch_date:
        current_phase = "POST-LAUNCH"
        active_discount_percent = float(plan.postlaunch_discount_percent or 0)
    else:
        # Pre-pre-sale edge case, or no dates defined at all
        if not has_presale and not has_launch and not has_postlaunch:
             current_phase = "STANDARD"
             active_discount_percent = 0.0
        elif has_presale and now < plan.presale_start_date:
             current_phase = "WAITING_LIST"
             active_discount_percent = float(plan.presale_discount_percent or 0)

    base_price_per_issue = float(plan.price_per_issue)
    issues_qty = plan.issues_per_delivery
    
    # Calculate First Delivery Price
    first_delivery_full_price = base_price_per_issue * issues_qty
    discount_amount = first_delivery_full_price * (active_discount_percent / 100)
    first_delivery_discounted_price = first_delivery_full_price - discount_amount
    
    # Future Deliveries Price
    standard_delivery_price = first_delivery_full_price
    
    # Compose Response Payload
    return {
        "id": plan.id,
        "company_id": plan.company_id,
        "company_name": company.name if company else "",
        "name": plan.name,
        "description": plan.description,
        "config": plan.hotsite_config or {},
        "status": {
            "is_sold_out": is_sold_out,
            "is_near_limit": is_near_limit,
            "remaining_spots": remaining_spots,
            "current_phase": current_phase,
        },
        "pricing": {
            "base_issue_price": base_price_per_issue,
            "issues_per_delivery": issues_qty,
            "first_delivery": {
                "full_price": first_delivery_full_price,
                "discount_percent": active_discount_percent,
                "discount_amount": discount_amount,
                "final_price": first_delivery_discounted_price
            },
            "future_deliveries": {
                "price": standard_delivery_price
            }
        }
    }

class SubscribeRequest(BaseModel):
    customer_name: str
    customer_document: str # CNPJ/CPF
    email: str
    phone: str
    payment_method: str = "PIX"
    shipping_zip_code: str
    shipping_street: str
    shipping_number: str
    shipping_complement: Optional[str] = None
    shipping_neighborhood: str
    shipping_city: str
    shipping_state: str

@router.post("/hotsite/{slug}/subscribe")
def subscribe_to_plan(slug: str, payload: SubscribeRequest, db: Session = Depends(get_db)):
    """
    Creates a CustomerSubscription row and generates the first Delivery EFI charge.
    """
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.hotsite_slug == slug,
        SubscriptionPlan.is_active == True
    ).first()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado.")
        
    # Check limit again to prevent race conditions (locking not implemented in this prototype)
    if plan.max_subscribers_limit is not None and plan.current_subscribers_count >= plan.max_subscribers_limit:
        raise HTTPException(status_code=400, detail="Esgotado! Limite máximo de assinaturas atingido.")

    # In a full flow, we would register or look up the crm_customer here.
    # For now, we mock the customer ID as 1 for prototype purposes.
    mock_customer_id = 1
    
    config = get_hotsite_config(slug, db)
    first_delivery_price = config["pricing"]["first_delivery"]["final_price"]
    
    # 1. Create the base Subscription Link
    sub = CustomerSubscription(
        company_id=plan.company_id,
        customer_id=mock_customer_id,
        plan_id=plan.id,
        current_delivery_number=1,
        status="ACTIVE",
        shipping_zip_code=payload.shipping_zip_code,
        shipping_street=payload.shipping_street,
        shipping_number=payload.shipping_number,
        shipping_complement=payload.shipping_complement,
        shipping_neighborhood=payload.shipping_neighborhood,
        shipping_city=payload.shipping_city,
        shipping_state=payload.shipping_state
    )
    db.add(sub)
    db.flush() # get sub.id
    
    # 2. Increment Stock/Count Limit
    plan.current_subscribers_count += 1
    
    # 3. Handle Payment Method
    txid = None
    qr_data = {}
    bill_status = "PENDING"
    
    if payload.payment_method == "CREDIT_CARD":
        import uuid
        txid = f"CC-MOCK-{uuid.uuid4().hex[:8]}"
        bill_status = "PAID"
    else:
        # Request PIX Charge from EFI
        from app.integrators.efi_pay import efi_service
        
        pix_charge = efi_service.create_pix_charge(
            amount=first_delivery_price,
            customer_name=payload.customer_name,
            customer_document=payload.customer_document
        )
        
        pix_loc_id = pix_charge.get("loc", {}).get("id")
        txid = pix_charge.get("txid")
        
        # Generate the QR Code payload utilizing the newly created ID
        qr_data = efi_service.generate_pix_qrcode(loc_id=pix_loc_id)
        
    # 4. Create the Subscription Billing history
    bill = SubscriptionBilling(
        subscription_id=sub.id,
        delivery_number=1,
        efi_charge_id=txid,
        amount=first_delivery_price,
        status=bill_status,
        due_date=get_current_br_time()
    )
    db.add(bill)
    db.commit()
    
    payment_response = {
         "txid": txid,
         "amount": first_delivery_price,
         "method": payload.payment_method
    }
    
    if payload.payment_method == "PIX":
        payment_response["qrcode_image"] = qr_data.get("imagemQrcode")
        payment_response["qrcode_string"] = qr_data.get("qrcode")
        
    return {
        "message": "Assinatura gerada com sucesso",
        "subscription_id": sub.id,
        "payment": payment_response
    }

@router.post("/webhook/efi")
async def efi_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Receives notification from EFI Gerencianet regarding PIX payment status.
    Must validate and process the `SubscriptionBilling` record.
    """
    payload = await request.json()
    
    # Logic to handle the EFI webhook payload iterating over Pix entries
    pix_events = payload.get("pix", [])
    
    for event in pix_events:
        txid = event.get("txid")
        
        # Find the billing ticket
        bill = db.query(SubscriptionBilling).filter(SubscriptionBilling.efi_charge_id == txid).first()
        
        if bill and bill.status != "PAID":
             bill.status = "PAID"
             bill.paid_at = get_current_br_time()
             bill.efi_transaction_id = event.get("endToEndId")
             
             # The subscription could trigger an order generation in Horus here
             print(f"WEBHOOK: Assinatura {bill.subscription_id} - Entrega {bill.delivery_number} Paga!")
             
    db.commit()
    return {"status": "success"}
