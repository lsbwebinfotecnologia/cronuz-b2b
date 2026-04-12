import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.db.session import engine
from sqlalchemy import text

def run_migration():
    print("Modifying cmp_company table...")
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE cmp_company ADD COLUMN module_financial BOOLEAN DEFAULT FALSE NOT NULL;"))
            print("Successfully added module_financial to cmp_company")
    except Exception as e:
        print(f"Error altering table: {e}")

if __name__ == "__main__":
    run_migration()
