"""
service.py
----------
Ciclo de vida das cobranças do Hub (pay_charge), independente do intermediador.

  create_charge   → emite no provedor (idempotente por origem ativa)
  sync_charge     → revalida no provedor (fonte da verdade)
  cancel_charge   → cancela (somente não pagas)
  reissue_charge  → "alterar vencimento": cancela e emite nova cobrança vinculada (replaces_charge_id)
  handle_webhook  → registra o evento e revalida
  dashboard       → indicadores e série mensal gerados × pagos

Ganchos de origem: `register_origin_handler(origin_type, fn)` — cada origem (Horus, B2B, B2C...) recebe
os eventos de mudança de status e decide como dar baixa no seu sistema (fase 4).
"""
import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy import and_, case, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.payments import PayCharge, PayChargeEvent
from app.payments.base import ChargePayer, ChargeRequest, ChargeResult, PaymentProvider, PaymentProviderError
from app.payments.registry import get_provider, resolve_provider_code

logger = logging.getLogger(__name__)

OPEN_STATUSES = ("PENDING", "OPEN", "LATE", "IN_PAYMENT")
FINAL_STATUSES = ("PAID", "CANCELLED")

_ORIGIN_HANDLERS: Dict[str, List[Callable]] = {}


def register_origin_handler(origin_type: str, fn: Callable[[Session, PayCharge, str, str], None]) -> None:
    _ORIGIN_HANDLERS.setdefault(origin_type, []).append(fn)


def _notify_origin(db: Session, charge: PayCharge, old: str, new: str) -> None:
    for fn in _ORIGIN_HANDLERS.get(charge.origin_type, []):
        try:
            fn(db, charge, old, new)
        except Exception as e:  # handler de origem nunca derruba o fluxo de pagamento
            logger.error("[Payments] Handler de origem %s falhou charge=%s: %s", charge.origin_type, charge.id, e)


def _event(db: Session, charge: PayCharge, source: str, event_type: str, old: Optional[str] = None,
           message: Optional[str] = None, user_id: Optional[int] = None, external_id: Optional[str] = None) -> None:
    db.add(PayChargeEvent(
        company_id=charge.company_id, charge_id=charge.id, provider=charge.provider, source=source,
        event_type=event_type, external_event_id=external_id, status_before=old, status_after=charge.status,
        message=(message or "")[:500] or None, user_id=user_id,
    ))


def _apply(charge: PayCharge, r: ChargeResult) -> None:
    if r.provider_charge_id:
        charge.provider_charge_id = r.provider_charge_id
    if r.status:
        charge.status = r.status
    for attr in ("digitable_line", "barcode", "our_number", "pix_emv", "pdf_url"):
        val = getattr(r, attr)
        if val:
            setattr(charge, attr, val)
    if r.registered is not None:
        charge.registered = r.registered
    if r.total_paid is not None:
        charge.total_paid = r.total_paid
    if charge.status == "PAID":
        charge.paid_at = r.paid_at or charge.paid_at or datetime.now(timezone.utc)
    if charge.status == "CANCELLED":
        charge.is_active = False
        charge.cancelled_at = charge.cancelled_at or datetime.now(timezone.utc)
    charge.last_synced_at = datetime.now(timezone.utc)
    charge.last_error = None


# ── Emissão ──────────────────────────────────────────────────────────────────

def create_charge(
    db: Session,
    company_id: int,
    *,
    payer: ChargePayer,
    amount: Decimal,
    due_date: date,
    description: str,
    method: str = "BOLETO",
    channel: str = "FINANCIAL",
    provider_code: Optional[str] = None,
    origin_type: str = "MANUAL",
    origin_ref: Optional[str] = None,
    customer_id: Optional[int] = None,
    issue_date: Optional[date] = None,
    order_number: Optional[str] = None,
    pdv_coupon_number: Optional[str] = None,
    financial_launch_id: Optional[str] = None,
    installment_number: Optional[str] = None,
    invoice_number: Optional[str] = None,
    horus_cod_cli: Optional[str] = None,
    horus_id_guid: Optional[str] = None,
    origin_meta: Optional[Dict[str, Any]] = None,
    options: Optional[Dict[str, Any]] = None,
    user_id: Optional[int] = None,
    replaces_charge_id: Optional[int] = None,
    provider: Optional[PaymentProvider] = None,
) -> PayCharge:
    provider_code = provider_code or resolve_provider_code(db, company_id, channel, method)
    own_provider = provider is None
    provider = provider or get_provider(db, company_id, provider_code)
    try:
        provider.validate(method, Decimal(str(amount)), due_date, payer)   # dados inválidos não geram registro
    except PaymentProviderError:
        if own_provider:
            provider.close()
        raise

    # Reaproveita tentativa anterior com erro da mesma origem (mesma Idempotency-Key → sem duplicidade no provedor)
    charge = None
    if origin_ref:
        charge = db.query(PayCharge).filter(
            PayCharge.company_id == company_id, PayCharge.origin_type == origin_type,
            PayCharge.origin_ref == origin_ref, PayCharge.is_active.is_(True),
        ).first()
        if charge and charge.status not in ("ERROR", "PENDING"):
            raise PaymentProviderError(f"Já existe cobrança ativa para esta origem (status {charge.status}).")

    if charge is None:
        charge = PayCharge(
            company_id=company_id, provider=provider_code, environment=provider.environment, method=method,
            channel=channel, origin_type=origin_type, origin_ref=origin_ref, idempotency_key=str(uuid.uuid4()),
            status="PENDING", is_active=True, created_by_user_id=user_id, replaces_charge_id=replaces_charge_id,
        )
        db.add(charge)
    charge.amount = Decimal(str(amount)).quantize(Decimal("0.01"))
    charge.due_date = due_date
    charge.issue_date = issue_date or date.today()
    charge.customer_id = customer_id
    charge.order_number = (str(order_number).strip()[:60] if order_number else None)
    charge.pdv_coupon_number = (str(pdv_coupon_number).strip()[:60] if pdv_coupon_number else None)
    charge.financial_launch_id = (str(financial_launch_id).strip()[:60] if financial_launch_id else None)
    charge.installment_number = (str(installment_number).strip()[:20] if installment_number else None)
    charge.invoice_number = (str(invoice_number).strip()[:60] if invoice_number else None)
    charge.horus_cod_cli = (str(horus_cod_cli).strip()[:40] if horus_cod_cli else None)
    charge.horus_id_guid = (str(horus_id_guid).strip()[:100] if horus_id_guid else None)
    charge.origin_meta = origin_meta
    charge.description = (description or "")[:255]
    charge.payer_name = payer.name[:150] if payer.name else None
    charge.payer_document = re.sub(r"\D", "", payer.document or "")[:20]
    charge.payer_email = (payer.email or None)
    charge.payer_snapshot = payer.as_dict()
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        if own_provider:
            provider.close()
        raise PaymentProviderError("Já existe cobrança ativa para esta origem.")

    # Monta código e descrição de serviço enriquecidos conforme a origem (especialmente Horus ERP)
    opts = dict(options or {})
    if origin_type in ("HORUS_API", "HORUS_SQL") or charge.horus_cod_cli or charge.horus_id_guid:
        parts_code = ["HORUS"]
        if charge.financial_launch_id:
            parts_code.append(f"L{charge.financial_launch_id}")
        if charge.installment_number:
            parts_code.append(f"P{charge.installment_number}")
        if charge.invoice_number:
            parts_code.append(f"NF{charge.invoice_number}")
        parts_code.append(str(charge.id))
        charge.code = "-".join(parts_code)[:80]

        svc_title_parts = ["ERP Horus"]
        if charge.financial_launch_id:
            svc_title_parts.append(f"Lanç. {charge.financial_launch_id}")
        if charge.invoice_number:
            svc_title_parts.append(f"NF {charge.invoice_number}")
        elif charge.order_number:
            svc_title_parts.append(f"Ped. {charge.order_number}")
        opts.setdefault("service_name", " - ".join(svc_title_parts)[:60])

        svc_desc_parts = ["ERP Horus"]
        if charge.financial_launch_id:
            p_str = f"/{charge.installment_number}" if charge.installment_number else ""
            svc_desc_parts.append(f"Lanç: {charge.financial_launch_id}{p_str}")
        if charge.invoice_number:
            svc_desc_parts.append(f"NF: {charge.invoice_number}")
        if charge.order_number:
            svc_desc_parts.append(f"Ped: {charge.order_number}")
        if len(svc_desc_parts) == 1 and charge.description:
            svc_desc_parts.append(charge.description)
        opts.setdefault("service_description", " | ".join(svc_desc_parts)[:100])
    elif origin_type in ("B2B_ORDER", "B2C_ORDER") and charge.order_number:
        charge.code = f"PED-{charge.order_number}-{charge.id}"[:80]
    elif origin_type == "PDV" and charge.pdv_coupon_number:
        charge.code = f"PDV-{charge.pdv_coupon_number}-{charge.id}"[:80]
    elif origin_type == "FINANCIAL" and charge.financial_launch_id:
        charge.code = f"FIN-{charge.financial_launch_id}-{charge.id}"[:80]
    else:
        charge.code = f"{origin_type}-{charge.id}"[:80]

    request = ChargeRequest(
        method=method, amount=charge.amount, due_date=due_date, payer=payer,
        description=charge.description, code=charge.code, idempotency_key=charge.idempotency_key, options=opts,
    )
    try:
        result = provider.create_charge(request)
        old = charge.status
        _apply(charge, result)
        if charge.status == "PENDING":
            charge.status = "OPEN"
        _event(db, charge, "API", "created", old=old, user_id=user_id)
        db.commit()
    except PaymentProviderError as e:
        charge.status = "ERROR"
        charge.last_error = str(e)[:2000]
        _event(db, charge, "API", "error", message=str(e), user_id=user_id)
        db.commit()
        raise
    finally:
        if own_provider:
            provider.close()
    return charge


# ── Sincronização / cancelamento / reemissão ─────────────────────────────────

def sync_charge(db: Session, charge: PayCharge, provider: Optional[PaymentProvider] = None,
                source: str = "SYNC", external_id: Optional[str] = None, commit: bool = True) -> bool:
    """Retorna True se o status mudou."""
    if not charge.provider_charge_id:
        return False
    own = provider is None
    provider = provider or get_provider(db, charge.company_id, charge.provider, environment=charge.environment)
    old = charge.status
    try:
        _apply(charge, provider.get_charge(charge.provider_charge_id))
    except PaymentProviderError as e:
        charge.last_error = f"Sincronização: {e}"[:2000]
        charge.last_synced_at = datetime.now(timezone.utc)
        if commit:
            db.commit()
        return False
    finally:
        if own:
            provider.close()
    changed = charge.status != old
    if changed or external_id:
        _event(db, charge, source, charge.status.lower() if changed else "notified", old=old, external_id=external_id)
    if commit:
        db.commit()
    if changed:
        _notify_origin(db, charge, old, charge.status)
    return changed


def cancel_charge(db: Session, charge: PayCharge, user_id: Optional[int] = None) -> PayCharge:
    if charge.status == "PAID":
        raise PaymentProviderError("Cobrança já paga não pode ser cancelada.")
    if charge.status == "CANCELLED":
        return charge
    old = charge.status
    if charge.provider_charge_id:
        with get_provider(db, charge.company_id, charge.provider, environment=charge.environment) as provider:
            provider.cancel_charge(charge.provider_charge_id)
            try:
                _apply(charge, provider.get_charge(charge.provider_charge_id))
            except PaymentProviderError:
                pass
    if charge.status != "PAID":
        charge.status = "CANCELLED"
        charge.is_active = False
        charge.cancelled_at = charge.cancelled_at or datetime.now(timezone.utc)
    _event(db, charge, "USER", "cancelled", old=old, user_id=user_id)
    db.commit()
    _notify_origin(db, charge, old, charge.status)
    return charge


def reissue_charge(db: Session, charge: PayCharge, new_due_date: date, user_id: Optional[int] = None,
                   new_amount: Optional[Decimal] = None) -> PayCharge:
    """O Cora não permite alterar vencimento: cancela e emite nova cobrança com os mesmos dados."""
    if charge.status == "PAID":
        raise PaymentProviderError("Cobrança já paga não pode ser reemitida.")
    snapshot = dict(charge.payer_snapshot or {})
    payer = ChargePayer(**{k: snapshot.get(k) for k in ChargePayer.__dataclass_fields__})
    cancel_charge(db, charge, user_id=user_id)
    new_charge = create_charge(
        db, charge.company_id, payer=payer, amount=new_amount or charge.amount, due_date=new_due_date,
        description=charge.description or "Cobrança", method=charge.method, channel=charge.channel or "FINANCIAL",
        provider_code=charge.provider, origin_type=charge.origin_type, origin_ref=charge.origin_ref,
        customer_id=charge.customer_id, issue_date=charge.issue_date, order_number=charge.order_number,
        pdv_coupon_number=charge.pdv_coupon_number, financial_launch_id=charge.financial_launch_id,
        installment_number=charge.installment_number, invoice_number=charge.invoice_number,
        horus_cod_cli=charge.horus_cod_cli, horus_id_guid=charge.horus_id_guid, origin_meta=charge.origin_meta,
        user_id=user_id, replaces_charge_id=charge.id,
    )
    _event(db, charge, "USER", "reissued", old="CANCELLED", message=f"Substituída pela cobrança #{new_charge.id}", user_id=user_id)
    db.commit()
    return new_charge


def handle_webhook(db: Session, company_id: int, provider_code: str, provider_charge_id: str,
                   external_event_id: Optional[str] = None) -> None:
    charge = db.query(PayCharge).filter(
        PayCharge.company_id == company_id, PayCharge.provider == provider_code,
        PayCharge.provider_charge_id == provider_charge_id,
    ).first()
    if not charge:
        return
    if external_event_id and db.query(PayChargeEvent.id).filter(
        PayChargeEvent.provider == provider_code, PayChargeEvent.external_event_id == external_event_id
    ).first():
        return  # evento já processado
    sync_charge(db, charge, source="WEBHOOK", external_id=external_event_id)


# ── Consultas ────────────────────────────────────────────────────────────────

def serialize_charge(c: PayCharge) -> Dict[str, Any]:
    today = date.today()
    eff_issue_date = c.issue_date or (c.created_at.date() if c.created_at else None)
    return {
        "id": c.id,
        "provider": c.provider,
        "environment": c.environment,
        "method": c.method,
        "channel": c.channel,
        "origin_type": c.origin_type,
        "origin_ref": c.origin_ref,
        "customer_id": c.customer_id,
        "issue_date": eff_issue_date.isoformat() if eff_issue_date else None,
        "order_number": c.order_number,
        "pdv_coupon_number": c.pdv_coupon_number,
        "financial_launch_id": c.financial_launch_id,
        "installment_number": c.installment_number,
        "invoice_number": c.invoice_number,
        "horus_cod_cli": c.horus_cod_cli,
        "horus_id_guid": c.horus_id_guid,
        "origin_meta": c.origin_meta,
        "provider_charge_id": c.provider_charge_id,
        "code": c.code,
        "status": c.status,
        "is_overdue": bool(c.status in ("OPEN", "LATE") and c.due_date and c.due_date < today),
        "amount": float(c.amount or 0),
        "total_paid": float(c.total_paid) if c.total_paid is not None else None,
        "due_date": c.due_date.isoformat() if c.due_date else None,
        "description": c.description,
        "payer_name": c.payer_name,
        "payer_document": c.payer_document,
        "payer_email": c.payer_email,
        "payer": c.payer_snapshot,
        "digitable_line": c.digitable_line,
        "barcode": c.barcode,
        "our_number": c.our_number,
        "pix_emv": c.pix_emv,
        "has_pdf": bool(c.pdf_url),
        "registered": c.registered,
        "paid_at": c.paid_at.isoformat() if c.paid_at else None,
        "cancelled_at": c.cancelled_at.isoformat() if c.cancelled_at else None,
        "replaces_charge_id": c.replaces_charge_id,
        "last_error": c.last_error,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "last_synced_at": c.last_synced_at.isoformat() if c.last_synced_at else None,
    }


def query_charges(
    db: Session,
    company_id: int,
    *,
    provider: Optional[str] = None,
    tab: Optional[str] = None,
    status: Optional[List[str]] = None,
    due_from: Optional[date] = None,
    due_to: Optional[date] = None,
    issue_from: Optional[date] = None,
    issue_to: Optional[date] = None,
    paid_from: Optional[date] = None,
    paid_to: Optional[date] = None,
    search: Optional[str] = None,
    number: Optional[str] = None,
    customer_id: Optional[int] = None,
    origin_type: Optional[str] = None,
    environment: Optional[str] = None,
):
    today = date.today()
    q = db.query(PayCharge).filter(PayCharge.company_id == company_id)
    if provider:
        q = q.filter(PayCharge.provider == provider)
    if environment:
        q = q.filter(PayCharge.environment == environment)
    if customer_id:
        q = q.filter(PayCharge.customer_id == customer_id)
    if tab == "due":        # a vencer
        q = q.filter(PayCharge.status.in_(("OPEN", "IN_PAYMENT", "PENDING")), PayCharge.due_date >= today)
    elif tab == "overdue":  # vencidos
        q = q.filter(or_(PayCharge.status == "LATE", and_(PayCharge.status == "OPEN", PayCharge.due_date < today)))
    elif tab == "paid":
        q = q.filter(PayCharge.status == "PAID")
    elif tab == "cancelled":
        q = q.filter(PayCharge.status == "CANCELLED")
    elif tab == "error":
        q = q.filter(PayCharge.status == "ERROR")
    if status:
        q = q.filter(PayCharge.status.in_(status))
    if due_from:
        q = q.filter(PayCharge.due_date >= due_from)
    if due_to:
        q = q.filter(PayCharge.due_date <= due_to)
    eff_issue = func.coalesce(PayCharge.issue_date, func.date(PayCharge.created_at))
    if issue_from:
        q = q.filter(eff_issue >= issue_from)
    if issue_to:
        q = q.filter(eff_issue <= issue_to)
    if paid_from:
        q = q.filter(PayCharge.paid_at >= datetime(paid_from.year, paid_from.month, paid_from.day, tzinfo=timezone.utc))
    if paid_to:
        nxt = paid_to + timedelta(days=1)
        q = q.filter(PayCharge.paid_at < datetime(nxt.year, nxt.month, nxt.day, tzinfo=timezone.utc))
    if origin_type:
        ot = origin_type.strip().upper()
        if ot == "HORUS":
            q = q.filter(PayCharge.origin_type.in_(("HORUS_API", "HORUS_SQL")))
        elif ot == "ORDER":
            q = q.filter(PayCharge.origin_type.in_(("B2B_ORDER", "B2C_ORDER")))
        else:
            q = q.filter(PayCharge.origin_type == ot)
    if number and number.strip():
        nterm = number.strip()
        nconds = [
            PayCharge.order_number.ilike(f"%{nterm}%"),
            PayCharge.pdv_coupon_number.ilike(f"%{nterm}%"),
            PayCharge.financial_launch_id.ilike(f"%{nterm}%"),
            PayCharge.invoice_number.ilike(f"%{nterm}%"),
            PayCharge.our_number.ilike(f"%{nterm}%"),
            PayCharge.code.ilike(f"%{nterm}%"),
            PayCharge.origin_ref.ilike(f"%{nterm}%"),
            PayCharge.provider_charge_id.ilike(f"%{nterm}%"),
        ]
        if nterm.isdigit():
            nconds.append(PayCharge.id == int(nterm))
        q = q.filter(or_(*nconds))
    if search and search.strip():
        term = search.strip()
        digits = re.sub(r"\D", "", term)
        conds = [
            PayCharge.payer_name.ilike(f"%{term}%"),
            PayCharge.description.ilike(f"%{term}%"),
            PayCharge.origin_ref.ilike(f"%{term}%"),
            PayCharge.order_number.ilike(f"%{term}%"),
            PayCharge.pdv_coupon_number.ilike(f"%{term}%"),
            PayCharge.financial_launch_id.ilike(f"%{term}%"),
            PayCharge.invoice_number.ilike(f"%{term}%"),
            PayCharge.our_number.ilike(f"%{term}%"),
            PayCharge.code.ilike(f"%{term}%"),
            PayCharge.provider_charge_id.ilike(f"%{term}%"),
        ]
        if digits:
            conds += [PayCharge.payer_document.like(f"%{digits}%"), PayCharge.digitable_line.like(f"%{digits}%")]
        if term.isdigit():
            conds.append(PayCharge.id == int(term))
        q = q.filter(or_(*conds))
    return q


def summarize_query(q) -> Dict[str, Any]:
    today = date.today()
    row = q.with_entities(
        func.count(PayCharge.id).label("total_qty"),
        func.coalesce(func.sum(PayCharge.amount), 0).label("total_amount"),
        func.count(case((and_(PayCharge.status.in_(("OPEN", "IN_PAYMENT", "PENDING")), PayCharge.due_date >= today), 1))).label("due_qty"),
        func.coalesce(func.sum(case((and_(PayCharge.status.in_(("OPEN", "IN_PAYMENT", "PENDING")), PayCharge.due_date >= today), PayCharge.amount))), 0).label("due_amount"),
        func.count(case((or_(PayCharge.status == "LATE", and_(PayCharge.status == "OPEN", PayCharge.due_date < today)), 1))).label("overdue_qty"),
        func.coalesce(func.sum(case((or_(PayCharge.status == "LATE", and_(PayCharge.status == "OPEN", PayCharge.due_date < today)), PayCharge.amount))), 0).label("overdue_amount"),
        func.count(case((PayCharge.status == "PAID", 1))).label("paid_qty"),
        func.coalesce(func.sum(case((PayCharge.status == "PAID", func.coalesce(PayCharge.total_paid, PayCharge.amount)))), 0).label("paid_amount"),
        func.count(case((PayCharge.status == "CANCELLED", 1))).label("cancelled_qty"),
    ).one()
    return {
        "total_qty": int(row.total_qty or 0),
        "total_amount": float(row.total_amount or 0),
        "due_qty": int(row.due_qty or 0),
        "due_amount": float(row.due_amount or 0),
        "overdue_qty": int(row.overdue_qty or 0),
        "overdue_amount": float(row.overdue_amount or 0),
        "paid_qty": int(row.paid_qty or 0),
        "paid_amount": float(row.paid_amount or 0),
        "cancelled_qty": int(row.cancelled_qty or 0),
    }


def dashboard(db: Session, company_id: int, provider: Optional[str] = None, months: int = 12,
              environment: Optional[str] = None) -> Dict[str, Any]:
    months = max(1, min(months, 24))
    today = date.today()
    base = db.query(PayCharge).filter(PayCharge.company_id == company_id)
    if provider:
        base = base.filter(PayCharge.provider == provider)
    if environment:
        base = base.filter(PayCharge.environment == environment)

    month_start = today.replace(day=1)
    month_start_dt = datetime(month_start.year, month_start.month, 1, tzinfo=timezone.utc)
    k = base.with_entities(
        func.count(case((and_(PayCharge.status.in_(("OPEN", "IN_PAYMENT", "PENDING")), PayCharge.due_date >= today), 1))).label("due_qty"),
        func.coalesce(func.sum(case((and_(PayCharge.status.in_(("OPEN", "IN_PAYMENT", "PENDING")), PayCharge.due_date >= today), PayCharge.amount))), 0).label("due_amount"),
        func.count(case((or_(PayCharge.status == "LATE", and_(PayCharge.status == "OPEN", PayCharge.due_date < today)), 1))).label("overdue_qty"),
        func.coalesce(func.sum(case((or_(PayCharge.status == "LATE", and_(PayCharge.status == "OPEN", PayCharge.due_date < today)), PayCharge.amount))), 0).label("overdue_amount"),
        func.count(case((and_(PayCharge.status == "PAID", PayCharge.paid_at >= month_start_dt), 1))).label("paid_month_qty"),
        func.coalesce(func.sum(case((and_(PayCharge.status == "PAID", PayCharge.paid_at >= month_start_dt), func.coalesce(PayCharge.total_paid, PayCharge.amount)))), 0).label("paid_month_amount"),
        func.count(case((PayCharge.status == "CANCELLED", 1))).label("cancelled_qty"),
        func.count(case((PayCharge.status == "ERROR", 1))).label("error_qty"),
    ).one()

    # Série mensal (gerados por mês de criação × pagos por mês de pagamento)
    total = month_start.year * 12 + (month_start.month - 1) - (months - 1)
    first = date(total // 12, total % 12 + 1, 1)
    first_dt = datetime(first.year, first.month, 1, tzinfo=timezone.utc)
    gen_rows = base.with_entities(
        func.date_trunc("month", PayCharge.created_at).label("m"), func.count(PayCharge.id), func.coalesce(func.sum(PayCharge.amount), 0),
    ).filter(PayCharge.created_at >= first_dt, PayCharge.status != "ERROR").group_by("m").all()
    paid_rows = base.with_entities(
        func.date_trunc("month", PayCharge.paid_at).label("m"), func.count(PayCharge.id),
        func.coalesce(func.sum(func.coalesce(PayCharge.total_paid, PayCharge.amount)), 0),
    ).filter(PayCharge.status == "PAID", PayCharge.paid_at >= first_dt).group_by("m").all()

    def key(dt):
        return f"{dt.year:04d}-{dt.month:02d}"

    gen = {key(m): (n, float(v)) for m, n, v in gen_rows if m}
    paid = {key(m): (n, float(v)) for m, n, v in paid_rows if m}
    series = []
    y, mth = first.year, first.month
    for _ in range(months):
        kk = f"{y:04d}-{mth:02d}"
        series.append({
            "month": kk,
            "generated_qty": gen.get(kk, (0, 0.0))[0], "generated_amount": gen.get(kk, (0, 0.0))[1],
            "paid_qty": paid.get(kk, (0, 0.0))[0], "paid_amount": paid.get(kk, (0, 0.0))[1],
        })
        mth += 1
        if mth > 12:
            y, mth = y + 1, 1

    return {
        "kpis": {
            "due": {"qty": k.due_qty, "amount": float(k.due_amount)},
            "overdue": {"qty": k.overdue_qty, "amount": float(k.overdue_amount)},
            "paid_month": {"qty": k.paid_month_qty, "amount": float(k.paid_month_amount)},
            "cancelled": {"qty": k.cancelled_qty},
            "error": {"qty": k.error_qty},
        },
        "series": series,
    }
