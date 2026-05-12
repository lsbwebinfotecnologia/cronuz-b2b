from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS crm_customer_group (
                id SERIAL PRIMARY KEY,
                company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                color VARCHAR(50)
            );
        """))
        print("Table crm_customer_group created or already exists.")
        
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS crm_customer_group_link (
                customer_id INTEGER NOT NULL REFERENCES crm_customer(id) ON DELETE CASCADE,
                group_id INTEGER NOT NULL REFERENCES crm_customer_group(id) ON DELETE CASCADE,
                PRIMARY KEY (customer_id, group_id)
            );
        """))
        print("Table crm_customer_group_link created or already exists.")
        
        # Check if default_group_id exists in crm_customer
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='crm_customer' and column_name='default_group_id';
        """)).fetchone()
        
        if not result:
            conn.execute(text("""
                ALTER TABLE crm_customer ADD COLUMN default_group_id INTEGER REFERENCES crm_customer_group(id) ON DELETE SET NULL;
            """))
            print("Column default_group_id added to crm_customer.")
        else:
            print("Column default_group_id already exists in crm_customer.")
        
        conn.commit()
    except Exception as e:
        print("Error:", e)
        conn.rollback()

