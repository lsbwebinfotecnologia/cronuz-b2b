"""
Descoberta SOMENTE LEITURA da estrutura de títulos a receber do Horus (SQL Server)
para a integração Boleto Cora.

Uso:
    cd backend && ./venv/bin/python ../tests/cora_horus_schema_discovery.py [company_id]

Nenhum INSERT/UPDATE/DELETE é executado. Apenas SELECT em INFORMATION_SCHEMA
e amostras (TOP 3) dos títulos em aberto.
"""
import os
import sys
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

import importlib  # noqa: E402
import pkgutil  # noqa: E402
import app.models as _models_pkg  # noqa: E402

for _m in pkgutil.iter_modules(_models_pkg.__path__):
    importlib.import_module(f"app.models.{_m.name}")

from app.db.session import SessionLocal  # noqa: E402
from app.models.company_settings import CompanySettings  # noqa: E402
from app.integrators.horus_sql_client import HorusSQLClient  # noqa: E402

TABLES = (
    "LANCTOS_CRECEBER", "LANCTOS_CRECEBERA", "BORDERO", "CLIENTES",
    "ENDERECOS_CLIENTE", "BCONTAC_CARTEIRA", "BBANCOS", "FORMA_PAGTO",
)


def main():
    db = SessionLocal()
    try:
        q = db.query(CompanySettings).filter(CompanySettings.horus_sql_enabled.is_(True))
        if len(sys.argv) > 1:
            q = q.filter(CompanySettings.company_id == int(sys.argv[1]))
        sellers = q.all()
        print("Sellers com Horus SQL:", [(s.company_id, s.horus_sql_host, s.horus_sql_database) for s in sellers])
        if not sellers:
            return
        s = sellers[0]
        client = HorusSQLClient(db, s.company_id)
        placeholders = ", ".join(["%s"] * len(TABLES))
        cols = client.query(
            f"""
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME IN ({placeholders})
            ORDER BY TABLE_NAME, ORDINAL_POSITION
            """,
            TABLES,
            max_rows=2000,
        )
        current = None
        for c in cols:
            if c["TABLE_NAME"] != current:
                current = c["TABLE_NAME"]
                print(f"\n== {current} ==")
            print(f"  {c['COLUMN_NAME']:<32} {c['DATA_TYPE']}({c['CHARACTER_MAXIMUM_LENGTH']}) null={c['IS_NULLABLE']}")

        # Tabelas candidatas a cadastro de cliente / boleto
        cand = client.query(
            """
            SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_NAME LIKE '%CLIENTE%' OR TABLE_NAME LIKE '%BOLET%'
               OR TABLE_NAME LIKE '%COBRAN%' OR TABLE_NAME LIKE '%BANCO%'
               OR TABLE_NAME LIKE '%FORMA%PAG%' OR TABLE_NAME LIKE '%CARTEIRA%'
            ORDER BY TABLE_NAME
            """,
            max_rows=200,
        )
        print("\nTabelas candidatas:", [r["TABLE_NAME"] for r in cand])

        sample = client.query(
            """
            SELECT TOP 3 * FROM LANCTOS_CRECEBER
            WHERE STA_LANCTO_CRECEBER = 'AB' AND COD_FILIAL = %s
            ORDER BY NRO_LANCTO_CRECEBER DESC
            """,
            (client.cod_filial,),
            max_rows=3,
        )
        print("\nAmostra LANCTOS_CRECEBER (AB):")
        print(json.dumps(sample, default=str, indent=2, ensure_ascii=False))
    finally:
        db.close()


if __name__ == "__main__":
    main()
