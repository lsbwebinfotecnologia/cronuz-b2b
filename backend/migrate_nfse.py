import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine, Base
from app.models.company import Company
from app.models.financial import FinancialTransaction
from app.models.nfse import NFSeQueue
from sqlalchemy import text

fields = [
    "nfse_enabled BOOLEAN DEFAULT FALSE",
    "nfse_environment VARCHAR(50) DEFAULT 'HOMOLOGACAO'",
    "razao_social VARCHAR(255)",
    "inscricao_municipal VARCHAR(50)",
    "codigo_municipio_ibge VARCHAR(20)",
    "regime_tributario VARCHAR(50)",
    "optante_simples_nacional BOOLEAN DEFAULT FALSE",
    "cert_path VARCHAR(500)",
    "cert_password VARCHAR(255)"
]

def run_migration():
    print("Starting NFSe PostgreSQL Migration...")
    
    # 1. Patch Company Table
    with engine.connect() as conn:
        for field in fields:
            try:
                with conn.begin_nested():
                    conn.execute(text(f"ALTER TABLE cmp_company ADD COLUMN {field}"))
                print(f"Added {field}")
            except Exception as e:
                print(f"Skipping {field} - Exists or err: {e}")
        
        conn.commit()

    # 2. Create NFSeQueue Table
    Base.metadata.create_all(bind=engine, tables=[
        NFSeQueue.__table__
    ])
    print("NFSeQueue table checked/created successfully!")

if __name__ == "__main__":
    run_migration()
