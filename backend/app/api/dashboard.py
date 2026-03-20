from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.dependencies import get_current_user_optional
from app.models.user import User
from app.models.product import Product
from app.models.customer import Customer
from app.models.company import Company
from app.models.company_settings import CompanySettings

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/metrics")
def get_dashboard_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional)
):
    # Determine the company context
    company_id = None
    if current_user and getattr(current_user, "type", None) == "SELLER":
         company_id = current_user.company_id
    elif current_user and getattr(current_user, "type", None) == "MASTER":
         company_id = None
    else:
         company_id = 1

    # 1. Total active products (unless Horus is used)
    settings = db.query(CompanySettings)
    if company_id:
        settings = settings.filter(CompanySettings.company_id == company_id)
    settings = settings.first()
        
    uses_horus = settings.horus_enabled if settings else False
    
    active_products = 0
    if not uses_horus:
        prod_query = db.query(Product).filter(Product.status == "ACTIVE")
        if company_id:
            prod_query = prod_query.filter(Product.company_id == company_id)
        active_products = prod_query.count()

    # 2. Total customers (empresas clientes)
    cust_query = db.query(Customer)
    if company_id:
        cust_query = cust_query.filter(Customer.company_id == company_id)
    total_customers = cust_query.count()

    # 3. Active orders
    from app.models.order import Order
    order_query = db.query(Order).filter(Order.status.in_(["NEW", "PROCESSING", "SENT_TO_HORUS"]))
    if company_id:
        order_query = order_query.filter(Order.company_id == company_id)
    active_orders = order_query.count()
    
    # Get Company Modules
    company = None
    if company_id:
        company = db.query(Company).filter(Company.id == company_id).first()
        
    module_b2b_native = company.module_b2b_native if company else False
    module_horus_erp = company.module_horus_erp if company else False
    module_products = company.module_products if company else False
    module_customers = company.module_customers if company else False
    module_marketing = company.module_marketing if company else False
    module_subscriptions = company.module_subscriptions if company else False
    module_pdv = company.module_pdv if company else False
    module_agents = company.module_agents if company else False

    # Uses horus is now strongly derived from the company flag
    uses_horus = module_horus_erp

    # 4. Total revenue (Mocked for now since payment/invoicing is not fully done)
    total_revenue = 0.0

    return {
        "active_products": active_products,
        "total_customers": total_customers,
        "active_orders": active_orders,
        "total_revenue": total_revenue,
        "uses_horus": uses_horus,
        "module_b2b_native": module_b2b_native,
        "module_horus_erp": module_horus_erp,
        "module_products": module_products,
        "module_customers": module_customers,
        "module_marketing": module_marketing,
        "module_subscriptions": module_subscriptions,
        "module_pdv": module_pdv,
        "module_agents": module_agents
    }
