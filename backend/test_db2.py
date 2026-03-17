from app.db.session import SessionLocal
from sqlalchemy import text

db = SessionLocal()
print("Users:")
for row in db.execute(text("SELECT id, email, type, company_id FROM usr_user")).mappings():
    print(dict(row))

print("\nOrders:")
for row in db.execute(text("SELECT id, status, company_id, customer_id, origin, type_order FROM ord_order ORDER BY id DESC LIMIT 20")).mappings():
    print(dict(row))
