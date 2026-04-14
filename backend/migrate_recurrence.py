import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine
from sqlalchemy import text

def add_recurrence_fields():
    print("Starting Recurrence Field Column Insertion...")
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE svc_service_order ADD COLUMN is_recurrent BOOLEAN DEFAULT FALSE NOT NULL;"))
            print("Column 'is_recurrent' created.")
        except Exception as e:
            if "already exists" in str(e).lower() or "duplicada" in str(e).lower():
                print("Column 'is_recurrent' already exists.")
            else:
                print(f"Error checking is_recurrent: {e}")
                
        try:
            conn.execute(text("ALTER TABLE svc_service_order ADD COLUMN recurrence_end_date DATE;"))
            print("Column 'recurrence_end_date' created.")
        except Exception as e:
            if "already exists" in str(e).lower() or "duplicada" in str(e).lower():
                print("Column 'recurrence_end_date' already exists.")
            else:
                print(f"Error checking recurrence_end_date: {e}")

if __name__ == "__main__":
    add_recurrence_fields()
    print("Recurrence migration finished!")
