"""
Descoberta SOMENTE LEITURA (parte 3) — onde o Horus guarda o NOME do município.
Uso: cd backend && ./venv/bin/python ../tests/cora_horus_schema_discovery_3.py
"""
import os
import sys
import json
import importlib
import pkgutil

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
import app.models as _models_pkg  # noqa: E402

for _m in pkgutil.iter_modules(_models_pkg.__path__):
    importlib.import_module(f"app.models.{_m.name}")

from app.db.session import SessionLocal  # noqa: E402
from app.models.company_settings import CompanySettings  # noqa: E402
from app.integrators.horus_sql_client import HorusSQLClient  # noqa: E402


def main():
    db = SessionLocal()
    try:
        s = db.query(CompanySettings).filter(CompanySettings.horus_sql_enabled.is_(True)).first()
        c = HorusSQLClient(db, s.company_id)
        print(json.dumps(c.query(
            """SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
               WHERE COLUMN_NAME LIKE '%MUNIC%' OR COLUMN_NAME LIKE '%CIDADE%'
               ORDER BY TABLE_NAME""", max_rows=300), indent=1, default=str))
        print(json.dumps(c.query("SELECT TOP 3 * FROM IBS_MUNICIPIOS_UF_ALIQ", max_rows=3), indent=1, default=str))
        print(json.dumps(c.query("SELECT TOP 3 * FROM TABELA_UF WHERE COD_UF = 26", max_rows=3), indent=1, default=str))
        print("VERSION:", c.query("SELECT @@VERSION AS v", max_rows=1))
    finally:
        db.close()


if __name__ == "__main__":
    main()
