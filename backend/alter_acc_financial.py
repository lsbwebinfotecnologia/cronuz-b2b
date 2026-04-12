import sys
import os
from sqlalchemy import text
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.db.session import engine
from app.models.financial import Base, FinancialAccount, FinancialCashFlowLog

def run_migration():
    Base.metadata.create_all(bind=engine, tables=[FinancialAccount.__table__, FinancialCashFlowLog.__table__])
    print("Created fin_account and fin_cashflow_log")
    
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE fin_installment ADD COLUMN account_id INTEGER REFERENCES fin_account(id) ON DELETE SET NULL;"))
            conn.commit()
            print("Successfully added account_id to fin_installment")
        except Exception as e:
            if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                print("Column account_id already exists")
            else:
                print(f"Error altering table: {e}")

if __name__ == "__main__":
    run_migration()
