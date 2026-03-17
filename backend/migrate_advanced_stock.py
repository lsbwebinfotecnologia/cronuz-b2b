import os
import sys

# Add the backend directory to sys.path so we can import 'app'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.db.session import engine, SessionLocal

def migrate():
    db = SessionLocal()
    try:
        # Check cmp_settings for allow_backorder
        try:
            db.execute(text("ALTER TABLE cmp_settings ADD COLUMN allow_backorder BOOLEAN DEFAULT FALSE NOT NULL"))
            print("Added allow_backorder to cmp_settings")
        except Exception as e:
            print(f"Skipping allow_backorder: {e}")

        try:
            db.execute(text("ALTER TABLE cmp_settings ADD COLUMN max_backorder_qty INTEGER DEFAULT 0 NOT NULL"))
            print("Added max_backorder_qty to cmp_settings")
        except Exception as e:
            print(f"Skipping max_backorder_qty: {e}")

        # Check prd_product for is_pre_sale and is_out_of_print
        try:
            db.execute(text("ALTER TABLE prd_product ADD COLUMN is_pre_sale BOOLEAN DEFAULT FALSE NOT NULL"))
            print("Added is_pre_sale to prd_product")
        except Exception as e:
            print(f"Skipping is_pre_sale: {e}")

        try:
            db.execute(text("ALTER TABLE prd_product ADD COLUMN is_out_of_print BOOLEAN DEFAULT FALSE NOT NULL"))
            print("Added is_out_of_print to prd_product")
        except Exception as e:
            print(f"Skipping is_out_of_print: {e}")

        db.commit()
        print("Migration complete!")
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
