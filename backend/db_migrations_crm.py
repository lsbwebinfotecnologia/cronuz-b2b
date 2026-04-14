import sys
import os
from sqlalchemy import text

sys.path.append(os.path.abspath(os.path.dirname(__file__)))
from app.db.session import SessionLocal

db = SessionLocal()
try:
    db.execute(text("ALTER TABLE crm_customer ADD COLUMN nfse_notes TEXT;"))
    db.commit()
    print("Migration applied successfully!")
except Exception as e:
    print(f"Migration error (already applied?): {e}")
finally:
    db.close()
