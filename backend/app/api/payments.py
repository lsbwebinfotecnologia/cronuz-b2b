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
from fastapi.responses import Response
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


# ── Notas Fiscais Emitidas no Horus ERP (100% via API) ───────────────────────

@router.get("/companies/{company_id}/payments/horus-invoices")
def list_horus_invoices_for_boletos_endpoint(
    company_id: int,
    provider: str = "CORA",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    cod_ped_venda: Optional[str] = Query(None, max_length=60),
    nro_nota_fiscal: Optional[str] = Query(None, max_length=60),
    search: Optional[str] = Query(None, max_length=120),
    status_filter: str = Query("ALL", pattern="^(ALL|PENDING|EMITTED)$"),
    force_refresh: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _access(db, current_user, company_id, provider)
    from app.payments import horus_invoices
    try:
        return horus_invoices.list_horus_invoices_for_boletos(
            db,
            company_id,
            date_from=date_from,
            date_to=date_to,
            cod_ped_venda=cod_ped_venda,
            nro_nota_fiscal=nro_nota_fiscal,
            search=search,
            status_filter=status_filter,
            force_refresh=force_refresh,
        )
    except PaymentProviderError as e:
        raise _http_error(e)


class HorusInvoiceInstallmentItemPayload(BaseModel):
    installment_number: str = Field("1", max_length=20)
    due_date: date
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    financial_launch_id: Optional[str] = Field(None, max_length=60)
    origin_ref: Optional[str] = Field(None, max_length=120)
    description: Optional[str] = Field(None, max_length=255)


class EmitHorusInvoiceBoletosPayload(BaseModel):
    provider: str = "CORA"
    method: str = Field("BOLETO", pattern="^(BOLETO|PIX)$")
    nro_nota_fiscal: str = Field(..., min_length=1, max_length=60)
    serie_fiscal: Optional[str] = Field(None, max_length=20)
    cod_nf: Optional[str] = Field(None, max_length=40)
    cod_ped_venda: Optional[str] = Field(None, max_length=60)
    cod_pedido_origem: Optional[str] = Field(None, max_length=60)
    horus_cod_cli: Optional[str] = Field(None, max_length=40)
    horus_id_guid: Optional[str] = Field(None, max_length=100)
    customer_id: Optional[int] = None
    issue_date: Optional[date] = None
    chave_acesso_nfe: Optional[str] = Field(None, max_length=60)
    payer: "PayerPayload"
    installments: List[HorusInvoiceInstallmentItemPayload] = Field(..., min_length=1, max_length=36)


@router.post("/companies/{company_id}/payments/horus-invoices/emit")
def emit_horus_invoice_boletos_endpoint(
    company_id: int,
    payload: EmitHorusInvoiceBoletosPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    code = _access(db, current_user, company_id, payload.provider)
    payer = ChargePayer(**payload.payer.model_dump())
    from app.payments import horus_invoices
    try:
        return horus_invoices.emit_boletos_for_horus_invoice(
            db,
            company_id,
            provider_code=code,
            method=payload.method,
            nro_nota_fiscal=payload.nro_nota_fiscal,
            serie_fiscal=payload.serie_fiscal,
            cod_nf=payload.cod_nf,
            cod_ped_venda=payload.cod_ped_venda,
            cod_pedido_origem=payload.cod_pedido_origem,
            horus_cod_cli=payload.horus_cod_cli,
            horus_id_guid=payload.horus_id_guid,
            customer_id=payload.customer_id,
            issue_date=payload.issue_date,
            chave_acesso_nfe=payload.chave_acesso_nfe,
            payer=payer,
            installments=[i.model_dump() for i in payload.installments],
            user_id=getattr(current_user, "id", None),
        )
    except PaymentProviderError as e:
        raise _http_error(e)


class HorusInvoicePaymentFormsFilterPayload(BaseModel):
    provider: str = Field("CORA", max_length=30)
    allowed_payment_forms: List[str] = Field(default_factory=list)


@router.put("/companies/{company_id}/payments/horus-invoices/payment-forms-filter")
def update_horus_invoice_payment_forms_filter_endpoint(
    company_id: int,
    payload: HorusInvoicePaymentFormsFilterPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _access(db, current_user, company_id, payload.provider)
    from app.payments import horus_invoices
    saved = horus_invoices.update_invoice_allowed_payment_forms(
        db,
        company_id,
        payload.allowed_payment_forms,
        user_id=getattr(current_user, "id", None),
    )
    return {"allowed_payment_forms": saved}


class HorusInvoiceAutoEmitPayload(BaseModel):
    provider: str = Field("CORA", max_length=30)
    enabled: bool = Field(False)


@router.put("/companies/{company_id}/payments/horus-invoices/auto-emit")
def update_horus_invoice_auto_emit_endpoint(
    company_id: int,
    payload: HorusInvoiceAutoEmitPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _access(db, current_user, company_id, payload.provider)
    from app.payments import horus_invoices
    try:
        return horus_invoices.update_invoice_auto_emit(
            db,
            company_id,
            payload.enabled,
            user_id=getattr(current_user, "id", None),
        )
    except PaymentProviderError as e:
        raise _http_error(e)


class BatchHorusInvoiceItemPayload(BaseModel):
    nro_nota_fiscal: str = Field(..., min_length=1, max_length=60)
    serie_fiscal: Optional[str] = Field(None, max_length=20)
    cod_nf: Optional[str] = Field(None, max_length=40)
    cod_ped_venda: Optional[str] = Field(None, max_length=60)
    cod_pedido_origem: Optional[str] = Field(None, max_length=60)
    horus_cod_cli: Optional[str] = Field(None, max_length=40)
    horus_id_guid: Optional[str] = Field(None, max_length=100)
    customer_id: Optional[int] = None
    issue_date: Optional[date] = None
    chave_acesso_nfe: Optional[str] = Field(None, max_length=60)
    payer: "PayerPayload"
    installments: List[HorusInvoiceInstallmentItemPayload] = Field(..., min_length=1, max_length=36)


class EmitBatchHorusInvoicesPayload(BaseModel):
    provider: str = "CORA"
    method: str = Field("BOLETO", pattern="^(BOLETO|PIX)$")
    invoices: List[BatchHorusInvoiceItemPayload] = Field(..., min_length=1, max_length=100)


@router.post("/companies/{company_id}/payments/horus-invoices/emit-batch")
def emit_batch_horus_invoices_endpoint(
    company_id: int,
    payload: EmitBatchHorusInvoicesPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    code = _access(db, current_user, company_id, payload.provider)
    from app.payments import horus_invoices
    try:
        return horus_invoices.emit_batch_boletos_for_horus_invoices(
            db,
            company_id,
            provider_code=code,
            method=payload.method,
            invoices=[inv.model_dump() for inv in payload.invoices],
            user_id=getattr(current_user, "id", None),
        )
    except PaymentProviderError as e:
        raise _http_error(e)


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


EmitHorusInvoiceBoletosPayload.model_rebuild()
BatchHorusInvoiceItemPayload.model_rebuild()
EmitBatchHorusInvoicesPayload.model_rebuild()


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


class BatchPdfPayload(BaseModel):
    provider: str = Field("CORA", max_length=30)
    charge_ids: List[int] = Field(..., min_length=1, max_length=150)


@router.post("/companies/{company_id}/payments/charges/batch-pdf")
def charges_batch_pdf(
    company_id: int,
    payload: BatchPdfPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Baixa e unifica todas as páginas dos PDFs dos boletos informados em um único documento PDF
    pronto para impressão de uma só vez (ex.: 10 parcelas de uma NF ou fila de impressão do lote).
    """
    code = _access(db, current_user, company_id, payload.provider)
    from app.payments import horus_invoices
    try:
        pdf_bytes = horus_invoices.build_merged_pdf_for_charges(
            db,
            company_id,
            payload.charge_ids,
            provider_code=code,
        )
    except PaymentProviderError as e:
        raise _http_error(e)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'inline; filename="boletos-cora-unificados.pdf"',
            "Cache-Control": "no-store",
        },
    )


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


# ── Monitor de Retorno, Conciliação Automática e Baixas (Horus / Cronuz) ─────

@router.get("/companies/{company_id}/payments/monitor")
def get_payments_monitor(
    company_id: int,
    provider: str = "CORA",
    limit: int = Query(100, ge=10, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from sqlalchemy import func
    from app.models.company_settings import CompanySettings
    from app.models.cora import CoraConfig

    code = _access(db, current_user, company_id, provider)
    cora_cfg = db.query(CoraConfig).filter(CoraConfig.company_id == company_id).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()

    open_monitored_qty = db.query(func.count(PayCharge.id)).filter(
        PayCharge.company_id == company_id,
        PayCharge.provider == code,
        PayCharge.is_active.is_(True),
        PayCharge.status.in_(service.OPEN_STATUSES),
    ).scalar() or 0

    last_sync_at = db.query(func.max(PayCharge.last_synced_at)).filter(
        PayCharge.company_id == company_id,
        PayCharge.provider == code,
    ).scalar()

    paid_rows = (
        db.query(PayCharge)
        .filter(PayCharge.company_id == company_id, PayCharge.provider == code, PayCharge.status == "PAID")
        .order_by(PayCharge.paid_at.desc().nullslast(), PayCharge.id.desc())
        .limit(limit)
        .all()
    )
    paid_ids = [c.id for c in paid_rows]

    events_by_charge = {}
    if paid_ids:
        ev_rows = (
            db.query(PayChargeEvent)
            .filter(PayChargeEvent.company_id == company_id, PayChargeEvent.charge_id.in_(paid_ids))
            .order_by(PayChargeEvent.created_at.desc(), PayChargeEvent.id.desc())
            .all()
        )
        for ev in ev_rows:
            events_by_charge.setdefault(ev.charge_id, []).append(ev)

    settled_qty = 0
    pending_settlement_qty = 0
    error_settlement_qty = 0
    paid_charges_out = []

    for c in paid_rows:
        c_evs = events_by_charge.get(c.id, [])
        settle_ev = next(
            (e for e in c_evs if e.event_type in ("horus_settled", "cronuz_settled", "horus_settle_error", "horus_settle_skipped")),
            None,
        )
        paid_ev = next((e for e in c_evs if e.event_type == "paid" or e.status_after == "PAID"), None)

        if settle_ev and settle_ev.event_type == "horus_settled":
            settle_status = "SETTLED_HORUS"
            settled_qty += 1
        elif settle_ev and settle_ev.event_type == "cronuz_settled":
            settle_status = "SETTLED_CRONUZ"
            settled_qty += 1
        elif settle_ev and settle_ev.event_type in ("horus_settle_error", "horus_settle_skipped"):
            settle_status = "ERROR"
            error_settlement_qty += 1
        else:
            settle_status = "PENDING"
            pending_settlement_qty += 1

        item = service.serialize_charge(c)
        item["settlement"] = {
            "status": settle_status,
            "event_type": settle_ev.event_type if settle_ev else None,
            "message": settle_ev.message if settle_ev else None,
            "settled_at": settle_ev.created_at.isoformat() if (settle_ev and settle_ev.created_at) else None,
            "paid_detected_by": paid_ev.source if paid_ev else "SYNC",
        }
        paid_charges_out.append(item)

    recent_events_rows = (
        db.query(PayChargeEvent, PayCharge)
        .join(PayCharge, PayCharge.id == PayChargeEvent.charge_id)
        .filter(PayChargeEvent.company_id == company_id, PayChargeEvent.provider == code)
        .order_by(PayChargeEvent.created_at.desc(), PayChargeEvent.id.desc())
        .limit(limit)
        .all()
    )
    events_out = [
        {
            "id": ev.id,
            "charge_id": ev.charge_id,
            "source": ev.source,
            "event_type": ev.event_type,
            "status_before": ev.status_before,
            "status_after": ev.status_after,
            "message": ev.message,
            "created_at": ev.created_at.isoformat() if ev.created_at else None,
            "payer_name": ch.payer_name,
            "amount": float(ch.amount or 0),
            "invoice_number": ch.invoice_number,
            "financial_launch_id": ch.financial_launch_id,
            "installment_number": ch.installment_number,
            "order_number": ch.order_number,
            "origin_type": ch.origin_type,
        }
        for ev, ch in recent_events_rows
    ]

    horus_enabled = bool(settings and (settings.horus_enabled or settings.horus_sql_enabled))
    horus_sql_enabled = bool(settings and settings.horus_sql_enabled)
    horus_baixa_enabled = bool(cora_cfg and getattr(cora_cfg, "horus_baixa_enabled", False))
    horus_bank_summary = None
    if cora_cfg and getattr(cora_cfg, "horus_cod_banco", None):
        horus_bank_summary = (
            f"Banco {cora_cfg.horus_cod_banco} · Ag. {cora_cfg.horus_cod_agencia or '-'} · C/C {cora_cfg.horus_cod_contac or '-'}"
            + (f" · Forma #{cora_cfg.horus_cod_forma}" if getattr(cora_cfg, "horus_cod_forma", None) else "")
        )

    return {
        "status": {
            "job_interval_minutes": 30,
            "active_environment": cora_cfg.active_environment if cora_cfg else "STAGE",
            "webhook_registered": bool(cora_cfg and cora_cfg.webhook_endpoint_ids),
            "webhook_environment": cora_cfg.webhook_environment if cora_cfg else None,
            "horus_enabled": horus_enabled,
            "horus_sql_enabled": horus_sql_enabled,
            "horus_baixa_enabled": horus_baixa_enabled,
            "horus_bank_summary": horus_bank_summary,
            "cronuz_baixa_enabled": bool(getattr(cora_cfg, "cronuz_baixa_enabled", True)) if cora_cfg else True,
            "open_monitored_qty": int(open_monitored_qty),
            "last_sync_at": last_sync_at.isoformat() if last_sync_at else None,
            "paid_total_qty": len(paid_charges_out),
            "settled_qty": settled_qty,
            "pending_settlement_qty": pending_settlement_qty,
            "error_settlement_qty": error_settlement_qty,
        },
        "paid_charges": paid_charges_out,
        "events": events_out,
    }


@router.post("/companies/{company_id}/payments/monitor/run-sync")
def run_payments_monitor_sync(
    company_id: int,
    provider: str = "CORA",
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Executa sob demanda a varredura de conciliação da empresa:
    1) Sincroniza no Cora os boletos em aberto;
    2) Processa a baixa no Horus ERP / Cronuz para qualquer boleto PAID pendente de baixa.
    """
    from collections import defaultdict
    from app.payments.settlement import handle_charge_status_change

    code = _access(db, current_user, company_id, provider)
    open_charges = (
        db.query(PayCharge)
        .filter(
            PayCharge.company_id == company_id,
            PayCharge.provider == code,
            PayCharge.is_active.is_(True),
            PayCharge.provider_charge_id.isnot(None),
            PayCharge.status.in_(service.OPEN_STATUSES),
        )
        .order_by(PayCharge.due_date.asc().nullslast())
        .limit(100)
        .all()
    )

    by_env = defaultdict(list)
    for c in open_charges:
        by_env[c.environment].append(c)

    checked = 0
    changed = 0
    for env, items in by_env.items():
        try:
            with get_provider(db, company_id, code, environment=env) as prov:
                for c in items:
                    checked += 1
                    if service.sync_charge(db, c, provider=prov, source="USER"):
                        changed += 1
        except PaymentProviderError as e:
            logger.warning("[Monitor Sync] company=%s %s/%s: %s", company_id, code, env, e)

    # Reprocessa baixas pendentes em boletos já pagos
    settled_subq = db.query(PayChargeEvent.charge_id).filter(
        PayChargeEvent.company_id == company_id,
        PayChargeEvent.event_type.in_(("horus_settled", "cronuz_settled")),
    )
    pending_paid = (
        db.query(PayCharge)
        .filter(
            PayCharge.company_id == company_id,
            PayCharge.provider == code,
            PayCharge.status == "PAID",
            ~PayCharge.id.in_(settled_subq),
        )
        .order_by(PayCharge.paid_at.desc().nullslast())
        .limit(50)
        .all()
    )
    reprocessed = 0
    for pc in pending_paid:
        handle_charge_status_change(db, pc, "OPEN", "PAID")
        reprocessed += 1

    return {
        "checked_open": checked,
        "status_changed": changed,
        "settlement_triggered": reprocessed,
        "message": f"Varredura concluída: {checked} boleto(s) aberto(s) verificado(s), {changed} atualizado(s) e {reprocessed} baixa(s) processada(s).",
    }


@router.post("/companies/{company_id}/payments/charges/{charge_id}/settle")
def settle_single_paid_charge(
    company_id: int,
    charge_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Dispara manualmente a baixa (Horus ERP ou Cronuz Nativo) para um boleto já pago (PAID)."""
    from app.payments.settlement import handle_charge_status_change

    charge = _charge_or_404(db, company_id, charge_id)
    _access(db, current_user, company_id, charge.provider)
    if charge.status != "PAID":
        raise HTTPException(status_code=400, detail="Apenas cobranças com status Pago (PAID) podem ser baixadas.")

    handle_charge_status_change(db, charge, "OPEN", "PAID")
    last_ev = (
        db.query(PayChargeEvent)
        .filter(
            PayChargeEvent.company_id == company_id,
            PayChargeEvent.charge_id == charge.id,
            PayChargeEvent.source == "SETTLEMENT",
        )
        .order_by(PayChargeEvent.id.desc())
        .first()
    )
    return {
        "charge_id": charge.id,
        "event_type": last_ev.event_type if last_ev else None,
        "message": (last_ev.message if last_ev else "Rotina de baixa executada. Verifique se a baixa automática está ativa nas configurações do Cora."),
    }

