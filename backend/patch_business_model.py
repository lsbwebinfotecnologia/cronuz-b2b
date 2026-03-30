import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy import text
from app.db.session import engine

def apply_patch():
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS business_model VARCHAR(50) NOT NULL DEFAULT 'B2B_CRONUZ';"))
        print("Success: Column business_model added to cmp_settings.")
    except Exception as e:
        print(f"Error applying patch: {e}")

if __name__ == "__main__":
    apply_patch()
