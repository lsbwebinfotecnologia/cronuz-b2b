import sys
import os
from sqlalchemy import text
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.db.session import engine
from app.models.commercial_policy import Base as PolicyBase
from app.models.order_installment import Base as InstallmentBase
from app.models.company import Company
from app.models.customer import Customer
from app.models.order import Order

def run_migration():
    print("Creating order installment tables...")
    InstallmentBase.metadata.create_all(bind=engine)
    print("InstallmentBase.metadata.create_all executed.")
    
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE crm_commercial_policy RENAME COLUMN default_discount_percent TO discount_sale_percent;"))
            conn.commit()
            print("Renamed default_discount_percent to discount_sale_percent")
        except Exception as e:
            print(f"Error renaming column: {e}")
            
        try:
            conn.execute(text("ALTER TABLE crm_commercial_policy ADD COLUMN discount_consignment_percent FLOAT DEFAULT 0.0 NOT NULL;"))
            conn.execute(text("ALTER TABLE crm_commercial_policy ADD COLUMN max_installments INTEGER DEFAULT 1 NOT NULL;"))
            conn.execute(text("ALTER TABLE crm_commercial_policy ADD COLUMN min_installment_value FLOAT DEFAULT 50.0 NOT NULL;"))
            conn.commit()
            print("Successfully added new fields to crm_commercial_policy")
        except Exception as e:
            print(f"Error adding new columns: {e}")

if __name__ == "__main__":
    run_migration()
