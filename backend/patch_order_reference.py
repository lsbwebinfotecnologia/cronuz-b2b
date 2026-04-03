import os
import psycopg2

def run():
    conn_str = "postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b"
    conn = psycopg2.connect(conn_str)
    conn.autocommit = True
    cursor = conn.cursor()
    
    try:
        cursor.execute("ALTER TABLE ord_order ADD COLUMN partner_reference VARCHAR(100);")
        print("Column partner_reference added successfully!")
    except Exception as e:
        if "already exists" in str(e).lower() or "DuplicateColumn" in str(e):
            print("Column partner_reference already exists.")
        else:
            print("Error: ", e)
    
    cursor.close()
    conn.close()

if __name__ == "__main__":
    run()
