import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "cronuz_b2b.db")

def migrate():
    print(f"Connecting to {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Missing columns based on model vs PRAGMA statement
    columns_to_add = [
        ("tenant_id", "VARCHAR(50) DEFAULT 'cronuz'"),
        ("login_background_url", "VARCHAR(500)"),
        ("module_b2b_native", "BOOLEAN DEFAULT 1"),
        ("module_horus_erp", "BOOLEAN DEFAULT 0"),
        ("module_products", "BOOLEAN DEFAULT 1"),
        ("module_customers", "BOOLEAN DEFAULT 1"),
        ("module_marketing", "BOOLEAN DEFAULT 0"),
        ("module_subscriptions", "BOOLEAN DEFAULT 0"),
        ("module_agents", "BOOLEAN DEFAULT 0")
    ]
    
    for col_name, col_type in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE cmp_company ADD COLUMN {col_name} {col_type};")
            print(f"Successfully added column {col_name}")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print(f"Column {col_name} already exists. Skipping.")
            else:
                print(f"Error adding {col_name}: {e}")
                
    conn.commit()
    conn.close()
    print("Migration complete!")

if __name__ == "__main__":
    migrate()
