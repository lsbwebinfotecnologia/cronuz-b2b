"""
Aplica no PostgreSQL LOCAL o script de DDL do módulo API Horus Complementar / Bridge Desktop:
  deploy/DEPLOY_HORUS_API_BRIDGE.sql
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

sql_path = os.path.join(ROOT, "deploy", "DEPLOY_HORUS_API_BRIDGE.sql")
with open(sql_path, encoding="utf-8") as f:
    sql_content = f.read()

conn = psycopg2.connect(url)
try:
    with conn.cursor() as cur:
        cur.execute(sql_content)
    conn.commit()
    print("OK: DDL DEPLOY_HORUS_API_BRIDGE.sql aplicado com sucesso no PostgreSQL LOCAL.")
finally:
    conn.close()
