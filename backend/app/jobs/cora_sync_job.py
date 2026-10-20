"""
cora_sync_job.py
----------------
Job de reserva (fallback do webhook) do Boleto Cora x Horus.

Regras de economia de recursos (servidor e API do Cora):
  - Somente sellers com Horus SQL + feature Cora + Cora ativo.
  - Por execução, no máximo 100 faturas por seller, priorizando as nunca/mais antigas sincronizadas.
  - Faturas com vencimento distante só são revalidadas a cada 6h; próximas/vencidas a cada 25 min.
  - Reaproveita a gravação reversa e a baixa automática conforme as flags do seller.
"""
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, or_

from app.db.session import SessionLocal

logger = logging.getLogger("background_jobs")

MAX_PER_COMPANY = 100


def run_cora_sync_job():
    from app.api.horus_cora import _sync_and_maybe_baixa
    from app.models.company_settings import CompanySettings
    from app.models.cora_invoice import CoraInvoice
    from app.services.cora_horus import OPEN_STATUSES

    db = SessionLocal()
    try:
        sellers = db.query(CompanySettings).filter(
            CompanySettings.horus_sql_enabled.is_(True),
            CompanySettings.horus_sql_feature_cora_boleto.is_(True),
            CompanySettings.cora_enabled.is_(True),
        ).all()
        if not sellers:
            return

        now = datetime.now(timezone.utc)
        near_due = date.today() + timedelta(days=1)
        for settings in sellers:
            company_id = settings.company_id
            try:
                invoices = db.query(CoraInvoice).filter(
                    CoraInvoice.company_id == company_id,
                    CoraInvoice.is_active.is_(True),
                    CoraInvoice.cora_invoice_id.isnot(None),
                    CoraInvoice.status.in_(list(OPEN_STATUSES)),
                    or_(
                        CoraInvoice.last_synced_at.is_(None),
                        and_(CoraInvoice.due_date <= near_due, CoraInvoice.last_synced_at < now - timedelta(minutes=25)),
                        CoraInvoice.last_synced_at < now - timedelta(hours=6),
                    ),
                ).order_by(CoraInvoice.last_synced_at.asc().nullsfirst()).limit(MAX_PER_COMPANY).all()

                # Pagas ainda sem baixa (ex.: borderô falhou antes) entram para nova tentativa
                if settings.cora_horus_auto_baixa:
                    invoices += db.query(CoraInvoice).filter(
                        CoraInvoice.company_id == company_id,
                        CoraInvoice.status == "PAID",
                        CoraInvoice.cod_bordero_baixa.is_(None),
                    ).limit(MAX_PER_COMPANY).all()

                if not invoices:
                    continue
                result = _sync_and_maybe_baixa(db, settings, company_id, invoices)
                logger.info("[CoraSyncJob] company=%s verificados=%s atualizados=%s baixa=%s",
                            company_id, len(invoices), result.get("updated"), result.get("baixa"))
            except Exception as e:
                db.rollback()
                logger.error("[CoraSyncJob] Falha company=%s: %s", company_id, e)
    finally:
        db.close()
