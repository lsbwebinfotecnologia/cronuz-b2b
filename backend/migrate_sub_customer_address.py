import sqlite3

def add_columns():
    conn = sqlite3.connect('cronuz_b2b.db')
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
        try:
            cursor.execute(f"ALTER TABLE sub_customer ADD COLUMN {column_def}")
            print(f"Added {column_def}")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print(f"Column {column_def.split(' ')[0]} already exists.")
            else:
                print(f"Error adding {column_def}: {e}")
                
    conn.commit()
    conn.close()

if __name__ == "__main__":
    add_columns()
