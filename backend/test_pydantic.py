import sys, os
sys.path.append(os.getcwd())
from app.db.session import SessionLocal
from app.models.customer import Customer
from app.schemas.customer import Customer as CustomerSchema

db = SessionLocal()
customer = db.query(Customer).filter(Customer.id == 46).first()
if customer:
    try:
        # Simulate what the endpoint does
        if getattr(customer, 'default_group', None):
            customer.default_group = {"id": customer.default_group.id, "name": customer.default_group.name, "color": customer.default_group.color}
        
        customer.additional_groups = [{"id": link.group.id, "name": link.group.name, "color": link.group.color} for link in getattr(customer, 'additional_groups_links', []) if link.group]
        
        schema = CustomerSchema.model_validate(customer)
        print(schema.model_dump_json(indent=2))
    except Exception as e:
        print("Error:", e)
