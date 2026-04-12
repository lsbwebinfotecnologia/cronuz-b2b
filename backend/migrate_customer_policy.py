import sys
import os
from sqlalchemy import text
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.db.session import engine

def add_commercial_policy_column():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE crm_customer ADD COLUMN commercial_policy_id INTEGER REFERENCES crm_commercial_policy(id) ON DELETE SET NULL;"))
            conn.commit()
            print("Successfully added commercial_policy_id to crm_customer")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    add_commercial_policy_column()
