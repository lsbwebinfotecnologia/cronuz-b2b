import sys
import os
from sqlalchemy import text
sys.path.append('/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend')
from app.db.session import SessionLocal

db = SessionLocal()

try:
    db.execute(text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS brand_logo_url VARCHAR(500);"))
    db.execute(text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS brand_background_url VARCHAR(500);"))
    db.execute(text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS brand_primary_color VARCHAR(20);"))
    db.commit()
    print("Columns added successfully.")
except Exception as e:
    print(f"Error: {e}")
    db.rollback()
