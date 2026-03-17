import os
import sys

# Define base path explicitly
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)

from sqlalchemy import text
from app.db.session import engine

def apply_migration():
    """Adds quantity_requested and quantity_fulfilled to ord_order_item table."""
    try:
        with engine.begin() as connection:
            print("Adding 'quantity_requested' column to ord_order_item...")
            try:
                connection.execute(text("ALTER TABLE ord_order_item ADD COLUMN quantity_requested INTEGER NOT NULL DEFAULT 1;"))
                # Copy data from quantity to quantity_requested
                connection.execute(text("UPDATE ord_order_item SET quantity_requested = quantity;"))
                print("Column 'quantity_requested' added and populated successfully.")
            except Exception as e:
                if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                    print("Column 'quantity_requested' already exists.")
                else:
                    raise e
                    
            print("Adding 'quantity_fulfilled' column to ord_order_item...")
            try:
                connection.execute(text("ALTER TABLE ord_order_item ADD COLUMN quantity_fulfilled INTEGER NOT NULL DEFAULT 0;"))
                # Initially fulfilled amount is 0 until we sync with Horus (or equal to requested for older ones? let's default to 0)
                print("Column 'quantity_fulfilled' added successfully.")
            except Exception as e:
                if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                    print("Column 'quantity_fulfilled' already exists.")
                else:
                    raise e
                    
        print("Success.")
    except Exception as e:
        print(f"Error applying migration: {e}")

if __name__ == "__main__":
    apply_migration()
