"""
horus_bordero.py
----------------
Serviço único de geração de Borderô de baixa no SQL Server do Horus ERP.

Compartilhado por:
  - Financeiro Vindi (api/horus_financial.py)
  - Boleto Banco Cora (api/horus_cora.py / jobs)

Garantias:
  - Transação atômica (BEGIN/COMMIT TRAN + ROLLBACK) via HorusSQLClient.execute_transaction.
  - Numeração do borderô protegida contra corrida com UPDLOCK/HOLDLOCK no MAX(COD_BORDERO).
  - Atualizações em lotes de 500 para respeitar o limite de parâmetros do SQL Server.
"""
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, List, Optional

from app.integrators.horus_sql_client import HorusSQLClient

logger = logging.getLogger(__name__)

_BATCH = 500


@dataclass
class BorderoBankParams:
    forma_pagto: str
    banco: str
    agencia: str
    conta: str
    carteira: str

    def missing_fields(self) -> List[str]:
        labels = {
            "Forma de Pagamento": self.forma_pagto,
            "Código do Banco": self.banco,
            "Agência": self.agencia,
            "Conta Corrente": self.conta,
            "Carteira": self.carteira,
        }
        return [name for name, val in labels.items() if not val or not str(val).strip()]


@dataclass
class BorderoRelease:
    nro_lancamento: int
    valor: float
    cod_parcela: Optional[int] = None  # quando informado, restringe o UPDATE em LANCTOS_CRECEBERA


def create_bordero(
    sql_client: HorusSQLClient,
    bank: BorderoBankParams,
    releases: Iterable[BorderoRelease],
    company_id: int,
    file_prefix: str = "cronuz",
) -> int:
    """
    Gera o borderô de liquidação no Horus e vincula os lançamentos informados.
    Retorna o COD_BORDERO criado. Levanta exceção (com rollback) em qualquer falha.
    """
    items = list(releases)
    if not items:
        raise ValueError("Nenhum lançamento informado para o borderô.")
    missing = bank.missing_fields()
    if missing:
        raise ValueError(f"Parâmetros bancários incompletos: {', '.join(missing)}.")

    cod_empresa = sql_client.cod_empresa
    cod_filial = sql_client.cod_filial
    total = round(sum(float(r.valor) for r in items), 2)
    lancto_ids = sorted({int(r.nro_lancamento) for r in items})
    parcela_pairs = [(int(r.nro_lancamento), int(r.cod_parcela)) for r in items if r.cod_parcela is not None]
    nom_arquivo = f"{file_prefix}{datetime.now().strftime('%d-%m-%y')}"[:30]

    def _tx(cur) -> int:
        cur.execute("SELECT ISNULL(MAX(COD_BORDERO), 0) + 1 AS next_id FROM BORDERO WITH (UPDLOCK, HOLDLOCK)")
        row = cur.fetchone()
        id_bordero = int(row["next_id"] if isinstance(row, dict) else row[0])

        logger.info(
            "[HorusBordero] Criando Bordero #%s company=%s total=R$ %.2f itens=%s origem=%s",
            id_bordero, company_id, total, len(items), file_prefix,
        )

        cur.execute(
            """
            INSERT INTO BORDERO (
                COD_EMPRESA, COD_FILIAL, COD_FORMA, COD_BORDERO,
                VLR_TOT_BORDERO, STA_BORDERO, STA_APROVACAO, USU_APROVACAO,
                TPO_BORDERO, NOM_ARQUIVO, SEQ_NOME, SEQ_REMESSA,
                NOM_USU, COD_BANCO, COD_AGENCIA, COD_CONTAC, NRO_CARTEIRA,
                DAT_ULT_ATL, DAT_GERACAO
            ) VALUES (
                %s, %s, %s, %s,
                %s, 'AP', 'S', 'dbo',
                'CAR', %s, '', '',
                'dbo', %s, %s, %s, %s,
                GETDATE(), GETDATE()
            )
            """,
            (
                cod_empresa, cod_filial, bank.forma_pagto.strip(), id_bordero,
                total, nom_arquivo,
                bank.banco.strip(), bank.agencia.strip(), bank.conta.strip(), bank.carteira.strip(),
            ),
        )

        for i in range(0, len(lancto_ids), _BATCH):
            b_ids = lancto_ids[i:i + _BATCH]
            placeholders = ", ".join(["%s"] * len(b_ids))
            cur.execute(
                f"""
                UPDATE LANCTOS_CRECEBER SET COD_BORDERO = %s
                WHERE COD_FILIAL = %s AND NRO_LANCTO_CRECEBER IN ({placeholders})
                """,
                tuple([id_bordero, cod_filial] + b_ids),
            )

        if parcela_pairs:
            # Cora: baixa exatamente a parcela do boleto
            for nro, parcela in parcela_pairs:
                cur.execute(
                    """
                    UPDATE LANCTOS_CRECEBERA SET COD_BORDERO = %s
                    WHERE COD_FILIAL = %s AND NRO_LANCTO_CRECEBER = %s AND COD_PARCELA = %s
                    """,
                    (id_bordero, cod_filial, nro, parcela),
                )
        else:
            # Vindi: comportamento original (todas as parcelas do lançamento)
            for i in range(0, len(lancto_ids), _BATCH):
                b_ids = lancto_ids[i:i + _BATCH]
                placeholders = ", ".join(["%s"] * len(b_ids))
                cur.execute(
                    f"""
                    UPDATE LANCTOS_CRECEBERA SET COD_BORDERO = %s
                    WHERE COD_FILIAL = %s AND NRO_LANCTO_CRECEBER IN ({placeholders})
                    """,
                    tuple([id_bordero, cod_filial] + b_ids),
                )
        return id_bordero

    return sql_client.execute_transaction(_tx)
