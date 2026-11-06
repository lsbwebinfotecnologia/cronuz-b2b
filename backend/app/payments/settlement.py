"""
settlement.py
-------------
Rotina de Baixa Automática e Conciliação de Retorno para cobranças liquidadas (status = PAID) do Banco Cora.

Regras arquiteturais mandatórias:
1. 100% isolado da rotina da Vindi — jamais lê ou altera `horus_banco_*` de `CompanySettings`.
   Toda a parametrização do Cora fica em `CoraConfig` (`fin_cora_config`).
2. Trava dupla de dependência:
   - Cenário 1 (Cronuz Nativo): Atua sobre origens nativas (`FINANCIAL`, `B2B_ORDER`, `B2C_ORDER`, `PDV`, `MANUAL`)
     quando `cora_config.cronuz_baixa_enabled = True`, liquidando `FinancialInstallment` e gerando lançamento
     em `FinancialCashFlowLog` na conta `cronuz_account_id`.
   - Cenário 2 (Cora + Horus ERP): Só executa se, e somente se:
     a) `charge.provider == "CORA"` e o Banco Cora estiver habilitado para a empresa (`is_enabled(db, company_id, "CORA")`);
     b) A integração Horus SQL estiver habilitada para a empresa (`settings.horus_sql_enabled == True`);
     c) A chave `cora_config.horus_baixa_enabled == True` estiver ativa no painel do Seller;
     d) Os códigos obrigatórios do Horus (`horus_cod_banco`, `horus_cod_agencia`, `horus_cod_contac`) estiverem preenchidos.
3. Ao atualizar `LANCTOS_CRECEBERA` de `'AB'` para `'PG'` com `COD_BANCO`, `COD_AGENCIA`, `COD_CONTAC` e `COD_FORMA`,
   a trigger nativa `TRG_IMP_LANCTO_CRECEBER` do Horus insere automaticamente o lançamento bancário em `BLANCTOS`
   com `STA_FECHADO = 'N'` e `DATA_FECHAMENTO = NULL` (em aberto para o operador realizar o fechamento de banco).
"""
import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.company_settings import CompanySettings
from app.models.cora import CoraConfig
from app.models.financial import FinancialAccount, FinancialCashFlowLog, FinancialInstallment, FinancialTransaction
from app.models.payments import PayCharge, PayChargeEvent
from app.payments.registry import is_enabled

logger = logging.getLogger(__name__)

CRONUZ_NATIVE_ORIGINS = ("FINANCIAL", "B2B_ORDER", "B2C_ORDER", "PDV", "MANUAL")
HORUS_ORIGINS = ("HORUS_INVOICE", "HORUS_API", "HORUS_SQL")


def _record_settlement_event(
    db: Session,
    charge: PayCharge,
    event_type: str,
    message: str,
) -> None:
    db.add(PayChargeEvent(
        company_id=charge.company_id,
        charge_id=charge.id,
        provider=charge.provider,
        source="SETTLEMENT",
        event_type=event_type,
        status_before="PAID",
        status_after=charge.status,
        message=(message or "")[:500] or None,
    ))


def _already_settled(db: Session, charge_id: int, event_type: str) -> bool:
    return db.query(PayChargeEvent.id).filter(
        PayChargeEvent.charge_id == charge_id,
        PayChargeEvent.event_type == event_type,
    ).first() is not None


def _settle_cronuz_native(db: Session, charge: PayCharge, config: CoraConfig) -> None:
    """Baixa automática de parcelas nativas do Cronuz (`fin_installment` + `fin_cashflow_log`)."""
    if not getattr(config, "cronuz_baixa_enabled", True):
        return
    if _already_settled(db, charge.id, "cronuz_settled"):
        return

    launch_str = (charge.financial_launch_id or "").strip()
    if not launch_str.isdigit():
        return

    installment = (
        db.query(FinancialInstallment)
        .join(FinancialTransaction, FinancialTransaction.id == FinancialInstallment.transaction_id)
        .filter(
            FinancialInstallment.id == int(launch_str),
            FinancialTransaction.company_id == charge.company_id,
        )
        .first()
    )
    if not installment:
        return
    if installment.status == "PAID":
        return

    now = datetime.now(timezone.utc)
    paid_dt = charge.paid_at or now
    paid_amount = float(charge.total_paid if charge.total_paid is not None else (charge.amount or 0))

    installment.status = "PAID"
    installment.payment_date = paid_dt
    installment.amount_paid = paid_amount
    installment.is_conciliated = True
    installment.conciliated_at = now

    account_name = None
    if getattr(config, "cronuz_account_id", None):
        account = db.query(FinancialAccount).filter(
            FinancialAccount.id == config.cronuz_account_id,
            FinancialAccount.company_id == charge.company_id,
            FinancialAccount.active.is_(True),
        ).first()
        if account:
            installment.account_id = account.id
            account.current_balance = float(account.current_balance or 0.0) + paid_amount
            account_name = account.name
            db.add(FinancialCashFlowLog(
                account_id=account.id,
                installment_id=installment.id,
                description=f"Liquidação Boleto Cora #{charge.id} - {charge.description or f'Parcela #{installment.number}'}"[:500],
                movement_type="+",
                amount=paid_amount,
                progressive_balance=account.current_balance,
                movement_date=paid_dt.date() if isinstance(paid_dt, datetime) else date.today(),
            ))

    msg = f"Baixa nativa Cronuz concluída: Parcela #{installment.id} (R$ {paid_amount:.2f})"
    if account_name:
        msg += f" creditada na conta '{account_name}'."
    _record_settlement_event(db, charge, "cronuz_settled", msg)
    db.commit()
    logger.info("[Cora Settlement] %s company=%s charge=%s", msg, charge.company_id, charge.id)


def _settle_horus_erp(db: Session, charge: PayCharge, config: CoraConfig) -> None:
    """
    Baixa automática do título no Horus ERP (`LANCTOS_CRECEBERA` + `LANCTOS_CRECEBER`)
    e geração automática do lançamento bancário em aberto (`BLANCTOS.STA_FECHADO = 'N'`)
    via trigger nativa `TRG_IMP_LANCTO_CRECEBER`.

    TRAVA DE SEGURANÇA E DEPENDÊNCIA:
    Só executa se Cora estiver ativo E Horus SQL estiver ativo E horus_baixa_enabled estiver ativo
    E os códigos obrigatórios (Banco, Agência, Conta) estiverem configurados em `CoraConfig`.
    """
    if not getattr(config, "horus_baixa_enabled", False):
        return
    if _already_settled(db, charge.id, "horus_settled"):
        return

    # 1. Verifica dependência dupla (Cora ativo + Horus SQL ativo para o seller)
    if not is_enabled(db, charge.company_id, "CORA"):
        return
    settings: Optional[CompanySettings] = (
        db.query(CompanySettings).filter(CompanySettings.company_id == charge.company_id).first()
    )
    if not settings or not settings.horus_sql_enabled:
        return

    # 2. Verifica parâmetros bancários obrigatórios do Horus exclusivos do Cora
    cod_banco_str = (getattr(config, "horus_cod_banco", None) or "").strip()
    cod_agencia_str = (getattr(config, "horus_cod_agencia", None) or "").strip()
    cod_contac_str = (getattr(config, "horus_cod_contac", None) or "").strip()
    nro_carteira_str = (getattr(config, "horus_nro_carteira", None) or "").strip()
    cod_forma_str = (getattr(config, "horus_cod_forma", None) or "").strip()

    if not (cod_banco_str.isdigit() and cod_agencia_str.isdigit() and cod_contac_str.isdigit()):
        _record_settlement_event(
            db,
            charge,
            "horus_settle_skipped",
            "Baixa Horus não executada: Código de Banco, Agência e Conta Corrente no Cora precisam ser numéricos.",
        )
        db.commit()
        return

    nro_lancto_str = (charge.financial_launch_id or "").strip()
    if not nro_lancto_str.isdigit():
        return

    nro_lancto = int(nro_lancto_str)
    cod_banco = int(cod_banco_str)
    cod_agencia = int(cod_agencia_str)
    cod_contac = int(cod_contac_str)
    cod_forma = int(cod_forma_str) if cod_forma_str.isdigit() else None
    tarifa_val = Decimal(str(getattr(config, "horus_tarifa_boleto", None) or "0.00")).quantize(Decimal("0.01"))

    paid_val = Decimal(str(charge.total_paid if charge.total_paid is not None else (charge.amount or "0.00"))).quantize(Decimal("0.01"))
    paid_dt = charge.paid_at or datetime.now(timezone.utc)
    paid_date_iso = (paid_dt.date() if isinstance(paid_dt, datetime) else date.today()).strftime("%Y-%m-%d")

    from app.integrators.horus_sql import HorusSQLClient

    try:
        with HorusSQLClient(settings) as sql:
            # Localiza o título aberto em LANCTOS_CRECEBERA
            rows = sql.fetch_all(
                """
                SELECT
                    a.COD_EMPRESA,
                    a.COD_FILIAL,
                    a.NRO_LANCTO_CRECEBER,
                    a.COD_PARCELA,
                    a.STA_LANCTO_CRECEBER,
                    a.COD_FORMA,
                    a.NRO_CARTEIRA,
                    r.VLR_LANCTO_CRECEBER
                FROM LANCTOS_CRECEBERA a
                INNER JOIN LANCTOS_CRECEBER r
                    ON r.COD_EMPRESA = a.COD_EMPRESA
                   AND r.COD_FILIAL = a.COD_FILIAL
                   AND r.NRO_LANCTO_CRECEBER = a.NRO_LANCTO_CRECEBER
                WHERE a.NRO_LANCTO_CRECEBER = %s
                ORDER BY a.COD_PARCELA ASC
                """,
                (nro_lancto,),
            )
            if not rows:
                _record_settlement_event(
                    db,
                    charge,
                    "horus_settle_error",
                    f"Título NRO_LANCTO_CRECEBER #{nro_lancto} não encontrado no Horus SQL.",
                )
                db.commit()
                return

            open_rows = [r for r in rows if str(r.get("STA_LANCTO_CRECEBER") or "").strip().upper() == "AB"]
            if not open_rows:
                _record_settlement_event(
                    db,
                    charge,
                    "horus_settled",
                    f"Título #{nro_lancto} já constava como liquidado no Horus ERP.",
                )
                db.commit()
                return

            target = open_rows[0]
            cod_empresa = int(target["COD_EMPRESA"])
            cod_filial = int(target["COD_FILIAL"])
            cod_parcela = int(target["COD_PARCELA"])
            orig_val = Decimal(str(target.get("VLR_LANCTO_CRECEBER") or "0.00")).quantize(Decimal("0.01"))
            correcao_val = (paid_val - orig_val) if paid_val > orig_val else Decimal("0.00")
            eff_cod_forma = cod_forma if cod_forma is not None else int(target.get("COD_FORMA") or 1)
            eff_carteira = (nro_carteira_str or str(target.get("NRO_CARTEIRA") or "").strip())[:10] or None

            # 1) Atualiza LANCTOS_CRECEBERA (somente se STA_LANCTO_CRECEBER = 'AB')
            # Isso aciona automaticamente a trigger TRG_IMP_LANCTO_CRECEBER que grava em BLANCTOS (STA_FECHADO = 'N')
            sql.execute(
                """
                UPDATE LANCTOS_CRECEBERA
                   SET STA_LANCTO_CRECEBER = 'PG',
                       COD_SITUACAO = 2,
                       VLR_LANCTO_PAGO = %s,
                       VLR_LANCTO_RECEBIDO = %s,
                       VLR_LANCTO_CORRECAO = %s,
                       DAT_PAGTO_CRECEBER = %s,
                       DAT_PAGTO_CONTA = %s,
                       DAT_PAGTO_CRECEBER_REAL = GETDATE(),
                       COD_BANCO = %s,
                       COD_AGENCIA = %s,
                       COD_CONTAC = %s,
                       NRO_CARTEIRA = %s,
                       COD_FORMA = %s,
                       VLR_TARIF_BOL = %s,
                       PROC_RETORNO = 'S',
                       BAIXA_RETORNO = 'S'
                 WHERE COD_EMPRESA = %s
                   AND COD_FILIAL = %s
                   AND NRO_LANCTO_CRECEBER = %s
                   AND COD_PARCELA = %s
                   AND STA_LANCTO_CRECEBER = 'AB'
                """,
                (
                    float(paid_val),
                    float(paid_val),
                    float(correcao_val),
                    paid_date_iso,
                    paid_date_iso,
                    cod_banco,
                    cod_agencia,
                    cod_contac,
                    eff_carteira,
                    eff_cod_forma,
                    float(tarifa_val),
                    cod_empresa,
                    cod_filial,
                    nro_lancto,
                    cod_parcela,
                ),
            )

            # 2) Atualiza o cabeçalho LANCTOS_CRECEBER caso não restem sub-parcelas em aberto
            rem = sql.fetch_one(
                """
                SELECT COUNT(1) AS CNT
                  FROM LANCTOS_CRECEBERA
                 WHERE COD_EMPRESA = %s
                   AND COD_FILIAL = %s
                   AND NRO_LANCTO_CRECEBER = %s
                   AND STA_LANCTO_CRECEBER = 'AB'
                """,
                (cod_empresa, cod_filial, nro_lancto),
            )
            if int((rem or {}).get("CNT") or 0) == 0:
                sql.execute(
                    """
                    UPDATE LANCTOS_CRECEBER
                       SET STA_LANCTO_CRECEBER = 'PG',
                           VLR_LANCTO_PAGO = %s,
                           VLR_LANCTO_RECEBIDO = %s,
                           VLR_LANCTO_CORRECAO = %s,
                           DAT_PAGTO_CRECEBER = %s,
                           DAT_PAGTO_CONTA = %s,
                           DAT_PAGTO_CRECEBER_REAL = GETDATE(),
                           VLR_TARIF_BOL = %s
                     WHERE COD_EMPRESA = %s
                       AND COD_FILIAL = %s
                       AND NRO_LANCTO_CRECEBER = %s
                       AND STA_LANCTO_CRECEBER = 'AB'
                    """,
                    (
                        float(paid_val),
                        float(paid_val),
                        float(correcao_val),
                        paid_date_iso,
                        paid_date_iso,
                        float(tarifa_val),
                        cod_empresa,
                        cod_filial,
                        nro_lancto,
                    ),
                )

            msg = (
                f"Baixa Horus ERP concluída: Lanç. #{nro_lancto}/{cod_parcela} (R$ {paid_val:.2f}) "
                f"no Banco {cod_banco} Ag. {cod_agencia} C/C {cod_contac} (BLANCTOS aberto para fechamento)."
            )
            _record_settlement_event(db, charge, "horus_settled", msg)
            db.commit()
            logger.info("[Cora Settlement] %s company=%s charge=%s", msg, charge.company_id, charge.id)

    except Exception as e:
        db.rollback()
        logger.error("[Cora Settlement] Erro ao baixar título #%s no Horus SQL (charge=%s): %s", nro_lancto, charge.id, e)
        _record_settlement_event(db, charge, "horus_settle_error", f"Falha na baixa Horus (#{nro_lancto}): {e}")
        db.commit()


def handle_charge_status_change(db: Session, charge: PayCharge, old_status: str, new_status: str) -> None:
    """
    Handler universal registrado para todas as origens do `pay_charge`.
    Dispara somente quando `new_status == 'PAID'` e `charge.provider == 'CORA'`.
    """
    if new_status != "PAID" or charge.provider != "CORA":
        return

    config = db.query(CoraConfig).filter(CoraConfig.company_id == charge.company_id).first()
    if not config:
        return

    origin = (charge.origin_type or "").upper()
    if origin in HORUS_ORIGINS or charge.horus_cod_cli or charge.horus_id_guid:
        _settle_horus_erp(db, charge, config)
    elif origin in CRONUZ_NATIVE_ORIGINS:
        _settle_cronuz_native(db, charge, config)


def register_all_settlement_handlers(register_fn) -> None:
    for origin in (*CRONUZ_NATIVE_ORIGINS, *HORUS_ORIGINS):
        register_fn(origin, handle_charge_status_change)
