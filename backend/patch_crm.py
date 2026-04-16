from app.db.session import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    db.execute(text("ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_crm BOOLEAN NOT NULL DEFAULT FALSE;"))
    db.commit()
    print("Column added successfully.")
except Exception as e:
    print("Error:", e)
finally:
    db.close()
