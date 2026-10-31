"""
payments.py
-----------
Cobranças do Hub de Pagamentos (pay_charge) — telas do seller (ex.: Financeiro Cora).

  GET  /companies/{id}/payments/dashboard                → indicadores + série mensal gerados × pagos
  GET  /companies/{id}/payments/charges                  → lista paginada com filtros
  POST /companies/{id}/payments/charges                  → emissão avulsa (origem MANUAL)
  GET  /companies/{id}/payments/charges/{charge_id}      → detalhe + histórico de eventos
  POST /companies/{id}/payments/charges/{charge_id}/sync      → revalida no provedor
  POST /companies/{id}/payments/charges/{charge_id}/cancel    → cancela
  POST /companies/{id}/payments/charges/{charge_id}/reissue   → novo vencimento (cancela + reemite)
  GET  /companies/{id}/payments/charges/{charge_id}/pdf       → URL atual do PDF (2ª via)
  POST /companies/{id}/payments/charges/{charge_id}/simulate-payment → somente Stage
  POST /payments/webhooks/cora/{company_id}/{secret}     → webhook público do Cora

Performance: paginação no PostgreSQL, índices (company_id, status, due_date) e (company_id, provider, created_at).
Rotas síncronas → FastAPI executa em threadpool (chamadas HTTP ao provedor não bloqueiam o event loop).
"""
import hmac
import logging
import re
from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.utils import assert_company_ownership
from app.db.session import get_db
from app.models.payments import PAY_PROVIDERS, PayCharge, PayChargeEvent
from app.payments import service
from app.payments.base import ChargePayer, PaymentProviderError
from app.payments.registry import get_provider, is_enabled

router = APIRouter()
logger = logging.getLogger(__name__)


def _is_master(user) -> bool:
    t = getattr(user, "type", None)
    return str(getattr(t, "value", t) or "").upper() == "MASTER"


def _access(db: Session, current_user, company_id: int, provider: str) -> str:
    assert_company_ownership(current_user, company_id)
    code = (provider or "CORA").upper()
    if code not in PAY_PROVIDERS:
        raise HTTPException(status_code=400, detail="Intermediador inválido.")
    if not _is_master(current_user) and not is_enabled(db, company_id, code):
        raise HTTPException(status_code=403, detail="Intermediador não habilitado para esta empresa.")
    return code


def _charge_or_404(db: Session, company_id: int, charge_id: int) -> PayCharge:
    c = db.query(PayCharge).filter(PayCharge.id == charge_id, PayCharge.company_id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cobrança não encontrada.")
    return c


def _http_error(e: PaymentProviderError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(e))


# ── Painel ───────────────────────────────────────────────────────────────────

@router.get("/companies/{company_id}/payments/dashboard")
def payments_dashboard(
    company_id: int,
    provider: str = "CORA",
    months: int = Query(12, ge=1, le=24),
    environment: Optional[str] = Query(None, pattern="^(STAGE|PRODUCTION)$"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    code = _access(db, current_user, company_id, provider)
    return service.dashboard(db, company_id, provider=code, months=months, environment=environment)


# ── Clientes e Lançamentos de Origem (Horus / Cronuz / Pedidos / PDV) ───────

@router.get("/companies/{company_id}/payments/customers")
def list_payment_customers(
    company_id: int,
    provider: str = "CORA",
    search: Optional[str] = Query(None, max_length=120),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _access(db, current_user, company_id, provider)
    from app.payments import origins
    return origins.search_customers(db, company_id, search=search, limit=limit)


@router.get("/companies/{company_id}/payments/customers/open-items")
def get_payment_customer_open_items(
    company_id: int,
    provider: str = "CORA",
    customer_id: Optional[int] = Query(None),
    document: Optional[str] = Query(None, max_length=30),
    id_guid: Optional[str] = Query(None, max_length=100),
    horus_cod_cli: Optional[str] = Query(None, max_length=40),
    origin_group: str = Query("ALL", pattern="^(ALL|HORUS|FINANCIAL|ORDER|PDV)$"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _access(db, current_user, company_id, provider)
    from app.payments import origins
    return origins.list_customer_open_items(
        db,
        company_id,
        customer_id=customer_id,
        document=document,
        id_guid=id_guid,
        horus_cod_cli=horus_cod_cli,
        origin_group=origin_group,
    )


# ── Lista / detalhe ──────────────────────────────────────────────────────────

@router.get("/companies/{company_id}/payments/charges")
def list_charges(
    company_id: int,
    provider: str = "CORA",
    tab: Optional[str] = Query(None, pattern="^(due|overdue|paid|cancelled|error)$"),
    status: Optional[str] = Query(None, max_length=100),
    due_from: Optional[date] = None,
    due_to: Optional[date] = None,
    issue_from: Optional[date] = None,
    issue_to: Optional[date] = None,
    paid_from: Optional[date] = None,
    paid_to: Optional[date] = None,
    search: Optional[str] = Query(None, max_length=100),
    number: Optional[str] = Query(None, max_length=80),
    customer_id: Optional[int] = Query(None),
    origin_type: Optional[str] = Query(None, max_length=30),
    environment: Optional[str] = Query(None, pattern="^(STAGE|PRODUCTION)$"),
    sort: str = Query("due_asc", pattern="^(due_asc|due_desc|created_desc|created_asc|paid_desc|amount_desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    code = _access(db, current_user, company_id, provider)
    statuses = [s.strip().upper() for s in status.split(",") if s.strip()] if status else None
    q = service.query_charges(
        db,
        company_id,
        provider=code,
        tab=tab,
        status=statuses,
        due_from=due_from,
        due_to=due_to,
        issue_from=issue_from,
        issue_to=issue_to,
        paid_from=paid_from,
        paid_to=paid_to,
        search=search,
        number=number,
        customer_id=customer_id,
        origin_type=origin_type,
        environment=environment,
    )
    summary = service.summarize_query(q)
    total = summary["total_qty"]
    order = {
        "due_asc": (PayCharge.due_date.asc(), PayCharge.id.asc()),
        "due_desc": (PayCharge.due_date.desc(), PayCharge.id.desc()),
        "created_desc": (PayCharge.created_at.desc(), PayCharge.id.desc()),
        "created_asc": (PayCharge.created_at.asc(), PayCharge.id.asc()),
        "paid_desc": (PayCharge.paid_at.desc().nullslast(), PayCharge.id.desc()),
        "amount_desc": (PayCharge.amount.desc(), PayCharge.id.desc()),
    }[sort]
    rows = q.order_by(*order).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [service.serialize_charge(c) for c in rows],
        "summary": summary,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/companies/{company_id}/payments/charges/{charge_id}")
def get_charge(company_id: int, charge_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    charge = _charge_or_404(db, company_id, charge_id)
    _access(db, current_user, company_id, charge.provider)
    events = db.query(PayChargeEvent).filter(PayChargeEvent.charge_id == charge.id).order_by(PayChargeEvent.created_at.desc()).limit(100).all()
    replaced_by = db.query(PayCharge.id).filter(PayCharge.replaces_charge_id == charge.id).first()
    return {
        "charge": service.serialize_charge(charge),
        "replaced_by_charge_id": replaced_by[0] if replaced_by else None,
        "events": [{
            "id": e.id, "source": e.source, "event_type": e.event_type, "status_before": e.status_before,
            "status_after": e.status_after, "message": e.message,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        } for e in events],
    }


# ── Emissão (avulsa ou vinculada a Horus / Pedido / PDV / Financeiro) ────────

class PayerPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    document: str = Field(..., min_length=11, max_length=20)
    email: Optional[str] = Field(None, max_length=150)
    street: str = Field(..., min_length=2, max_length=100)
    number: str = Field("S/N", max_length=20)
    district: str = Field(..., min_length=2, max_length=60)
    city: str = Field(..., min_length=2, max_length=60)
    state: str = Field(..., min_length=2, max_length=2)
    zip_code: str = Field(..., min_length=8, max_length=9)
    complement: Optional[str] = Field(None, max_length=60)


class ManualChargePayload(BaseModel):
    provider: str = "CORA"
    method: str = Field("BOLETO", pattern="^(BOLETO|PIX)$")
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    due_date: date
    issue_date: Optional[date] = None
    description: str = Field(..., min_length=2, max_length=255)
    payer: PayerPayload
    origin_type: str = Field("MANUAL", max_length=30)
    origin_ref: Optional[str] = Field(None, max_length=120)
    reference: Optional[str] = Field(None, max_length=100)   # referência livre (retrocompatibilidade)
    customer_id: Optional[int] = None
    order_number: Optional[str] = Field(None, max_length=60)
    pdv_coupon_number: Optional[str] = Field(None, max_length=60)
    financial_launch_id: Optional[str] = Field(None, max_length=60)
    installment_number: Optional[str] = Field(None, max_length=20)
    invoice_number: Optional[str] = Field(None, max_length=60)
    horus_cod_cli: Optional[str] = Field(None, max_length=40)
    horus_id_guid: Optional[str] = Field(None, max_length=100)
    origin_meta: Optional[dict] = None


@router.post("/companies/{company_id}/payments/charges")
def create_manual_charge(
    company_id: int,
    payload: ManualChargePayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    code = _access(db, current_user, company_id, payload.provider)
    payer = ChargePayer(**payload.payer.model_dump())

    origin_type = (payload.origin_type or "MANUAL").strip().upper()
    origin_ref = (payload.origin_ref or "").strip() or None
    if not origin_ref:
        if origin_type in ("HORUS_SQL", "HORUS_API") and payload.financial_launch_id:
            parc = (payload.installment_number or "1").strip()
            origin_ref = f"horus:{payload.financial_launch_id.strip()}:{parc}"
        elif origin_type in ("B2B_ORDER", "B2C_ORDER") and payload.order_number:
            parc = (payload.installment_number or "1").strip()
            origin_ref = f"order:{payload.order_number.strip()}:{parc}"
        elif origin_type == "PDV" and payload.pdv_coupon_number:
            origin_ref = f"pdv:{payload.pdv_coupon_number.strip()}"
        elif origin_type == "FINANCIAL" and payload.financial_launch_id:
            origin_ref = f"fin:{payload.financial_launch_id.strip()}"
        elif payload.reference and payload.reference.strip():
            origin_ref = f"manual:{payload.reference.strip()}"

    # Trava extra: se for lançamento Horus, impede gerar caso já exista boleto ativo para o mesmo lançamento/parcela
    if origin_type in ("HORUS_SQL", "HORUS_API") and payload.financial_launch_id:
        lancto_id = payload.financial_launch_id.strip()
        parc = (payload.installment_number or "1").strip()
        dup = db.query(PayCharge).filter(
            PayCharge.company_id == company_id,
            PayCharge.financial_launch_id == lancto_id,
            PayCharge.is_active.is_(True),
            PayCharge.status.notin_(("CANCELLED", "ERROR")),
        ).all()
        for existing in dup:
            if (existing.installment_number or "1") == parc:
                raise HTTPException(
                    status_code=400,
                    detail=f"O lançamento Horus #{lancto_id} (parcela {parc}) já possui boleto ativo (#{existing.id}).",
                )

    try:
        charge = service.create_charge(
            db,
            company_id,
            payer=payer,
            amount=payload.amount,
            due_date=payload.due_date,
            issue_date=payload.issue_date,
            description=payload.description,
            method=payload.method,
            channel="FINANCIAL",
            provider_code=code,
            origin_type=origin_type,
            origin_ref=origin_ref,
            customer_id=payload.customer_id,
            order_number=payload.order_number,
            pdv_coupon_number=payload.pdv_coupon_number,
            financial_launch_id=payload.financial_launch_id,
            installment_number=payload.installment_number,
            invoice_number=payload.invoice_number,
            horus_cod_cli=payload.horus_cod_cli,
            horus_id_guid=payload.horus_id_guid,
            origin_meta=payload.origin_meta,
            user_id=getattr(current_user, "id", None),
        )
    except PaymentProviderError as e:
        raise _http_error(e)
    return {"charge": service.serialize_charge(charge)}


# ── Ações ────────────────────────────────────────────────────────────────────

@router.post("/companies/{company_id}/payments/charges/{charge_id}/sync")
def sync_charge(company_id: int, charge_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    charge = _charge_or_404(db, company_id, charge_id)
    _access(db, current_user, company_id, charge.provider)
    try:
        changed = service.sync_charge(db, charge, source="USER")
    except PaymentProviderError as e:
        raise _http_error(e)
    return {"changed": changed, "charge": service.serialize_charge(charge)}


@router.post("/companies/{company_id}/payments/charges/{charge_id}/cancel")
def cancel_charge(company_id: int, charge_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    charge = _charge_or_404(db, company_id, charge_id)
    _access(db, current_user, company_id, charge.provider)
    try:
        service.cancel_charge(db, charge, user_id=getattr(current_user, "id", None))
    except PaymentProviderError as e:
        raise _http_error(e)
    return {"charge": service.serialize_charge(charge)}


class ReissuePayload(BaseModel):
    due_date: date
    amount: Optional[Decimal] = Field(None, gt=0, max_digits=12, decimal_places=2)


@router.post("/companies/{company_id}/payments/charges/{charge_id}/reissue")
def reissue_charge(
    company_id: int, charge_id: int, payload: ReissuePayload,
    db: Session = Depends(get_db), current_user=Depends(get_current_user),
):
    charge = _charge_or_404(db, company_id, charge_id)
    _access(db, current_user, company_id, charge.provider)
    try:
        new_charge = service.reissue_charge(db, charge, payload.due_date, user_id=getattr(current_user, "id", None),
                                            new_amount=payload.amount)
    except PaymentProviderError as e:
        raise _http_error(e)
    return {"charge": service.serialize_charge(new_charge), "replaced_charge_id": charge.id}


@router.get("/companies/{company_id}/payments/charges/{charge_id}/pdf")
def charge_pdf(company_id: int, charge_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """2ª via: a URL do provedor é assinada e pode expirar — revalida antes de devolver."""
    charge = _charge_or_404(db, company_id, charge_id)
    _access(db, current_user, company_id, charge.provider)
    if charge.provider_charge_id:
        try:
            service.sync_charge(db, charge, source="USER")
        except PaymentProviderError:
            pass
    if not charge.pdf_url:
        raise HTTPException(status_code=404, detail="PDF da cobrança não disponível.")
    return {"url": charge.pdf_url}


@router.post("/companies/{company_id}/payments/charges/{charge_id}/simulate-payment")
def simulate_payment(company_id: int, charge_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    charge = _charge_or_404(db, company_id, charge_id)
    _access(db, current_user, company_id, charge.provider)
    if charge.environment != "STAGE":
        raise HTTPException(status_code=400, detail="Pagamento simulado só é permitido em cobranças do ambiente Stage.")
    try:
        with get_provider(db, company_id, charge.provider, environment="STAGE") as provider:
            provider.simulate_payment(charge.provider_charge_id)
            service.sync_charge(db, charge, provider=provider, source="USER")
    except PaymentProviderError as e:
        raise _http_error(e)
    return {"charge": service.serialize_charge(charge)}


# ── Webhook público (Cora) ───────────────────────────────────────────────────

def _process_cora_webhook(company_id: int, invoice_id: str, event_id: Optional[str]) -> None:
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        service.handle_webhook(db, company_id, "CORA", invoice_id, external_event_id=event_id)
    except Exception as e:
        logger.error("[Payments][Webhook Cora] company=%s invoice=%s: %s", company_id, invoice_id, e)
    finally:
        db.close()


@router.post("/payments/webhooks/cora/{company_id}/{secret}")
async def cora_webhook(company_id: int, secret: str, request: Request, background_tasks: BackgroundTasks,
                       db: Session = Depends(get_db)):
    """Responde 200 imediatamente; o status é sempre revalidado na API do Cora (payload não é fonte da verdade)."""
    from app.models.cora import CoraConfig

    cfg = db.query(CoraConfig).filter(CoraConfig.company_id == company_id).first()
    if not cfg or not cfg.webhook_secret or not hmac.compare_digest(secret, cfg.webhook_secret):
        return {"status": "ignored"}

    invoice_id = request.headers.get("webhook-resource-id")
    event_id = request.headers.get("webhook-event-id")
    if not invoice_id:
        try:
            body = await request.json()
        except Exception:
            body = None
        if isinstance(body, dict):
            nested = [body.get("resource"), body.get("invoice"), body.get("data")]
            invoice_id = body.get("id") or next((n.get("id") for n in nested if isinstance(n, dict) and n.get("id")), None)
    if invoice_id and re.match(r"^[A-Za-z0-9_\-]{4,80}$", str(invoice_id)):
        background_tasks.add_task(_process_cora_webhook, company_id, str(invoice_id),
                                  event_id[:120] if event_id else None)
    return {"status": "received"}
