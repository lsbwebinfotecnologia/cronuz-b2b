import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from sqlalchemy import text
from app.db.session import engine

def add_columns():
    with engine.begin() as conn:
        print("Checking/Adding tracking_code to ord_order")
        try:
            conn.execute(text("ALTER TABLE ord_order ADD COLUMN tracking_code VARCHAR(100);"))
        except Exception as e:
            print(f"Skipped tracking_code: {e}")
            
        print("Checking/Adding invoice_xml to ord_order")
        try:
            conn.execute(text("ALTER TABLE ord_order ADD COLUMN invoice_xml TEXT;"))
        except Exception as e:
            print(f"Skipped invoice_xml: {e}")

if __name__ == "__main__":
    add_columns()
    print("Migration finished.")
