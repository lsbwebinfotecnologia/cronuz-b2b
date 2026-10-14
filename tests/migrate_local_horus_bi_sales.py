import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.db.session import engine
from sqlalchemy import text

sql_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "deploy", "create_horus_bi_sales_table.sql"))

with open(sql_file, "r") as f:
    sql = f.read()

with engine.connect() as conn:
    try:
        conn.execute(text(sql))
        conn.commit()
        print("✅ Tabela horus_bi_sales e índices criados com sucesso no banco local!")
    except Exception as e:
        print(f"⚠️ Erro ao criar tabela: {e}")
        conn.rollback()
