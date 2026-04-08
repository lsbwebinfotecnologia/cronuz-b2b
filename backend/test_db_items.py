import asyncio
from app.db.session import SessionLocal
from app.models.order import Order

def run():
    db = SessionLocal()
    o = db.query(Order).filter(Order.id == 1048).first()
    if not o:
        print("Not found")
        return
    for item in o.items:
        print(f"Item: {item.name}")
        print(f"Unit: {item.unit_price}")
        print(f"Total: {item.total_price}")
run()
