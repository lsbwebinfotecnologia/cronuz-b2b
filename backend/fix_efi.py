from sqlalchemy import text
from app.db.session import engine

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE sub_plan ADD COLUMN IF NOT EXISTS efi_plan_id INTEGER NULL;"))
print("Done!")
