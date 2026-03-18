import sys
from sqlalchemy import text
sys.path.append('/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend')
from app.db.session import SessionLocal

db = SessionLocal()
try:
    db.execute(text("ALTER TABLE cmp_settings DROP COLUMN IF EXISTS brand_logo_url;"))
    db.execute(text("ALTER TABLE cmp_settings DROP COLUMN IF EXISTS brand_background_url;"))
    db.execute(text("ALTER TABLE cmp_settings DROP COLUMN IF EXISTS brand_primary_color;"))
    db.commit()
    print("Columns dropped successfully.")
except Exception as e:
    print(f"Error dropping columns: {e}")
    db.rollback()
