import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from sqlalchemy import text

def add_brand_column():
    db = SessionLocal()
    try:
        # Check if column exists first to be safe
        result = db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='ord_order_item' AND column_name='brand';"))
        header = result.fetchone()
        if not header:
            print("Adding 'brand' column to ord_order_item...")
            db.execute(text("ALTER TABLE ord_order_item ADD COLUMN brand VARCHAR(255);"))
            db.commit()
            print("Column 'brand' added successfully.")
        else:
            print("Column 'brand' already exists in ord_order_item.")
            
        print("Success.")
    except Exception as e:
        print(f"Error during migration: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    add_brand_column()
