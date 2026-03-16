import os
from sqlalchemy import text
from app.db.session import engine

def upgrade_db():
    try:
        with engine.begin() as conn:
            # Check if columns exist before adding
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='crm_customer' and column_name='id_guid';
            """))
            if not result.fetchone():
                print("Adding id_guid to crm_customer")
                conn.execute(text("ALTER TABLE crm_customer ADD COLUMN id_guid VARCHAR(255)"))
                
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='crm_customer' and column_name='id_doc';
            """))
            if not result.fetchone():
                print("Adding id_doc to crm_customer")
                conn.execute(text("ALTER TABLE crm_customer ADD COLUMN id_doc VARCHAR(255)"))
                
        print("Database migration completed successfully.")
    except Exception as e:
        print(f"Error during migration: {e}")

if __name__ == "__main__":
    upgrade_db()
