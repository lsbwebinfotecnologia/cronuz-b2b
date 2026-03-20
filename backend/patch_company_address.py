import sqlite3

def patch_db():
    conn = sqlite3.connect('cronuz_b2b.db')
    cursor = conn.cursor()
    
    columns = [
        ("zip_code", "VARCHAR(20)"),
        ("street", "VARCHAR(255)"),
        ("number", "VARCHAR(50)"),
        ("complement", "VARCHAR(255)"),
        ("neighborhood", "VARCHAR(255)"),
        ("city", "VARCHAR(255)"),
        ("state", "VARCHAR(50)")
    ]
    
    for col_name, col_type in columns:
        try:
            cursor.execute(f"ALTER TABLE cmp_company ADD COLUMN {col_name} {col_type}")
            print(f"Added column {col_name}")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print(f"Column {col_name} already exists.")
            else:
                print(f"Error adding {col_name}: {e}")
                
    conn.commit()
    conn.close()

if __name__ == "__main__":
    patch_db()
