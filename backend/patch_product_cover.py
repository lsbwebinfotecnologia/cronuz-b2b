import sys
import os
from sqlalchemy import text
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))
from app.db.session import SessionLocal

db = SessionLocal()

try:
    db.execute(text("ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS cover_url VARCHAR(500);"))
    db.commit()
    print("Product cover_url column added successfully.")
except Exception as e:
    print(f"Error: {e}")
    db.rollback()
