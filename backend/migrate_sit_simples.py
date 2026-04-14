import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine
from sqlalchemy import text

def run_migration():
    print("Starting Migration for nfse_sit_simples_nacional...")
    with engine.connect() as conn:
        try:
            with conn.begin_nested():
                conn.execute(text("ALTER TABLE cmp_company ADD COLUMN nfse_sit_simples_nacional VARCHAR(5) DEFAULT '1'"))
            print("Successfully added nfse_sit_simples_nacional to cmp_company.")
        except Exception as e:
            print(f"Skipping / Error: {e}")
        
        conn.commit()

if __name__ == "__main__":
    run_migration()
