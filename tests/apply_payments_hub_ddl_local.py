"""
Aplica no PostgreSQL LOCAL a estrutura do Hub de Pagamentos + Banco Cora:
  - deploy/DEPLOY_MODULO_BANCO_CORA_1_estrutura.sql
  - deploy/DEPLOY_MODULO_BANCO_CORA_3_habilitacao_inicial.sql (somente INSERT em tabela nova)

Recusa executar se DATABASE_URL não for local.
Uso: cd backend && ./venv/bin/python ../tests/apply_payments_hub_ddl_local.py
"""
import os
import sys

import psycopg2
from dotenv import load_dotenv

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(ROOT, "backend", ".env"))
url = os.environ.get("DATABASE_URL", "")
if "localhost" not in url and "127.0.0.1" not in url:
    sys.exit("Abortado: DATABASE_URL não aponta para o banco local.")


def read(name):
    return open(os.path.join(ROOT, "deploy", name), encoding="utf-8").read()


conn = psycopg2.connect(url)
try:
    with conn.cursor() as cur:
        cur.execute(read("DEPLOY_MODULO_BANCO_CORA_1_estrutura.sql"))
        cur.execute(read("DEPLOY_MODULO_BANCO_CORA_3_habilitacao_inicial.sql"))
        cur.execute("SELECT company_id, provider, enabled FROM pay_provider_enablement ORDER BY company_id, provider")
        rows = cur.fetchall()
    conn.commit()
    print("OK: Hub de Pagamentos aplicado no banco LOCAL.")
    print("Habilitações carregadas:", rows)
finally:
    conn.close()
