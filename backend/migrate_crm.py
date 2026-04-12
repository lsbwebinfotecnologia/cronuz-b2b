import sys
import os
from sqlalchemy import text
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.db.session import engine

def run_migration():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE crm_interaction ADD COLUMN due_date TIMESTAMP WITH TIME ZONE;"))
            conn.execute(text("ALTER TABLE crm_interaction ADD COLUMN status VARCHAR(50) DEFAULT 'COMPLETED';"))
            conn.commit()
            print("Successfully added columns to crm_interaction")
        except Exception as e:
            print(f"Error touching crm_interaction (might already exist): {e}")

        try:
            conn.execute(text("ALTER TABLE crm_customer ADD COLUMN crm_status VARCHAR(50) DEFAULT 'ACTIVE';"))
            conn.commit()
            print("Successfully added crm_status to crm_customer")
        except Exception as e:
            print(f"Error touching crm_customer (might already exist): {e}")

if __name__ == "__main__":
    run_migration()
