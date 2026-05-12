import sys, os
sys.path.append(os.getcwd())
from main import app # This imports everything and sets up mappers
from app.db.session import SessionLocal
from app.models.customer import Customer
from app.schemas.customer import Customer as CustomerSchema

db = SessionLocal()
customer = db.query(Customer).filter(Customer.id == 46).first()
if customer:
    try:
        if getattr(customer, 'default_group', None):
            # This is exactly what the backend does
            setattr(customer, 'default_group', {"id": customer.default_group.id, "name": customer.default_group.name, "color": customer.default_group.color})
            
        print("Success evaluating default_group")
    except Exception as e:
        print("Error evaluating default_group:", e)
