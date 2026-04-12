import sys
import os
from sqlalchemy import text
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.db.session import engine
from app.models.commercial_policy import Base
from app.models.company import Company
from app.models.customer import Customer

def run_migration():
    print("Creating commercial policy tables...")
    Base.metadata.create_all(bind=engine)
    print("Base.metadata.create_all executed.")
    
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE crm_customer ADD COLUMN commercial_policy_id INTEGER REFERENCES crm_commercial_policy(id) ON DELETE SET NULL;"))
            conn.commit()
            print("Successfully added commercial_policy_id to crm_customer")
        except Exception as e:
            if "duplicate column name" in str(e).lower() or "already exists" in str(e).lower():
                print("Column commercial_policy_id already exists.")
            else:
                print(f"Error adding column: {e}")

if __name__ == "__main__":
    run_migration()
