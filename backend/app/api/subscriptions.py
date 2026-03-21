from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from app.db.session import get_db
from app.models.subscription import SubscriptionPlan, CustomerSubscription, SubscriptionBilling
from app.models.company import Company
from app.models.user import User
from app.core import security
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

def get_current_br_time():
    return datetime.now(ZoneInfo('America/Sao_Paulo'))

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
            "presale_start_date": p.presale_start_date.isoformat() if p.presale_start_date else None,
            "launch_date": p.launch_date.isoformat() if p.launch_date else None,
            "postlaunch_date": p.postlaunch_date.isoformat() if p.postlaunch_date else None,
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
        presale_start_date=datetime.fromisoformat(plan_data["presale_start_date"].replace('Z', '+00:00')) if plan_data.get("presale_start_date") else None,
        launch_date=datetime.fromisoformat(plan_data["launch_date"].replace('Z', '+00:00')) if plan_data.get("launch_date") else None,
        postlaunch_date=datetime.fromisoformat(plan_data["postlaunch_date"].replace('Z', '+00:00')) if plan_data.get("postlaunch_date") else None,
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
        "presale_start_date": new_plan.presale_start_date.isoformat() if new_plan.presale_start_date else None,
        "launch_date": new_plan.launch_date.isoformat() if new_plan.launch_date else None,
        "postlaunch_date": new_plan.postlaunch_date.isoformat() if new_plan.postlaunch_date else None,
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
        "presale_start_date": plan.presale_start_date.isoformat() if plan.presale_start_date else None,
        "launch_date": plan.launch_date.isoformat() if plan.launch_date else None,
        "postlaunch_date": plan.postlaunch_date.isoformat() if plan.postlaunch_date else None,
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
    if "presale_start_date" in plan_data: plan.presale_start_date = datetime.fromisoformat(plan_data["presale_start_date"].replace('Z', '+00:00')) if plan_data["presale_start_date"] else None
    if "launch_date" in plan_data: plan.launch_date = datetime.fromisoformat(plan_data["launch_date"].replace('Z', '+00:00')) if plan_data["launch_date"] else None
    if "postlaunch_date" in plan_data: plan.postlaunch_date = datetime.fromisoformat(plan_data["postlaunch_date"].replace('Z', '+00:00')) if plan_data["postlaunch_date"] else None
    if "is_active" in plan_data: plan.is_active = plan_data["is_active"]
    if "hotsite_slug" in plan_data: plan.hotsite_slug = plan_data["hotsite_slug"]
    if "hotsite_config" in plan_data: plan.hotsite_config = plan_data["hotsite_config"]
    
    db.commit()
    return {"message": "Plano atualizado com sucesso"}

@router.get("/hotsite/tenant")
def get_company_custom_domain(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.user import UserRole
    if current_user.type != UserRole.SELLER:
         raise HTTPException(status_code=403, detail="Acesso restrito a vendedores")
         
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company:
         raise HTTPException(status_code=404, detail="Empresa não encontrada")
         
    return {"custom_domain": company.custom_domain or ""}

@router.put("/hotsite/tenant")
def update_company_custom_domain(
    domain_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.user import UserRole
    if current_user.type != UserRole.SELLER:
         raise HTTPException(status_code=403, detail="Acesso restrito a vendedores")
         
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company:
         raise HTTPException(status_code=404, detail="Empresa não encontrada")
         
    custom_domain = domain_data.get("custom_domain")
    
    # Simple validation
    if custom_domain:
        custom_domain = custom_domain.strip().lower()
        if custom_domain.startswith("http://") or custom_domain.startswith("https://"):
            custom_domain = custom_domain.split("//")[1]
        custom_domain = custom_domain.split("/")[0] # remove paths
        
    company.custom_domain = custom_domain or None
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Este domínio já pode estar em uso por outra empresa.")
        
    return {"message": "Domínio atualizado com sucesso", "custom_domain": company.custom_domain}

# ----------------- PUBLIC API (HOTSITE) -----------------

@router.get("/hotsite_by_company/{company_id}")
def get_hotsite_config_by_company(company_id: int, db: Session = Depends(get_db)):
    """
    Public Route: Used by Custom Domains to fetch the primary Hotsite for a Company
    DEPRECATED: Custom Domains now use the Hub Storefront
    """
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.company_id == company_id,
        SubscriptionPlan.is_active == True
    ).first()
    
    if not plan:
         raise HTTPException(status_code=404, detail="Nenhum Hotsite ativo encontrado para esta empresa.")
         
    return get_hotsite_config(plan.hotsite_slug, db)

@router.get("/hub/{company_id}")
def get_company_hub_plans(company_id: int, db: Session = Depends(get_db)):
    """
    Public Route: Fetch all active plans for a given company to display on the domain Hub.
    """
    plans = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.company_id == company_id,
        SubscriptionPlan.is_active == True
    ).order_by(SubscriptionPlan.created_at.desc()).all()
    
    result = []
    for plan in plans:
        raw_config = plan.hotsite_config or {}
        blocks = raw_config.get("blocks", [])
        
        cover_image = raw_config.get("heroImage")
        if not cover_image:
             for b in blocks:
                 if b.get("type") in ["BANNER", "TEXT_IMAGE"] and b.get("imageUrl"):
                     cover_image = b.get("imageUrl")
                     break
                     
        result.append({
            "id": plan.id,
            "name": plan.name,
            "description": plan.description,
            "hotsite_slug": plan.hotsite_slug,
            "cover_image": cover_image,
            "payment_frequency": plan.delivery_frequency.value if plan.delivery_frequency else "MONTHLY",
            "price_per_issue": float(plan.price_per_issue) if plan.price_per_issue else 0,
            "issues_per_delivery": plan.issues_per_delivery
        })
        
    company = db.query(Company).filter(Company.id == company_id).first()
    
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    
    hub_config = {
        "company_name": company.name if company else "",
        "logo_url": settings.logo_url if settings and hasattr(settings, 'logo_url') else None,
        "banner_url": settings.cover_image_base_url if settings and hasattr(settings, 'cover_image_base_url') else None,
        "plans": result
    }
    
    return hub_config

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
    
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == plan.company_id).first()
    
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
        "efi_settings": {
            "payee_code": settings.efi_payee_code if settings else None,
            "sandbox": settings.efi_sandbox if settings else True,
        },
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
    payment_token: str # Required for CREDIT_CARD recurrent
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

    # 1. Resolve CRM Customer
    from app.models.customer import Customer
    customer = db.query(Customer).filter(
        Customer.company_id == plan.company_id,
        Customer.document == payload.customer_document
    ).first()
    
    if not customer:
        customer = Customer(
            company_id=plan.company_id,
            name=payload.customer_name,
            document=payload.customer_document,
            email=payload.email,
            phone=payload.phone,
            customer_type="SUBSCRIBER",
            corporate_name=payload.customer_name # fallback
        )
        db.add(customer)
        db.flush() # get ID
        
    resolved_customer_id = customer.id
    
    config = get_hotsite_config(slug, db)
    first_delivery_price = config["pricing"]["first_delivery"]["final_price"]
    
    # 1. Create the base Subscription Link
    sub = CustomerSubscription(
        company_id=plan.company_id,
        customer_id=resolved_customer_id,
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
    
    # 3. Handle EFI Subscription Flow
    txid = None
    bill_status = "PENDING"
    
    # Setup dynamic EFI Service for the Company
    from app.integrators.efi_pay import EFIPayIntegration
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == plan.company_id).first()
    
    efi_service = EFIPayIntegration(
        client_id=settings.efi_client_id if settings else None,
        client_secret=settings.efi_client_secret if settings else None,
        sandbox=settings.efi_sandbox if settings else None,
        certificate_path=settings.efi_certificate_path if settings else None,
        pix_key=settings.efi_payee_code if settings else None
    )
    
    # 3.1 Create EFI Plan if it doesn't exist
    if not plan.efi_plan_id:
        try:
            efi_plan = efi_service.create_plan(
                name=f"{plan.name} - Assinatura",
                amount=first_delivery_price
            )
            print("EFI PLAN CREATION RESPONSE:", efi_plan, flush=True)
            if 'data' not in efi_plan:
                raise Exception(f"Resposta inesperada da Efí ao criar plano: {efi_plan}")
            plan.efi_plan_id = int(efi_plan['data']['plan_id'])
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Erro ao criar Plano na EFI: {str(e)}")
            
    # 3.2 Create EFI Subscription (Link customer to Plan)
    try:
        items = [{
            "name": "Fascículos mensais",
            "amount": 1,
            "value": int(first_delivery_price * 100) # Cents
        }]
        efi_sub = efi_service.create_subscription(
            plan_id=plan.efi_plan_id,
            items=items,
            customer_name=payload.customer_name,
            customer_document=payload.customer_document,
            customer_email=payload.email,
            customer_phone=payload.phone
        )
        print("EFI SUB CREATION RESPONSE:", efi_sub, flush=True)
        if 'data' not in efi_sub:
             raise Exception(f"Resposta inesperada da Efí ao criar assinatura: {efi_sub}")
        sub.efi_subscription_id = int(efi_sub['data']['subscription_id'])
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Erro ao criar Assinatura na EFI: {str(e)}")
        
    # 3.3 Pay EFI Subscription via Credit Card
    try:
        bill_addr = {
            'street': payload.shipping_street,
            'number': payload.shipping_number,
            'neighborhood': payload.shipping_neighborhood,
            'zipcode': payload.shipping_zip_code,
            'city': payload.shipping_city,
            'state': payload.shipping_state
        }
        efi_payment = efi_service.pay_subscription(
            subscription_id=sub.efi_subscription_id,
            payment_token=payload.payment_token,
            billing_address=bill_addr,
            customer_name=payload.customer_name,
            customer_document=payload.customer_document,
            customer_email=payload.email,
            customer_phone=payload.phone
        )
        print("EFI PAYMENT EXECUTION RESPONSE:", efi_payment, flush=True)
         
        if 'data' in efi_payment and 'status' in efi_payment['data']:
            status = efi_payment['data']['status']
            if status in ['paid', 'approved', 'authorized', 'active']:
                bill_status = "PAID"
            else:
                bill_status = "PENDING"
        else:
            raise Exception(f"Unmapped status on payment: {efi_payment}")
             
    except Exception as e:
        # In complete flow, we should rollback the subscription creation, but the customer already exists in EFI.
        # So we just mark the local bill as FAILED, or raise the error.
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
        
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
         "method": "CREDIT_CARD"
    }
        
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

@router.get("/subscribers/list")
def list_subscribers(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.user import UserRole
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Acesso restrito")
        
    query = db.query(CustomerSubscription)
    if current_user.type == UserRole.SELLER:
        query = query.filter(CustomerSubscription.company_id == current_user.company_id)
    
    if status is not None:
        query = query.filter(CustomerSubscription.status == status)
        
    total = query.count()
    subscriptions = query.order_by(CustomerSubscription.created_at.desc()).offset(skip).limit(limit).all()
    
    result = []
    for sub in subscriptions:
        # Fetch the plan name
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == sub.plan_id).first()
        from app.models.customer import Customer
        customer = db.query(Customer).filter(Customer.id == sub.customer_id).first()
        
        # Get the latest payment status
        latest_bill = db.query(SubscriptionBilling).filter(
            SubscriptionBilling.subscription_id == sub.id
        ).order_by(SubscriptionBilling.delivery_number.desc()).first()
        
        result.append({
            "id": sub.id,
            "plan_id": sub.plan_id,
            "plan_name": plan.name if plan else "Plano Desconhecido",
            "customer_id": sub.customer_id,
            "customer_name": customer.name if customer else f"Cliente #{sub.customer_id}",
            "customer_document": customer.document if customer else "",
            "customer_email": customer.email if customer else "",
            "status": sub.status.value if hasattr(sub.status, 'value') else sub.status,
            "current_delivery": sub.current_delivery_number,
            "shipping_address": f"{sub.shipping_street}, {sub.shipping_number} - {sub.shipping_city}/{sub.shipping_state} ({sub.shipping_zip_code})",
            "latest_payment_status": latest_bill.status.value if latest_bill and hasattr(latest_bill.status, 'value') else (latest_bill.status if latest_bill else "PENDING"),
            "latest_payment_date": latest_bill.paid_at.isoformat() if latest_bill and latest_bill.paid_at else None,
            "created_at": sub.created_at.isoformat() if sub.created_at else None
        })
        
    return {
        "total": total,
        "items": result
    }

@router.get("/subscribers/{sub_id}")
def get_subscriber_detail(
    sub_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.user import UserRole
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Acesso restrito")
        
    query = db.query(CustomerSubscription)
    
    if current_user.type == UserRole.SELLER:
        sub = query.filter(
            CustomerSubscription.id == sub_id,
            CustomerSubscription.company_id == current_user.company_id
        ).first()
    else:
        sub = query.filter(CustomerSubscription.id == sub_id).first()
    
    if not sub:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
        
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == sub.plan_id).first()
    from app.models.customer import Customer
    customer = db.query(Customer).filter(Customer.id == sub.customer_id).first()
    
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
        "customer_id": sub.customer_id,
        "customer_name": customer.name if customer else f"Cliente #{sub.customer_id}",
        "customer_document": customer.document if customer else "",
        "customer_email": customer.email if customer else "",
        "customer_phone": customer.phone if customer else "",
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

