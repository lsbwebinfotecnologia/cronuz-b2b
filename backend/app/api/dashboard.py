from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.dependencies import get_current_user_optional
from app.models.user import User
from app.models.product import Product
from app.models.customer import Customer
from app.models.company import Company

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/metrics")
def get_dashboard_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional)
):
    # Determine the company context
    company_id = 1
    if current_user and getattr(current_user, "company_id", None):
         company_id = current_user.company_id

    # 1. Total active products
    active_products = db.query(Product).filter(
        Product.company_id == company_id,
        Product.status == "ACTIVE"
    ).count()

    # 2. Total customers (empresas clientes)
    total_customers = db.query(Customer).filter(
        Customer.company_id == company_id
    ).count()

    # 3. Active orders (Since Order model doesn't exist yet, we mock 0)
    # TODO: Replace with real order query when implemented
    # active_orders = db.query(Order).filter(Order.company_id == company_id, Order.status == "PROCESSING").count()
    active_orders = 0
    
    # 4. Total revenue (Mocked for now since payment/invoicing is not fully done)
    total_revenue = 0.0

    return {
        "active_products": active_products,
        "total_customers": total_customers,
        "active_orders": active_orders,
        "total_revenue": total_revenue
    }
