import os
import sys
from sqlalchemy import text

# Setup environment to import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal

def migrate():
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_stock_local VARCHAR(50) DEFAULT NULL;"))
        db.execute(text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_hide_zero_balance BOOLEAN DEFAULT FALSE NOT NULL;"))
        db.commit()
        print("Migration applied successfully: Added horus_stock_local and horus_hide_zero_balance to cmp_settings.")
    except Exception as e:
        print(f"Error executing migration: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
