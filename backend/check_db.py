from app.db.session import SessionLocal
from app.models.customer import Customer
db = SessionLocal()
c = db.query(Customer).filter(Customer.id == 46).first()
print(c.id, c.default_group_id, c.additional_groups_links)
