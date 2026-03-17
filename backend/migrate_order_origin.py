import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from sqlalchemy import text

def add_origin_column():
    db = SessionLocal()
    try:
        result = db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='ord_order' AND column_name='origin';"))
        header = result.fetchone()
        if not header:
            print("Adding 'origin' column to ord_order...")
            db.execute(text("ALTER TABLE ord_order ADD COLUMN origin VARCHAR(50) DEFAULT 'store' NOT NULL;"))
            db.commit()
            print("Column 'origin' added successfully.")
        else:
            print("Column 'origin' already exists in ord_order.")
        print("Success.")
    except Exception as e:
        print(f"Error during migration: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    add_origin_column()
