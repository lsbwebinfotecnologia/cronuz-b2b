import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.db.session import engine

def apply_migrations():
    with engine.begin() as conn:
        try:
            # Add nfse_next_number to cmp_company
            conn.execute(text("ALTER TABLE cmp_company ADD COLUMN nfse_next_number INTEGER DEFAULT 1 NOT NULL;"))
            print("Successfully added: nfse_next_number to cmp_company")
        except Exception as e:
            print(f"Skipping cmp_company.nfse_next_number (likely exists): {e}")

        try:
            # Add ibge_code to crm_address
            conn.execute(text("ALTER TABLE crm_address ADD COLUMN ibge_code VARCHAR(20);"))
            print("Successfully added: ibge_code to crm_address")
        except Exception as e:
            print(f"Skipping crm_address.ibge_code (likely exists): {e}")

if __name__ == "__main__":
    print("Starting Part 2 NFSe Schema Migrations...")
    apply_migrations()
    print("Part 2 Migrations Completed!")
