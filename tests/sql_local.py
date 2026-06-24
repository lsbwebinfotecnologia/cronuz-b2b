import asyncio
from app.db.session import SessionLocal
from sqlalchemy import text

def run():
    db = SessionLocal()
    queries = [
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS inter_enabled BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS inter_sandbox BOOLEAN DEFAULT TRUE;",
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS inter_client_id VARCHAR(255);",
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS inter_client_secret VARCHAR(255);",
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS inter_cert_path VARCHAR(500);",
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS inter_key_path VARCHAR(500);",
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS inter_account_number VARCHAR(50);",

        "ALTER TABLE fin_installment ADD COLUMN IF NOT EXISTS bank_slip_provider VARCHAR(50);",
        "ALTER TABLE fin_installment ADD COLUMN IF NOT EXISTS bank_slip_nosso_numero VARCHAR(255);",
        "ALTER TABLE fin_installment ADD COLUMN IF NOT EXISTS bank_slip_linha_digitavel VARCHAR(255);",
        "ALTER TABLE fin_installment ADD COLUMN IF NOT EXISTS bank_slip_codigo_barras VARCHAR(255);",
        "ALTER TABLE fin_installment ADD COLUMN IF NOT EXISTS bank_slip_pdf_url VARCHAR(500);"
    ]
    for q in queries:
        try:
            db.execute(text(q))
            db.commit()
            print(f"Executed: {q}")
        except Exception as e:
            print(f"Error on {q}: {e}")
            db.rollback()

if __name__ == "__main__":
    run()
