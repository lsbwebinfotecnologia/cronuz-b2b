import asyncio
import os
import sys
import traceback

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

# Import main to initialize all SQLAlchemy models properly!
from app import main

from app.db.session import SessionLocal
from app.models.order import Order
from app.models.customer import Customer
from app.models.company import Company
from app.models.order_log import OrderLog

def test_db():
    db = SessionLocal()
    order_id = "2522d3d7-2774-4dfe-af22-bd008bdaa08d"
    company_id = 1
    
    try:
        local_order = db.query(Order).filter(
            Order.external_id == order_id, 
            Order.company_id == company_id,
            Order.origin == "bookinfo"
        ).first()
        
        customer_data = {}
        company_data = {}
        order_internal = {}
        timeline = []
        
        if local_order:
            order_internal = {
                "id": local_order.id,
                "status": local_order.status,
                "tracking_code": local_order.tracking_code,
                "horus_pedido_venda": local_order.horus_pedido_venda,
                "created_at": local_order.created_at.isoformat() if local_order.created_at else None,
                "bookinfo_nfe_sent": local_order.bookinfo_nfe_sent
            }
            
            customer = db.query(Customer).filter(Customer.id == local_order.customer_id).first()
            company = db.query(Company).filter(Company.id == local_order.company_id).first()
            
            if customer:
                customer_data = {
                    "name": customer.name or customer.corporate_name,
                    "document": customer.document,
                    "credit_limit": customer.credit_limit,
                    "open_debts": customer.open_debts,
                    "consignment_status": customer.consignment_status
                }
            
            if company:
                company_data = {
                    "name": company.trading_name or company.name,
                    "document": company.document
                }
                
            logs_q = db.query(OrderLog).filter(OrderLog.order_id == local_order.id).order_by(OrderLog.created_at.asc()).all()
            timeline = [
                {
                    "id": l.id,
                    "old_status": l.old_status,
                    "new_status": l.new_status,
                    "created_at": l.created_at.isoformat() if l.created_at else None
                }
                for l in logs_q
            ]
            print("SUCCESS! Data:")
            print("Internal:", order_internal)
            print("Customer:", customer_data)
        else:
            print("No local order found.")
            
    except Exception as e:
        print("EXCEPTION CAUGHT:")
        traceback.print_exc()

if __name__ == "__main__":
    test_db()
