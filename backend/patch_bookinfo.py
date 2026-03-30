import sys
import os
from sqlalchemy import text
sys.path.append('/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend')
from app.db.session import SessionLocal

db = SessionLocal()

try:
    db.execute(text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS bookinfo_sync_enabled BOOLEAN DEFAULT FALSE NOT NULL;"))
    db.execute(text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS bookinfo_notify_processing_early BOOLEAN DEFAULT FALSE NOT NULL;"))
    db.commit()
    print("Columns added successfully.")
except Exception as e:
    print(f"Error: {e}")
    db.rollback()
