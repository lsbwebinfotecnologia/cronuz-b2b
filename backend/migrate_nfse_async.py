import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.db.session import engine

def apply_migrations():
    with engine.begin() as conn:
        try:
            # Add nfse_async_mode to cmp_company
            conn.execute(text("ALTER TABLE cmp_company ADD COLUMN nfse_async_mode BOOLEAN DEFAULT TRUE;"))
            print("Successfully added: nfse_async_mode to cmp_company")
        except Exception as e:
            print(f"Skipping cmp_company.nfse_async_mode (likely exists): {e}")

if __name__ == "__main__":
    print("Starting NFSe Async Mode Migration...")
    apply_migrations()
    print("Migration Completed!")
