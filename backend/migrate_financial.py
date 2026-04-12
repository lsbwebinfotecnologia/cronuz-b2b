import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.db.session import engine, Base
from app.models.company import Company
from app.models.customer import Customer
from app.models.order import Order
from app.models.financial import FinancialCategory, FinancialTransaction, FinancialInstallment

def run_migration():
    print("Creating financial tables...")
    try:
        Base.metadata.create_all(bind=engine)
        print("Successfully created Financial tables")
    except Exception as e:
        print(f"Error creating tables: {e}")

if __name__ == "__main__":
    run_migration()
