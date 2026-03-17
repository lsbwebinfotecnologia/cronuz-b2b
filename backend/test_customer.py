import asyncio
from app.db.session import SessionLocal
from app.models.user import User
from app.models.company import Company
from app.models.catalog_support import Category, Brand, Characteristic
from app.models.product import Product
from app.models.customer import Customer
from app.models.order import Order, OrderItem
from app.models.order_log import OrderLog
from app.models.order_interaction import OrderInteraction

def check():
    db = SessionLocal()
    user = db.query(User).filter(User.type == "CUSTOMER").first()
    customer = db.query(Customer).filter(Customer.document == user.document).first()
    company = db.query(Company).filter(Company.id == user.company_id).first()
    
    print(f"User Doc: {user.document}")
    if customer:
        print(f"Customer id_guid: {customer.id_guid}")
    else:
        print("Customer not found")
        
    if company:
        print(f"Company Doc: {company.document}")
    else:
        print("Company not found")

if __name__ == "__main__":
    check()
