import sys
import os
from sqlalchemy import text
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.db.session import engine

def run_migration():
    print("Connecting to local database...")
    with engine.connect() as conn:
        try:
            print("Adding column 'active' to fin_account table...")
            conn.execute(text("ALTER TABLE fin_account ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE NOT NULL;"))
            conn.commit()
            print("Migration completed: successfully added active to fin_account")
        except Exception as e:
            print(f"Migration error: {e}")

if __name__ == "__main__":
    run_migration()
