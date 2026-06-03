from app.db.session import engine
from sqlalchemy import text

def run_migration():
    print("Altering cmp_settings table to add bookinfo_purchase_last_run...")
    with engine.begin() as conn:
        conn.execute(text("""
            ALTER TABLE cmp_settings 
            ADD COLUMN IF NOT EXISTS bookinfo_purchase_last_run TIMESTAMP WITH TIME ZONE;
        """))
    print("Success!")

if __name__ == "__main__":
    run_migration()
