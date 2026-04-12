import sys
import os
from sqlalchemy import text
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.db.session import engine

def run_migration():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE fin_transaction ADD COLUMN transaction_status VARCHAR(50) DEFAULT 'CONFIRMADO' NOT NULL;"))
            conn.execute(text("ALTER TABLE fin_transaction ADD COLUMN is_fixed BOOLEAN DEFAULT FALSE NOT NULL;"))
            
            conn.execute(text("ALTER TABLE fin_transaction ADD COLUMN first_due_date DATE;"))
            conn.execute(text("UPDATE fin_transaction SET first_due_date = issue_date;"))
            conn.execute(text("ALTER TABLE fin_transaction ALTER COLUMN first_due_date SET NOT NULL;"))
            conn.commit()
            print("Successfully altered fin_transaction")
        except Exception as e:
            print(f"Error altering table: {e}")

if __name__ == "__main__":
    run_migration()
