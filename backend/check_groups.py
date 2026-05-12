import sys
import os
sys.path.append(os.getcwd())
from app.db.session import SessionLocal
from app.models.customer import Customer
db = SessionLocal()
c = db.query(Customer).filter(Customer.id == 46).first()
if c:
    print(f"Customer 46: default_group_id={c.default_group_id}")
    print(f"Links count: {len(c.additional_groups_links)}")
else:
    print("Not found")
