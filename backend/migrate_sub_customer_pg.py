import psycopg2

def add_columns():
    conn = psycopg2.connect("postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b")
    conn.autocommit = True
    cursor = conn.cursor()
    
    columns = [
        "shipping_zip_code VARCHAR(20)",
        "shipping_street VARCHAR(255)",
        "shipping_number VARCHAR(50)",
        "shipping_complement VARCHAR(255)",
        "shipping_neighborhood VARCHAR(100)",
        "shipping_city VARCHAR(100)",
        "shipping_state VARCHAR(50)"
    ]
    
    for column_def in columns:
        col_name = column_def.split(" ")[0]
        try:
            cursor.execute(f"ALTER TABLE sub_customer ADD COLUMN {column_def}")
            print(f"Added {col_name}")
        except Exception as e:
            if "already exists" in str(e).lower():
                print(f"Column {col_name} already exists.")
            else:
                print(f"Error adding {col_name}: {e}")
                
    conn.close()

if __name__ == "__main__":
    add_columns()
