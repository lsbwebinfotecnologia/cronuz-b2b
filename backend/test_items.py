import asyncio
from sqlalchemy import text
from app.db.session import SessionLocal

def inspect():
    db = SessionLocal()
    result = db.execute(text("SELECT id, quantity, quantity_requested, unit_price, total_price FROM ord_order_item WHERE order_id = 60")).fetchall()
    for row in result:
        print(dict(row._mapping))

if __name__ == "__main__":
    inspect()
