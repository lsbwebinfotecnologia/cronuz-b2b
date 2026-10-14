import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.db.session import engine
from sqlalchemy import text

cols = [
    ("sales_cfops", "VARCHAR(500) DEFAULT '5101,5102,6101,6102,5114,6114,5115,6115,5403,6403,5405,6405'"),
    ("consign_cfops", "VARCHAR(500) DEFAULT '5917,6917'"),
    ("dev_sales_cfops", "VARCHAR(500) DEFAULT '1201,1202,2201,2202,1411,2411'"),
    ("dev_consign_cfops", "VARCHAR(500) DEFAULT '1918,2918'"),
    ("horus_bi_sync_enabled", "BOOLEAN NOT NULL DEFAULT FALSE")
]

with engine.connect() as conn:
    for col_name, col_def in cols:
        try:
            conn.execute(text(f"ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS {col_name} {col_def};"))
            conn.commit()
            print(f"✅ Coluna {col_name} verificada/adicionada com sucesso.")
        except Exception as e:
            print(f"⚠️ Erro/Pulo na coluna {col_name}: {e}")
            conn.rollback()

print("🎉 Migração local concluída.")
