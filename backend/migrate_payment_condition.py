import os
import sys
from sqlalchemy import text
from app.db.session import engine

def run_migration():
    print("Starting migration to add payment_condition to Customer and Order...")
    with engine.connect() as conn:
        # Check if table exists
        try:
            # Add to crm_customer
            conn.execute(text('ALTER TABLE crm_customer ADD COLUMN payment_condition VARCHAR(50);'))
            print("Successfully added payment_condition to crm_customer.")
        except Exception as e:
            print(f"Skipped crm_customer (might already exist or error): {e}")

        try:
            # Add to ord_order
            conn.execute(text('ALTER TABLE ord_order ADD COLUMN payment_condition VARCHAR(50);'))
            print("Successfully added payment_condition to ord_order.")
        except Exception as e:
            print(f"Skipped ord_order (might already exist or error): {e}")
            
        conn.commit()

if __name__ == "__main__":
    run_migration()
