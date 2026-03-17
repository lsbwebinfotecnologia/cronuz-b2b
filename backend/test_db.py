from app.db.session import SessionLocal
from sqlalchemy import text

db = SessionLocal()
print("Users:")
for row in db.execute(text("SELECT id, email, type, company_id FROM usr_user")):
    print(dict(row._mapping))

print("\nOrders:")
for row in db.execute(text("SELECT id, status, company_id, customer_id FROM ord_order")):
    print(dict(row._mapping))
