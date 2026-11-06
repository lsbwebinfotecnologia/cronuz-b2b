"""
payments_sync_job.py
--------------------
Conciliação de reserva do Hub de Pagamentos (caso um webhook se perca).

Economia de recursos:
  - Só cobranças ativas e em aberto de provedores operacionais (hoje: CORA).
  - Máx. 100 por empresa/execução, priorizando nunca sincronizadas ou mais antigas.
  - Vencimento próximo ou passado: revalida a cada 25 min; demais: a cada 6 h.
  - Uma única sessão mTLS por empresa/ambiente.
"""
import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, or_

from app.db.session import SessionLocal

logger = logging.getLogger("background_jobs")

MAX_PER_COMPANY = 200
OPERATIONAL_PROVIDERS = ("CORA",)


def run_payments_sync_job():
    from app.models.cora import CoraConfig
    from app.models.payments import PayCharge, PayChargeEvent, PayProviderEnablement
    from app.payments import service
    from app.payments.base import PaymentProviderError
    from app.payments.registry import get_provider
    from app.payments.settlement import handle_charge_status_change

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        enabled = db.query(PayProviderEnablement.company_id, PayProviderEnablement.provider).filter(
            PayProviderEnablement.enabled.is_(True), PayProviderEnablement.provider.in_(OPERATIONAL_PROVIDERS)
        ).all()
        for company_id, provider_code in enabled:
            # 1) Sincroniza cobranças em aberto (mesmo que o cliente pague antecipado antes do vencimento)
            charges = db.query(PayCharge).filter(
                PayCharge.company_id == company_id,
                PayCharge.provider == provider_code,
                PayCharge.is_active.is_(True),
                PayCharge.provider_charge_id.isnot(None),
                PayCharge.status.in_(service.OPEN_STATUSES),
                or_(
                    PayCharge.last_synced_at.is_(None),
                    PayCharge.last_synced_at < now - timedelta(minutes=25),
                ),
            ).order_by(PayCharge.last_synced_at.asc().nullsfirst()).limit(MAX_PER_COMPANY).all()

            by_env = defaultdict(list)
            for c in charges:
                by_env[c.environment].append(c)
            changed = 0
            for env, items in by_env.items():
                try:
                    with get_provider(db, company_id, provider_code, environment=env) as provider:
                        for c in items:
                            if service.sync_charge(db, c, provider=provider, source="JOB"):
                                changed += 1
                except PaymentProviderError as e:
                    logger.warning("[PaymentsSyncJob] company=%s %s/%s: %s", company_id, provider_code, env, e)
                except Exception as e:
                    db.rollback()
                    logger.error("[PaymentsSyncJob] Falha company=%s %s/%s: %s", company_id, provider_code, env, e)

            # 2) Garante que cobranças PAID que ainda não tiveram baixa registrada (ex: ativou config depois) sejam baixadas
            cora_cfg = db.query(CoraConfig).filter(CoraConfig.company_id == company_id).first()
            if cora_cfg and (cora_cfg.horus_baixa_enabled or cora_cfg.cronuz_baixa_enabled):
                settled_subq = db.query(PayChargeEvent.charge_id).filter(
                    PayChargeEvent.company_id == company_id,
                    PayChargeEvent.event_type.in_(("horus_settled", "cronuz_settled")),
                )
                pending_paid = db.query(PayCharge).filter(
                    PayCharge.company_id == company_id,
                    PayCharge.provider == provider_code,
                    PayCharge.status == "PAID",
                    ~PayCharge.id.in_(settled_subq),
                ).order_by(PayCharge.paid_at.desc().nullslast()).limit(50).all()
                for pc in pending_paid:
                    try:
                        handle_charge_status_change(db, pc, "OPEN", "PAID")
                    except Exception as e:
                        logger.error("[PaymentsSyncJob] Falha ao reprocessar baixa charge=%s: %s", pc.id, e)

            if charges:
                logger.info("[PaymentsSyncJob] company=%s %s verificadas=%s alteradas=%s", company_id, provider_code, len(charges), changed)
    finally:
        db.close()
