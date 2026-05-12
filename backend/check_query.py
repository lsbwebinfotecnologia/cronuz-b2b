from app.db.session import SessionLocal
from app.models.customer import Customer
from app.models.customer_group import CustomerGroup

db = SessionLocal()
groups = db.query(CustomerGroup).filter(CustomerGroup.company_id == 8).all()
print("SQLAlchemy Groups:", groups)
for g in groups:
    print(g.id, g.company_id, g.name, g.color)
