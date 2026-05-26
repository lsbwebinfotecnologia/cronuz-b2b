from app.db.session import engine
from sqlalchemy import text

def run_migration():
    print("Altering spl_supplier table to add new columns...")
    with engine.begin() as conn:
        # Add status_pedido_compra if not exists
        conn.execute(text("""
            ALTER TABLE spl_supplier 
            ADD COLUMN IF NOT EXISTS status_pedido_compra VARCHAR(20) DEFAULT 'AE';
        """))
        # Add integrador_compra if not exists
        conn.execute(text("""
            ALTER TABLE spl_supplier 
            ADD COLUMN IF NOT EXISTS integrador_compra VARCHAR(50) DEFAULT 'HORUS';
        """))
        # Add last_sync_at if not exists
        conn.execute(text("""
            ALTER TABLE spl_supplier 
            ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;
        """))
    print("Success!")

if __name__ == "__main__":
    run_migration()
