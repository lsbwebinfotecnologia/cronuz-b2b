import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from sqlalchemy import text

def add_type_order_column():
    db = SessionLocal()
    try:
        # Check if column exists first to be safe
        result = db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='ord_order' AND column_name='type_order';"))
        header = result.fetchone()
        if not header:
            print("Adding 'type_order' column to ord_order...")
            db.execute(text("ALTER TABLE ord_order ADD COLUMN type_order VARCHAR(50) DEFAULT 'V' NOT NULL;"))
            db.commit()
            print("Column 'type_order' added successfully.")
        else:
            print("Column 'type_order' already exists in ord_order.")
            
        print("Success.")
    except Exception as e:
        print(f"Error during migration: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    add_type_order_column()
