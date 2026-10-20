"""
horus_cora.py
-------------
Endpoints do Boleto Banco Cora integrado ao Horus ERP (sub-funcionalidade do Horus Direct).

Habilitação: Master ativa `horus_sql_feature_cora_boleto` no seller (requer Horus SQL Direct ativo).

Rotas (todas protegidas por ownership, exceto o webhook público):
  GET/PUT  /companies/{id}/horus-cora/settings
  POST     /companies/{id}/horus-cora/test-connection
  POST     /companies/{id}/horus-cora/webhook/register
  GET      /companies/{id}/horus-cora/titles
  POST     /companies/{id}/horus-cora/invoices                 (emissão em lote)
  GET      /companies/{id}/horus-cora/invoices
  POST     /companies/{id}/horus-cora/invoices/sync-pending
  POST     /companies/{id}/horus-cora/invoices/{inv_id}/sync
  POST     /companies/{id}/horus-cora/invoices/{inv_id}/cancel
  GET      /companies/{id}/horus-cora/invoices/{inv_id}/pdf
  POST     /companies/{id}/horus-cora/baixa
  POST     /financial/webhooks/cora/{company_id}/{secret}       (público — revalida na API do Cora)

PERFORMANCE: endpoints síncronos (FastAPI executa em threadpool) — chamadas pytds/requests não
bloqueiam o event loop. Listagens paginadas no SQL Server / PostgreSQL.
"""
import hmac
import logging
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.utils import assert_company_ownership
from app.db.session import get_db
from app.integrators.cora_client import CoraAPIError, CoraClient, CoraConfigError
from app.integrators.horus_sql_client import HorusSQLClient, HorusSQLConfigError
from app.models.cora_invoice import CoraInvoice
from app.services import cora_horus

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_PEM_BYTES = 20 * 1024        # certificado/chave PEM nunca passam de alguns KB
MAX_EMIT_PER_REQUEST = 100


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_settings(db: Session, company_id: int):
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Configurações da empresa não encontradas.")
    return settings


def _require_feature(settings) -> None:
    if not settings.horus_sql_enabled:
        raise HTTPException(status_code=400, detail="O módulo Horus SQL Direct não está ativo para esta empresa.")
    if not getattr(settings, "horus_sql_feature_cora_boleto", False):
        raise HTTPException(status_code=403, detail="Boleto Cora não está habilitado para esta empresa. Solicite ao Master.")


def _require_cora(settings) -> None:
    _require_feature(settings)
    if not settings.cora_enabled:
        raise HTTPException(status_code=400, detail="Integração com o Banco Cora está desativada nas configurações.")


def _sql_client(db: Session, company_id: int) -> HorusSQLClient:
    try:
        return HorusSQLClient(db, company_id)
    except HorusSQLConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _user_id(current_user) -> Optional[int]:
    return getattr(current_user, "id", None) if not isinstance(current_user, dict) else current_user.get("id")


def _invoice_or_404(db: Session, company_id: int, inv_id: int) -> CoraInvoice:
    inv = db.query(CoraInvoice).filter(CoraInvoice.id == inv_id, CoraInvoice.company_id == company_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Boleto Cora não encontrado.")
    return inv


def _serialize_invoice(inv: CoraInvoice) -> dict:
    return {
        "id": inv.id,
        "cora_invoice_id": inv.cora_invoice_id,
        "status": inv.status,
        "is_active": inv.is_active,
        "cod_filial": inv.cod_filial,
        "nro_lancamento": inv.nro_lancto_creceber,
        "cod_parcela": inv.cod_parcela,
        "cod_ped_venda": inv.cod_ped_venda,
        "cliente_nome": inv.customer_name,
        "documento": inv.customer_document,
        "valor": float(inv.amount or 0),
        "valor_pago": float(inv.total_paid) if inv.total_paid is not None else None,
        "vencimento": inv.due_date.isoformat() if inv.due_date else None,
        "pago_em": inv.paid_at.isoformat() if inv.paid_at else None,
        "nosso_numero": inv.our_number,
        "linha_digitavel": inv.digitable_line,
        "pix_copia_cola": inv.pix_emv,
        "horus_gravado": inv.horus_written_back,
        "bordero_baixa": inv.cod_bordero_baixa,
        "baixa_em": inv.baixa_at.isoformat() if inv.baixa_at else None,
        "erro": inv.last_error,
        "criado_em": inv.created_at.isoformat() if inv.created_at else None,
        "sincronizado_em": inv.last_synced_at.isoformat() if inv.last_synced_at else None,
    }


def _validate_pem(content: str, kind: str) -> str:
    content = (content or "").strip()
    if len(content.encode("utf-8")) > MAX_PEM_BYTES:
        raise HTTPException(status_code=413, detail=f"O {kind} excede o limite máximo permitido de 20 KB.")
    if "-----BEGIN" not in content or "-----END" not in content:
        raise HTTPException(status_code=400, detail=f"O {kind} enviado não está no formato PEM.")
    return content


# ── Configurações ────────────────────────────────────────────────────────────

class CoraSettingsPayload(BaseModel):
    cora_enabled: Optional[bool] = None
    cora_sandbox: Optional[bool] = None
    cora_client_id: Optional[str] = Field(None, max_length=255)
    cora_cert_content: Optional[str] = None   # envio opcional (só quando trocar)
    cora_key_content: Optional[str] = None    # envio opcional (só quando trocar)
    cora_fine_rate: Optional[float] = Field(None, ge=0, le=100)
    cora_interest_rate: Optional[float] = Field(None, ge=0, le=100)
    cora_notify_email: Optional[bool] = None
    cora_horus_cod_formas: Optional[str] = Field(None, max_length=100)
    cora_horus_write_back: Optional[bool] = None
    cora_horus_auto_baixa: Optional[bool] = None
    cora_horus_banco_forma_pagto: Optional[str] = Field(None, max_length=50)
    cora_horus_banco_codigo: Optional[str] = Field(None, max_length=20)
    cora_horus_banco_agencia: Optional[str] = Field(None, max_length=20)
    cora_horus_banco_conta: Optional[str] = Field(None, max_length=30)
    cora_horus_banco_carteira: Optional[str] = Field(None, max_length=20)


def _settings_response(settings) -> dict:
    return {
        "feature_enabled": bool(getattr(settings, "horus_sql_feature_cora_boleto", False)),
        "horus_sql_enabled": bool(settings.horus_sql_enabled),
        "cora_enabled": bool(settings.cora_enabled),
        "cora_sandbox": bool(settings.cora_sandbox),
        "cora_client_id": settings.cora_client_id or "",
        "has_certificate": bool(settings.cora_cert_content),
        "has_private_key": bool(settings.cora_key_content),
        "cora_fine_rate": float(settings.cora_fine_rate) if settings.cora_fine_rate is not None else None,
        "cora_interest_rate": float(settings.cora_interest_rate) if settings.cora_interest_rate is not None else None,
        "cora_notify_email": bool(settings.cora_notify_email),
        "cora_horus_cod_formas": settings.cora_horus_cod_formas or "",
        "cora_horus_write_back": bool(settings.cora_horus_write_back),
        "cora_horus_auto_baixa": bool(settings.cora_horus_auto_baixa),
        "cora_horus_banco_forma_pagto": settings.cora_horus_banco_forma_pagto or "",
        "cora_horus_banco_codigo": settings.cora_horus_banco_codigo or "",
        "cora_horus_banco_agencia": settings.cora_horus_banco_agencia or "",
        "cora_horus_banco_conta": settings.cora_horus_banco_conta or "",
        "cora_horus_banco_carteira": settings.cora_horus_banco_carteira or "",
        "webhook_registered": bool(settings.cora_webhook_endpoint_ids),
    }


@router.get("/companies/{company_id}/horus-cora/settings")
def get_cora_settings(company_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    assert_company_ownership(current_user, company_id)
    settings = _get_settings(db, company_id)
    _require_feature(settings)
    return _settings_response(settings)


@router.put("/companies/{company_id}/horus-cora/settings")
def update_cora_settings(
    company_id: int,
    payload: CoraSettingsPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.core.horus_sql_crypto import encrypt_sql_credential

    assert_company_ownership(current_user, company_id)
    settings = _get_settings(db, company_id)
    _require_feature(settings)

    data = payload.model_dump(exclude_unset=True)
    cert = data.pop("cora_cert_content", None)
    key = data.pop("cora_key_content", None)
    if cert:
        settings.cora_cert_content = _validate_pem(cert, "certificado")
    if key:
        settings.cora_key_content = encrypt_sql_credential(_validate_pem(key, "chave privada"))
    if "cora_horus_cod_formas" in data:
        data["cora_horus_cod_formas"] = ",".join(str(x) for x in cora_horus.parse_cod_formas(data["cora_horus_cod_formas"]))

    credentials_changed = bool(cert or key) or (
        "cora_client_id" in data and (data["cora_client_id"] or "").strip() != (settings.cora_client_id or "")
    ) or ("cora_sandbox" in data and bool(data["cora_sandbox"]) != bool(settings.cora_sandbox))

    for field, value in data.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(settings, field, value)

    if settings.cora_enabled and not (settings.cora_client_id and settings.cora_cert_content and settings.cora_key_content):
        raise HTTPException(status_code=400, detail="Para ativar o Cora informe Client ID, certificado e chave privada.")
    if not settings.cora_webhook_secret:
        settings.cora_webhook_secret = secrets.token_urlsafe(32)[:48]
    if credentials_changed:
        # Trocou credencial/ambiente: endpoints de webhook antigos deixam de valer
        settings.cora_webhook_endpoint_ids = None

    db.commit()
    db.refresh(settings)
    return {"success": True, "settings": _settings_response(settings)}


@router.post("/companies/{company_id}/horus-cora/test-connection")
def test_cora_connection(company_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    assert_company_ownership(current_user, company_id)
    settings = _get_settings(db, company_id)
    _require_cora(settings)
    try:
        with CoraClient.from_settings(settings) as cora:
            return cora.test_connection()
    except (CoraConfigError, CoraAPIError) as e:
        raise HTTPException(status_code=400, detail=str(e))


class RegisterWebhookPayload(BaseModel):
    public_base_url: str = Field(..., max_length=255)


@router.post("/companies/{company_id}/horus-cora/webhook/register")
def register_cora_webhook(
    company_id: int,
    payload: RegisterWebhookPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_company_ownership(current_user, company_id)
    settings = _get_settings(db, company_id)
    _require_cora(settings)

    base = payload.public_base_url.strip().rstrip("/")
    if not re.match(r"^https://[^\s/]+", base):
        raise HTTPException(status_code=400, detail="Informe a URL pública HTTPS da API (ex: https://api.seudominio.com.br).")
    if not settings.cora_webhook_secret:
        settings.cora_webhook_secret = secrets.token_urlsafe(32)[:48]
    url = f"{base}/financial/webhooks/cora/{company_id}/{settings.cora_webhook_secret}"

    created = []
    try:
        with CoraClient.from_settings(settings) as cora:
            # Remove endpoints antigos criados pelo Cronuz para evitar notificações duplicadas
            for old_id in [x for x in (settings.cora_webhook_endpoint_ids or "").split(",") if x]:
                try:
                    cora.delete_endpoint(old_id)
                except CoraAPIError:
                    pass
            for trigger in ("paid", "canceled", "overdue"):
                res = cora.create_endpoint(url=url, resource="invoice", trigger=trigger)
                if res.get("id"):
                    created.append(res["id"])
    except (CoraConfigError, CoraAPIError) as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Falha ao registrar webhook no Cora: {e}")

    settings.cora_webhook_endpoint_ids = ",".join(created)[:500] or None
    db.commit()
    return {"success": True, "endpoints": created, "message": "Webhook do Cora registrado (pago, cancelado e vencido)."}


# ── Títulos do Horus ─────────────────────────────────────────────────────────

@router.get("/companies/{company_id}/horus-cora/titles")
def list_horus_titles(
    company_id: int,
    due_from: Optional[date] = None,
    due_to: Optional[date] = None,
    search: Optional[str] = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_company_ownership(current_user, company_id)
    settings = _get_settings(db, company_id)
    _require_feature(settings)
    sql_client = _sql_client(db, company_id)

    try:
        data = cora_horus.list_open_titles(
            sql_client, settings, due_from=due_from, due_to=due_to, search=search, page=page, page_size=page_size,
        )
    except Exception as e:
        logger.error("[HorusCora] Erro ao listar títulos company=%s: %s", company_id, e)
        raise HTTPException(status_code=500, detail=f"Erro ao consultar títulos no Horus: {e}")

    # Enriquecimento com o status local do boleto (1 query para a página inteira)
    nros = [it["nro_lancamento"] for it in data["items"]]
    local = {}
    if nros:
        for inv in db.query(CoraInvoice).filter(
            CoraInvoice.company_id == company_id,
            CoraInvoice.cod_filial == sql_client.cod_filial,
            CoraInvoice.is_active.is_(True),
            CoraInvoice.nro_lancto_creceber.in_(nros),
        ).all():
            local[(inv.nro_lancto_creceber, inv.cod_parcela)] = inv
    today = date.today().isoformat()
    for it in data["items"]:
        inv = local.get((it["nro_lancamento"], it["cod_parcela"]))
        it["boleto"] = {"id": inv.id, "status": inv.status, "erro": inv.last_error} if inv else None
        it["vencido"] = bool(it["vencimento"] and it["vencimento"] < today)
    data["cod_filial"] = sql_client.cod_filial
    return data


# ── Emissão ──────────────────────────────────────────────────────────────────

class EmitItem(BaseModel):
    nro_lancamento: int
    cod_parcela: int = 1


class EmitPayload(BaseModel):
    items: List[EmitItem]
    overdue_due_date: Optional[date] = None  # novo vencimento para títulos já vencidos


@router.post("/companies/{company_id}/horus-cora/invoices")
def emit_cora_invoices(
    company_id: int,
    payload: EmitPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_company_ownership(current_user, company_id)
    settings = _get_settings(db, company_id)
    _require_cora(settings)
    if not payload.items:
        raise HTTPException(status_code=400, detail="Selecione ao menos um título.")
    if len(payload.items) > MAX_EMIT_PER_REQUEST:
        raise HTTPException(status_code=400, detail=f"Emita no máximo {MAX_EMIT_PER_REQUEST} boletos por vez.")
    if payload.overdue_due_date and payload.overdue_due_date < date.today():
        raise HTTPException(status_code=400, detail="O novo vencimento não pode ser anterior a hoje.")

    sql_client = _sql_client(db, company_id)
    try:
        return cora_horus.emit_invoices(
            db, settings, sql_client, company_id,
            [(i.nro_lancamento, i.cod_parcela) for i in payload.items],
            user_id=_user_id(current_user),
            overdue_due_date=payload.overdue_due_date,
        )
    except CoraConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except CoraAPIError as e:
        raise HTTPException(status_code=502, detail=f"Falha de comunicação com o Cora: {e}")


@router.get("/companies/{company_id}/horus-cora/invoices")
def list_cora_invoices(
    company_id: int,
    status: Optional[str] = Query(None, max_length=20),
    search: Optional[str] = Query(None, max_length=100),
    pending_baixa: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_company_ownership(current_user, company_id)
    settings = _get_settings(db, company_id)
    _require_feature(settings)

    q = db.query(CoraInvoice).filter(CoraInvoice.company_id == company_id)
    if status:
        statuses = [s.strip().upper() for s in status.split(",") if s.strip()]
        q = q.filter(CoraInvoice.status.in_(statuses))
    if pending_baixa:
        q = q.filter(CoraInvoice.status == "PAID", CoraInvoice.cod_bordero_baixa.is_(None))
    if search and search.strip():
        term = search.strip()
        digits = re.sub(r"\D", "", term)
        conds = [CoraInvoice.customer_name.ilike(f"%{term}%")]
        if digits:
            conds.append(CoraInvoice.customer_document.like(f"%{digits}%"))
            if len(digits) <= 9:
                conds.append(CoraInvoice.nro_lancto_creceber == int(digits))
        q = q.filter(or_(*conds))

    total = q.count()
    rows = q.order_by(CoraInvoice.due_date.asc(), CoraInvoice.id.asc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_serialize_invoice(i) for i in rows], "total": total, "page": page, "page_size": page_size}


def _sync_and_maybe_baixa(db: Session, settings, company_id: int, invoices: List[CoraInvoice]) -> dict:
    updated = 0
    with CoraClient.from_settings(settings) as cora:
        for inv in invoices:
            previous = cora_horus.sync_invoice(cora, inv)
            if inv.status != previous:
                updated += 1
    db.commit()

    result = {"updated": updated, "baixa": None}
    sql_client = None
    if settings.cora_horus_write_back:
        to_write = [i for i in invoices if i.is_active and not i.horus_written_back and i.status in ("OPEN", "LATE")]
        if to_write:
            sql_client = sql_client or _sql_client(db, company_id)
            cora_horus.write_back_to_horus(db, settings, sql_client, to_write)
    if settings.cora_horus_auto_baixa:
        paid = [i for i in invoices if i.status == "PAID" and not i.cod_bordero_baixa]
        if paid:
            sql_client = sql_client or _sql_client(db, company_id)
            try:
                result["baixa"] = cora_horus.baixa_paid_invoices(db, settings, sql_client, paid)
            except Exception as e:
                logger.error("[HorusCora] Falha na baixa automática company=%s: %s", company_id, e)
                result["baixa_error"] = str(e)
    return result


@router.post("/companies/{company_id}/horus-cora/invoices/sync-pending")
def sync_pending_cora_invoices(company_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    assert_company_ownership(current_user, company_id)
    settings = _get_settings(db, company_id)
    _require_cora(settings)
    pending = db.query(CoraInvoice).filter(
        CoraInvoice.company_id == company_id,
        CoraInvoice.is_active.is_(True),
        CoraInvoice.cora_invoice_id.isnot(None),
        CoraInvoice.status.in_(list(cora_horus.OPEN_STATUSES)),
    ).order_by(CoraInvoice.last_synced_at.asc().nullsfirst()).limit(200).all()
    if not pending:
        return {"updated": 0, "checked": 0, "message": "Nenhum boleto pendente para sincronizar."}
    try:
        result = _sync_and_maybe_baixa(db, settings, company_id, pending)
    except (CoraConfigError, CoraAPIError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    result["checked"] = len(pending)
    return result


@router.post("/companies/{company_id}/horus-cora/invoices/{inv_id}/sync")
def sync_cora_invoice(company_id: int, inv_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    assert_company_ownership(current_user, company_id)
    settings = _get_settings(db, company_id)
    _require_cora(settings)
    inv = _invoice_or_404(db, company_id, inv_id)
    try:
        result = _sync_and_maybe_baixa(db, settings, company_id, [inv])
    except (CoraConfigError, CoraAPIError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.refresh(inv)
    return {"invoice": _serialize_invoice(inv), **result}


@router.post("/companies/{company_id}/horus-cora/invoices/{inv_id}/cancel")
def cancel_cora_invoice(company_id: int, inv_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    assert_company_ownership(current_user, company_id)
    settings = _get_settings(db, company_id)
    _require_cora(settings)
    inv = _invoice_or_404(db, company_id, inv_id)

    if inv.status == "PAID":
        raise HTTPException(status_code=400, detail="Boleto já pago não pode ser cancelado.")
    if inv.status == "CANCELLED":
        return {"invoice": _serialize_invoice(inv)}

    if inv.cora_invoice_id:
        try:
            with CoraClient.from_settings(settings) as cora:
                cora.cancel_invoice(inv.cora_invoice_id)
                cora_horus.sync_invoice(cora, inv)
        except (CoraConfigError, CoraAPIError) as e:
            raise HTTPException(status_code=400, detail=f"Cora recusou o cancelamento: {e}")
    if inv.status != "PAID":
        inv.status = "CANCELLED"
        inv.is_active = False
    db.commit()

    if inv.horus_written_back:
        try:
            cora_horus.clear_write_back(settings, _sql_client(db, company_id), inv)
            db.commit()
        except Exception as e:
            logger.error("[HorusCora] Falha ao limpar boleto do Horus inv=%s: %s", inv.id, e)
            inv.last_error = f"Cancelado no Cora, mas não foi possível limpar o boleto no Horus: {e}"[:2000]
            db.commit()
    return {"invoice": _serialize_invoice(inv)}


@router.get("/companies/{company_id}/horus-cora/invoices/{inv_id}/pdf")
def get_cora_invoice_pdf(company_id: int, inv_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    assert_company_ownership(current_user, company_id)
    settings = _get_settings(db, company_id)
    _require_cora(settings)
    inv = _invoice_or_404(db, company_id, inv_id)
    if not inv.cora_invoice_id:
        raise HTTPException(status_code=400, detail="Boleto ainda não foi registrado no Cora.")
    # A URL do PDF é assinada e pode expirar: sempre busca a versão atual
    try:
        with CoraClient.from_settings(settings) as cora:
            cora_horus.sync_invoice(cora, inv)
        db.commit()
    except (CoraConfigError, CoraAPIError) as e:
        if not inv.pdf_url:
            raise HTTPException(status_code=400, detail=str(e))
    if not inv.pdf_url:
        raise HTTPException(status_code=404, detail="PDF do boleto ainda não disponível no Cora.")
    return {"url": inv.pdf_url}


class BaixaPayload(BaseModel):
    invoice_ids: Optional[List[int]] = None


@router.post("/companies/{company_id}/horus-cora/baixa")
def baixa_cora_invoices(
    company_id: int,
    payload: BaixaPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    assert_company_ownership(current_user, company_id)
    settings = _get_settings(db, company_id)
    _require_feature(settings)

    q = db.query(CoraInvoice).filter(
        CoraInvoice.company_id == company_id,
        CoraInvoice.status == "PAID",
        CoraInvoice.cod_bordero_baixa.is_(None),
    )
    if payload.invoice_ids:
        q = q.filter(CoraInvoice.id.in_(payload.invoice_ids[:500]))
    invoices = q.limit(500).all()
    if not invoices:
        raise HTTPException(status_code=400, detail="Nenhum boleto pago pendente de baixa.")

    sql_client = _sql_client(db, company_id)
    try:
        result = cora_horus.baixa_paid_invoices(db, settings, sql_client, invoices)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"{e} Preencha os parâmetros de borderô do Cora nas configurações.")
    except Exception as e:
        logger.error("[HorusCora] Erro ao gerar borderô company=%s: %s", company_id, e)
        raise HTTPException(status_code=500, detail=f"Erro ao gravar borderô no Horus: {e}")
    if not result.get("bordero"):
        return {"success": False, **result, "message": "Nenhum título elegível (já baixados ou fora de aberto no Horus)."}
    return {
        "success": True, **result,
        "message": f"Borderô #{result['bordero']} gerado no Horus (R$ {result['total']:.2f} em {result['count']} títulos).",
    }


# ── Webhook público ──────────────────────────────────────────────────────────

def _process_cora_webhook(company_id: int, cora_invoice_id: str) -> None:
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        inv = db.query(CoraInvoice).filter(
            CoraInvoice.company_id == company_id, CoraInvoice.cora_invoice_id == cora_invoice_id,
        ).first()
        if not inv:
            return
        settings = _get_settings(db, company_id)
        if not settings.cora_enabled or not getattr(settings, "horus_sql_feature_cora_boleto", False):
            return
        _sync_and_maybe_baixa(db, settings, company_id, [inv])
    except Exception as e:
        logger.error("[HorusCora][Webhook] Erro company=%s invoice=%s: %s", company_id, cora_invoice_id, e)
    finally:
        db.close()


@router.post("/financial/webhooks/cora/{company_id}/{secret}")
async def cora_webhook(company_id: int, secret: str, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Recebe notificações do Cora. Responde 200 imediatamente e revalida o status na API do Cora
    em background — o conteúdo do payload nunca é usado como fonte da verdade.
    """
    from app.models.company_settings import CompanySettings

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings or not settings.cora_webhook_secret or not hmac.compare_digest(secret, settings.cora_webhook_secret):
        return {"status": "ignored"}

    invoice_id = request.headers.get("webhook-resource-id") or request.headers.get("Webhook-Resource-Id")
    if not invoice_id:
        try:
            body = await request.json()
        except Exception:
            body = None
        if isinstance(body, dict):
            nested = [body.get("resource"), body.get("invoice"), body.get("data")]
            invoice_id = body.get("id") or next(
                (n.get("id") for n in nested if isinstance(n, dict) and n.get("id")), None
            )
    if invoice_id and re.match(r"^[A-Za-z0-9_\-]{4,64}$", str(invoice_id)):
        background_tasks.add_task(_process_cora_webhook, company_id, str(invoice_id))
    return {"status": "received"}
