"""
Aplica no PostgreSQL LOCAL os scripts do Módulo Banco Cora:
  1. deploy/DEPLOY_MODULO_BANCO_CORA_2_remove_antigo.sql  (remove estrutura antiga Cora x Horus — vazia)
  2. deploy/DEPLOY_MODULO_BANCO_CORA_1_estrutura.sql      (cria a nova estrutura)

Recusa executar se DATABASE_URL não for local, e aborta a remoção se houver dados na estrutura antiga.
Uso: cd backend && ./venv/bin/python ../tests/apply_cora_module_ddl_local.py
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
        cur.execute("SELECT to_regclass('public.fin_cora_invoice')")
        if cur.fetchone()[0]:
            cur.execute("SELECT COUNT(*) FROM fin_cora_invoice")
            if cur.fetchone()[0] > 0:
                sys.exit("Abortado: fin_cora_invoice possui dados no banco local.")
        cur.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='cmp_settings' AND column_name='cora_client_id'"
        )
        if cur.fetchone():
            cur.execute("SELECT COUNT(*) FROM cmp_settings WHERE cora_client_id IS NOT NULL OR cora_enabled")
            if cur.fetchone()[0] > 0:
                sys.exit("Abortado: há credenciais Cora antigas preenchidas em cmp_settings no banco local.")
        cur.execute(read("DEPLOY_MODULO_BANCO_CORA_2_remove_antigo.sql"))
        cur.execute(read("DEPLOY_MODULO_BANCO_CORA_1_estrutura.sql"))
    conn.commit()
    print("OK: estrutura antiga removida e módulo Banco Cora criado no banco LOCAL.")
finally:
    conn.close()
