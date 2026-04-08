from app.db.session import SessionLocal
from app.models.customer import Customer
db = SessionLocal()
custs = db.query(Customer).filter(Customer.email.ilike("%livrosnaweb%")).all()
for c in custs:
    print(c.id, c.name, c.email, c.id_guid, "Company:", c.company_id)
