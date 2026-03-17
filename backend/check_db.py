from sqlalchemy import create_engine
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from sqlalchemy import text

def check_db():
    db = SessionLocal()
    try:
        # Check orders
        print("Checking orders...")
        orders = db.execute(text("SELECT id, customer_id, status FROM ord_order ORDER BY id DESC LIMIT 5")).fetchall()
        for o in orders:
            print(f"Order: {o}")
            
        print("\nChecking order items...")
        items = db.execute(text("SELECT id, order_id, name, ean_isbn, product_id FROM ord_order_item ORDER BY id DESC LIMIT 10")).fetchall()
        for i in items:
            print(f"Item: {i}")

    finally:
        db.close()

if __name__ == "__main__":
    check_db()
