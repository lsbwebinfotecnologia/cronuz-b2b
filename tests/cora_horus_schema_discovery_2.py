"""
Descoberta SOMENTE LEITURA (parte 2) — Boleto Cora x Horus.

Verifica:
  - tabelas de UF / municípios (para montar endereço do sacado);
  - amostras de LANCTOS_CRECEBERA (parcelas) já com boleto registrado (LINHA_DIGITAVEL / COD_SOLICITACAO);
  - contas/carteiras (BCONTAC_CARTEIRA) e formas de pagamento cadastradas (procura banco Cora = 403).

Uso:
    cd backend && ./venv/bin/python ../tests/cora_horus_schema_discovery_2.py [company_id]
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


def dump(title, rows):
    print(f"\n== {title} ==")
    print(json.dumps(rows, default=str, indent=1, ensure_ascii=False))


def main():
    db = SessionLocal()
    try:
        q = db.query(CompanySettings).filter(CompanySettings.horus_sql_enabled.is_(True))
        if len(sys.argv) > 1:
            q = q.filter(CompanySettings.company_id == int(sys.argv[1]))
        s = q.first()
        if not s:
            print("Nenhum seller com Horus SQL.")
            return
        c = HorusSQLClient(db, s.company_id)

        dump("Tabelas UF/MUNICIPIO", c.query(
            """SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
               WHERE TABLE_NAME LIKE '%MUNIC%' OR TABLE_NAME LIKE 'UF%' OR TABLE_NAME LIKE '%ESTADO%'
                  OR TABLE_NAME LIKE '%CIDADE%' ORDER BY TABLE_NAME""", max_rows=50))

        for t in ("MUNICIPIOS", "UF", "TABELA_UF", "TABELA_MUNICIPIOS", "ESTADOS"):
            cols = c.query(
                "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = %s ORDER BY ORDINAL_POSITION",
                (t,), max_rows=50)
            if cols:
                dump(f"Colunas {t}", cols)

        dump("Parcelas com boleto registrado (CRECEBERA)", c.query(
            """SELECT TOP 5 NRO_LANCTO_CRECEBER, COD_PARCELA, COD_FILIAL, COD_FORMA, COD_BANCO, COD_AGENCIA,
                      COD_CONTAC, NRO_CARTEIRA, NRO_CONTROLE, STA_LANCTO_CRECEBER, COD_BORDERO,
                      CODIGO_BARRAS, LINHA_DIGITAVEL, COD_SOLICITACAO, LEFT(PIX, 60) AS PIX, CAMINHO_PDF,
                      TPO_EMISSAO, STA_GERACAO, NRO_DOCUM_BAIXA, DAT_ULT_ATL
               FROM LANCTOS_CRECEBERA
               WHERE (LINHA_DIGITAVEL IS NOT NULL AND LINHA_DIGITAVEL <> '') OR (COD_SOLICITACAO IS NOT NULL AND COD_SOLICITACAO <> '')
               ORDER BY DAT_ULT_ATL DESC""", max_rows=5))

        dump("Contagem CRECEBERA por banco (títulos AB)", c.query(
            """SELECT COD_BANCO, COD_FORMA, COUNT(*) AS QTD,
                      SUM(CASE WHEN LINHA_DIGITAVEL IS NOT NULL AND LINHA_DIGITAVEL <> '' THEN 1 ELSE 0 END) AS COM_LINHA
               FROM LANCTOS_CRECEBERA WHERE STA_LANCTO_CRECEBER = 'AB'
               GROUP BY COD_BANCO, COD_FORMA ORDER BY QTD DESC""", max_rows=50))

        dump("Amostra CRECEBERA dos títulos AB mais recentes", c.query(
            """SELECT TOP 3 * FROM LANCTOS_CRECEBERA WHERE STA_LANCTO_CRECEBER = 'AB' AND COD_FILIAL = %s
               ORDER BY NRO_LANCTO_CRECEBER DESC""", (c.cod_filial,), max_rows=3))

        dump("BCONTAC_CARTEIRA", c.query(
            "SELECT COD_BANCO, COD_AGENCIA, COD_EMPRESA, COD_FILIAL, COD_CONTAC, NRO_CARTEIRA, TIPO_COBRANCA, ESPECIE FROM BCONTAC_CARTEIRA",
            max_rows=50))
        dump("BBANCOS", c.query("SELECT COD_BANCO, DESC_COD_BANCO, DESC_BANCO, CARTEIRA FROM BBANCOS", max_rows=100))
        dump("FORMA_PAGTO", c.query(
            "SELECT COD_FORMA, NOM_FORMA, TIPO_FORMA, COD_BANCO, COD_AGENCIA, COD_CONTAC, BOLETO_PROPOSTA FROM FORMA_PAGTO",
            max_rows=100))
        dump("Endereço amostra (cliente 1º título)", c.query(
            "SELECT TOP 2 * FROM ENDERECOS_CLIENTE WHERE COD_CLI = 15432", max_rows=2))
    finally:
        db.close()


if __name__ == "__main__":
    main()
