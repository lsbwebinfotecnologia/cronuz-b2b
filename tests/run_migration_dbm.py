import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
from sqlalchemy import text
from app.db.session import engine

def main():
    print("Aplicando migracao DDL do DBM localmente...")
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_feature_dbm BOOLEAN NOT NULL DEFAULT FALSE;"))
        conn.commit()
        res = conn.execute(text("""
            SELECT column_name, data_type, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'cmp_settings' AND column_name = 'horus_sql_feature_dbm';
        """)).fetchall()
        print("Resultado da coluna:", res)
    print("Migracao DBM aplicada com sucesso!")

if __name__ == '__main__':
    main()
