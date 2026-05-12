import sys
import os
sys.path.append(os.getcwd())

from app.db.session import SessionLocal
from app.models.customer import Customer
from app.models.company import Company
from app.models.user import User

db = SessionLocal()
c = db.query(Customer).filter(Customer.id == 46).first()
if c:
    print("Before:", getattr(c, 'default_group_id', None))
    c.default_group_id = 1
    db.commit()
    db.refresh(c)
    print("After:", c.default_group_id)
    print("Group relation:", getattr(c, 'default_group', None))
else:
    print("Customer 46 not found")
