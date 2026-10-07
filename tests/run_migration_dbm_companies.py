import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
from sqlalchemy import text
from app.db.session import engine

def main():
    print("Aplicando migracao DDL para campos da tela de empresa DBM no PostgreSQL...")
    with engine.connect() as conn:
        # Colunas em cmp_company
        cmp_columns = [
            ("group_name", "VARCHAR(150)"),
            ("segment", "VARCHAR(150)"),
            ("notes_message", "TEXT"),
            ("customer_account", "VARCHAR(150)"),
            ("royalties_data", "TEXT"),
            ("is_cliente", "BOOLEAN NOT NULL DEFAULT TRUE"),
            ("is_fornecedor", "BOOLEAN NOT NULL DEFAULT FALSE"),
            ("horus_cod_cli", "INTEGER"),
            ("horus_cod_fornecedor", "INTEGER"),
        ]
        for col_name, col_type in cmp_columns:
            conn.execute(text(f"ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
        
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cmp_company_horus_cod_cli ON cmp_company(horus_cod_cli);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cmp_company_horus_cod_fornecedor ON cmp_company(horus_cod_fornecedor);"))

        # Colunas em crm_customer
        crm_columns = [
            ("group_name", "VARCHAR(150)"),
            ("segment", "VARCHAR(150)"),
            ("notes_message", "TEXT"),
            ("customer_account", "VARCHAR(150)"),
            ("royalties_data", "TEXT"),
            ("is_cliente", "BOOLEAN NOT NULL DEFAULT TRUE"),
            ("is_fornecedor", "BOOLEAN NOT NULL DEFAULT FALSE"),
            ("horus_cod_cli", "INTEGER"),
            ("horus_cod_fornecedor", "INTEGER"),
            ("city", "VARCHAR(100)"),
            ("state", "VARCHAR(50)"),
        ]
        for col_name, col_type in crm_columns:
            conn.execute(text(f"ALTER TABLE crm_customer ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
        
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_crm_customer_horus_cod_cli ON crm_customer(company_id, horus_cod_cli);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_crm_customer_horus_cod_fornecedor ON crm_customer(company_id, horus_cod_fornecedor);"))

        conn.commit()

        cmp_check = conn.execute(text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'cmp_company' 
              AND column_name IN ('group_name', 'segment', 'notes_message', 'customer_account', 'royalties_data', 'is_cliente', 'is_fornecedor', 'horus_cod_cli', 'horus_cod_fornecedor')
            ORDER BY column_name;
        """)).fetchall()
        print("Colunas criadas em cmp_company:", cmp_check)

        crm_check = conn.execute(text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'crm_customer' 
              AND column_name IN ('group_name', 'segment', 'notes_message', 'customer_account', 'royalties_data', 'is_cliente', 'is_fornecedor', 'horus_cod_cli', 'horus_cod_fornecedor', 'city', 'state')
            ORDER BY column_name;
        """)).fetchall()
        print("Colunas criadas em crm_customer:", crm_check)

    print("Migracao concluida com sucesso!")

if __name__ == '__main__':
    main()
