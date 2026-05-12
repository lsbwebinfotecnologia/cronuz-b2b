import sys, os
sys.path.append(os.getcwd())
from main import app
from app.db.session import SessionLocal
from app.models.customer import Customer
from app.models.user import User
from app.schemas.customer import Customer as CustomerSchema

db = SessionLocal()
customer = db.query(Customer).filter(Customer.id == 46, Customer.company_id == 8).first()

if getattr(customer, 'default_group', None):
    customer.default_group = {"id": customer.default_group.id, "name": customer.default_group.name, "color": customer.default_group.color}
    
print("Successfully assigned dict to relationship")
