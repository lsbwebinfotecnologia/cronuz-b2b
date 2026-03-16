import sqlite3

def update_db():
    try:
        conn = sqlite3.connect('cronuz_b2b.db')
        cursor = conn.cursor()
        
        # Check if columns exist
        cursor.execute("PRAGMA table_info(crm_customer)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'id_guid' not in columns:
            print("Adding id_guid column to crm_customer")
            cursor.execute("ALTER TABLE crm_customer ADD COLUMN id_guid VARCHAR(255)")
            
        if 'id_doc' not in columns:
            print("Adding id_doc column to crm_customer")
            cursor.execute("ALTER TABLE crm_customer ADD COLUMN id_doc VARCHAR(255)")
            
        conn.commit()
        print("Database updated successfully.")
        
    except Exception as e:
        print(f"Error updating database: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    update_db()
