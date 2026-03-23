import os
import urllib.parse
from sqlalchemy import create_engine, text

# Fallback se a variavel de ambiente nao existir
SQLALCHEMY_DATABASE_URL = os.environ.get(
    "DATABASE_URL", 
    "postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b"
)

engine = create_engine(SQLALCHEMY_DATABASE_URL)

def run_migration():
    try:
        with engine.begin() as conn:
            print("Verificando colunas faltantes na tabela leads...")
            queries = [
                "ALTER TABLE leads ADD COLUMN IF NOT EXISTS source VARCHAR(100);",
                "ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to INTEGER;",
                "ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);",
                "ALTER TABLE leads ADD COLUMN IF NOT EXISTS role VARCHAR(100);",
                "ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_id INTEGER;"
            ]
            for query in queries:
                conn.execute(text(query))
                
            print("Migração concluída com sucesso! Banco atualizado.")
    except Exception as e:
        print(f"Erro ao executar migração: {e}")

if __name__ == "__main__":
    run_migration()
