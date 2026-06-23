"""
Migration: Adiciona coluna mobile_modules na tabela cmp_company
Executar localmente: python migrate_mobile_modules.py
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine
from sqlalchemy import text

DEFAULT_MODULES = {
    "pdv": False,
    "conferencia": False,
    "vendas": False,
    "pedidos": False,
    "catalogo": False,
    "clientes": False
}

def run():
    with engine.connect() as conn:
        # Verifica se coluna já existe
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='cmp_company' AND column_name='mobile_modules'
        """))
        
        if result.fetchone():
            print("✔ Coluna mobile_modules já existe em cmp_company")
            return
        
        # Adiciona coluna JSONB com default
        import json
        default_json = json.dumps(DEFAULT_MODULES)
        conn.execute(text(f"""
            ALTER TABLE cmp_company 
            ADD COLUMN mobile_modules JSONB DEFAULT '{default_json}'::jsonb
        """))
        conn.commit()
        print("✔ Coluna mobile_modules adicionada à tabela cmp_company")
        print(f"  Default: {default_json}")

if __name__ == "__main__":
    run()
