import sys, os
sys.path.append(os.getcwd())
from main import app
from app.db.session import SessionLocal
from app.models.customer import Customer
from app.models.user import User
from app.api.customers import read_customer
from app.schemas.customer import Customer as CustomerSchema

db = SessionLocal()
u = db.query(User).filter(User.company_id == 8).first()
if not u:
    print("User not found")
else:
    try:
        res_dict = read_customer(46, db, u)
        print("Function returned dict successfully.")
        
        # Manually validate against schema to ensure FastAPI won't crash
        schema = CustomerSchema.model_validate(res_dict)
        print("Schema validation successful. Default group:", schema.default_group)
    except Exception as e:
        print("Error:", e)
