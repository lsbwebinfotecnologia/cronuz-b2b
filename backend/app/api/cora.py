"""
cora.py
-------
Configuração do Banco Cora por seller.

Acesso: o MASTER habilita o Cora no Hub de Pagamentos (payments_hub.py). Com o Cora habilitado,
o SELLER configura credenciais e parâmetros; o MASTER mantém acesso total para suporte.

Rotas:
  GET    /companies/{id}/cora                          → habilitação + configuração + credenciais (sem segredos)
  PUT    /companies/{id}/cora/config                   → ambiente ativo, formas de pagamento, multa/juros/desconto, notificações
  PUT    /companies/{id}/cora/accounts/{environment}   → Client ID + importação do certificado (PEM ou PFX) [multipart]
  DELETE /companies/{id}/cora/accounts/{environment}   → remove as credenciais do ambiente
  POST   /companies/{id}/cora/accounts/{environment}/test → autenticação mTLS real no Cora (token)
  POST   /companies/{id}/cora/webhook                  → registra no Cora os webhooks (pago, cancelado, vencido)
"""
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.utils import assert_company_ownership
from app.payments.registry import is_enabled
from app.core.upload_security import read_file_safely, validate_file_size_and_extension
from app.db.session import get_db
from app.integrators.cora.certificates import CoraCertificateError, load_pem_pair, load_pfx
from app.integrators.cora.client import CoraAPIError, CoraClient, CoraConfigError
from app.models.company import Company
from app.models.cora import (
    CORA_CERT_FORMATS, CORA_ENVIRONMENTS, CORA_INTEGRATION_MODES, CORA_NOTIFY_RULES, CORA_PAYMENT_FORMS,
    CoraAccount, CoraConfig,
)

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_CERT_FILE_BYTES = 1 * 1024 * 1024  # certificados reais têm poucos KB; teto de 1 MB por arquivo


# ── Helpers ──────────────────────────────────────────────────────────────────

def _is_master(user) -> bool:
    t = getattr(user, "type", None)
    return str(getattr(t, "value", t) or "").upper() == "MASTER"


def cora_access(company_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """
    MASTER: acesso total (suporte).
    SELLER: somente a própria empresa e apenas se o Banco Cora estiver habilitado no Hub de Pagamentos.
    """
    assert_company_ownership(current_user, company_id)
    if not _is_master(current_user) and not is_enabled(db, company_id, "CORA"):
        raise HTTPException(status_code=403, detail="Banco Cora não está habilitado para esta empresa.")
    return current_user


def _company_or_404(db: Session, company_id: int) -> Company:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    return company


def _get_or_create_config(db: Session, company_id: int) -> CoraConfig:
    config = db.query(CoraConfig).filter(CoraConfig.company_id == company_id).first()
    if not config:
        config = CoraConfig(company_id=company_id)
        db.add(config)
        db.flush()
    return config


def _validate_environment(environment: str) -> str:
    env = (environment or "").upper()
    if env not in CORA_ENVIRONMENTS:
        raise HTTPException(status_code=400, detail="Ambiente inválido. Use STAGE ou PRODUCTION.")
    return env


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _serialize_account(account: Optional[CoraAccount], environment: str) -> dict:
    if not account:
        return {"environment": environment, "configured": False, "client_id": "", "has_certificate": False}
    now = datetime.now(timezone.utc)
    days_left = (account.cert_valid_until - now).days if account.cert_valid_until else None
    return {
        "environment": environment,
        "configured": bool(account.client_id and account.cert_content and account.key_content),
        "client_id": account.client_id or "",
        "has_certificate": bool(account.cert_content and account.key_content),
        "cert_format": account.cert_format,
        "cert_subject": account.cert_subject,
        "cert_valid_from": _iso(account.cert_valid_from),
        "cert_valid_until": _iso(account.cert_valid_until),
        "cert_days_left": days_left,
        "last_test_at": _iso(account.last_test_at),
        "last_test_ok": account.last_test_ok,
        "last_test_message": account.last_test_message,
        "updated_at": _iso(account.updated_at),
    }


def _serialize_config(config: Optional[CoraConfig]) -> dict:
    def dec(v):
        return float(v) if v is not None else None

    return {
        "active_environment": config.active_environment if config else "STAGE",
        "integration_mode": config.integration_mode if config else "DIRECT",
        "payment_forms": config.payment_forms if config else "BANK_SLIP_PIX",
        "fine_rate": dec(config.fine_rate) if config else None,
        "interest_rate": dec(config.interest_rate) if config else None,
        "discount_rate": dec(config.discount_rate) if config else None,
        "notify_enabled": bool(config.notify_enabled) if config else False,
        "notify_rules": [r for r in (config.notify_rules or "").split(",") if r] if config else [],
    }


def _overview(db: Session, company: Company) -> dict:
    config = db.query(CoraConfig).filter(CoraConfig.company_id == company.id).first()
    accounts = {a.environment: a for a in db.query(CoraAccount).filter(CoraAccount.company_id == company.id).all()}
    return {
        "enabled": is_enabled(db, company.id, "CORA"),
        "webhook": {
            "registered": bool(config and config.webhook_endpoint_ids),
            "environment": config.webhook_environment if config else None,
        },
        "config": _serialize_config(config),
        "accounts": {env: _serialize_account(accounts.get(env), env) for env in CORA_ENVIRONMENTS},
        "options": {
            "environments": list(CORA_ENVIRONMENTS),
            "integration_modes": list(CORA_INTEGRATION_MODES),
            "payment_forms": list(CORA_PAYMENT_FORMS),
            "cert_formats": list(CORA_CERT_FORMATS),
            "notify_rules": list(CORA_NOTIFY_RULES),
        },
    }


# ── Leitura ──────────────────────────────────────────────────────────────────

@router.get("/companies/{company_id}/cora")
def get_cora_overview(company_id: int, db: Session = Depends(get_db), current_user=Depends(cora_access)):
    company = _company_or_404(db, company_id)
    return _overview(db, company)


# ── Configuração geral ───────────────────────────────────────────────────────

class CoraConfigPayload(BaseModel):
    active_environment: Optional[str] = None
    integration_mode: Optional[str] = None
    payment_forms: Optional[str] = None
    fine_rate: Optional[float] = Field(None, ge=0, le=100)
    interest_rate: Optional[float] = Field(None, ge=0, le=100)
    discount_rate: Optional[float] = Field(None, ge=0, le=100)
    notify_enabled: Optional[bool] = None
    notify_rules: Optional[List[str]] = None

    @field_validator("active_environment")
    @classmethod
    def _env(cls, v):
        if v is not None and v.upper() not in CORA_ENVIRONMENTS:
            raise ValueError("Ambiente inválido.")
        return v.upper() if v else v

    @field_validator("integration_mode")
    @classmethod
    def _mode(cls, v):
        if v is not None and v.upper() not in CORA_INTEGRATION_MODES:
            raise ValueError("Modalidade não suportada. Disponível: Integração Direta.")
        return v.upper() if v else v

    @field_validator("payment_forms")
    @classmethod
    def _forms(cls, v):
        if v is not None and v.upper() not in CORA_PAYMENT_FORMS:
            raise ValueError("Forma de pagamento inválida.")
        return v.upper() if v else v

    @field_validator("notify_rules")
    @classmethod
    def _rules(cls, v):
        if v is None:
            return v
        invalid = [r for r in v if r not in CORA_NOTIFY_RULES]
        if invalid:
            raise ValueError(f"Regras de notificação inválidas: {', '.join(invalid)}")
        return list(dict.fromkeys(v))


@router.put("/companies/{company_id}/cora/config")
def update_cora_config(
    company_id: int,
    payload: CoraConfigPayload,
    db: Session = Depends(get_db),
    current_user=Depends(cora_access),
):
    company = _company_or_404(db, company_id)
    config = _get_or_create_config(db, company_id)
    data = payload.model_dump(exclude_unset=True)

    if data.get("active_environment") == "PRODUCTION":
        prod = db.query(CoraAccount).filter(
            CoraAccount.company_id == company_id, CoraAccount.environment == "PRODUCTION"
        ).first()
        if not (prod and prod.client_id and prod.cert_content and prod.key_content):
            raise HTTPException(status_code=400, detail="Cadastre as credenciais de Produção antes de ativar esse ambiente.")

    for field in ("fine_rate", "interest_rate", "discount_rate"):
        if field in data:
            data[field] = Decimal(str(data[field])).quantize(Decimal("0.01")) if data[field] is not None else None
    if "notify_rules" in data:
        data["notify_rules"] = ",".join(data["notify_rules"] or []) or None

    for field, value in data.items():
        setattr(config, field, value)
    config.updated_by_user_id = current_user.id
    db.commit()
    return _overview(db, company)


# ── Credenciais por ambiente ─────────────────────────────────────────────────

async def _read_cert_file(upload: Optional[UploadFile]) -> Optional[bytes]:
    if upload is None or not upload.filename:
        return None
    validate_file_size_and_extension(upload, category="cert", custom_max_size=MAX_CERT_FILE_BYTES)
    content = await read_file_safely(upload, max_size_bytes=MAX_CERT_FILE_BYTES)
    if not content:
        raise HTTPException(status_code=400, detail=f"O arquivo {upload.filename} está vazio.")
    return content


@router.put("/companies/{company_id}/cora/accounts/{environment}")
async def upsert_cora_account(
    company_id: int,
    environment: str,
    client_id: str = Form(..., min_length=3, max_length=255),
    cert_format: str = Form("PEM"),
    certificate: Optional[UploadFile] = File(None),   # PEM: certificate.pem / .crt
    private_key: Optional[UploadFile] = File(None),   # PEM: private-key.key
    pfx_file: Optional[UploadFile] = File(None),      # PFX: arquivo .pfx / .p12
    password: Optional[str] = Form(None, max_length=255),  # senha do PFX (ou da chave PEM, se protegida)
    db: Session = Depends(get_db),
    current_user=Depends(cora_access),
):
    """
    Cria/atualiza as credenciais do ambiente. Os arquivos são opcionais quando já existe certificado salvo
    (permite trocar só o Client ID). Arquivos são processados em memória — nada é gravado em disco.
    """
    from app.core.horus_sql_crypto import encrypt_sql_credential

    env = _validate_environment(environment)
    company = _company_or_404(db, company_id)
    fmt = (cert_format or "PEM").upper()
    if fmt not in CORA_CERT_FORMATS:
        raise HTTPException(status_code=400, detail="Formato de certificado inválido. Use PEM ou PFX.")

    account = db.query(CoraAccount).filter(CoraAccount.company_id == company_id, CoraAccount.environment == env).first()

    normalized = None
    try:
        if fmt == "PEM":
            cert_bytes = await _read_cert_file(certificate)
            key_bytes = await _read_cert_file(private_key)
            if cert_bytes or key_bytes:
                if not (cert_bytes and key_bytes):
                    raise HTTPException(status_code=400, detail="No formato PEM envie o certificado e a chave privada juntos.")
                normalized = load_pem_pair(cert_bytes, key_bytes, key_password=password)
        else:
            pfx_bytes = await _read_cert_file(pfx_file)
            if pfx_bytes:
                normalized = load_pfx(pfx_bytes, password)
    except CoraCertificateError as e:
        raise HTTPException(status_code=400, detail=str(e))

    has_saved_cert = bool(account and account.cert_content and account.key_content)
    if normalized is None and not has_saved_cert:
        raise HTTPException(status_code=400, detail="Importe o certificado para cadastrar as credenciais deste ambiente.")

    if account is None:
        account = CoraAccount(company_id=company_id, environment=env)
        db.add(account)

    new_client_id = client_id.strip()
    credentials_changed = normalized is not None or new_client_id != (account.client_id or "")
    account.client_id = new_client_id
    if normalized is not None:
        account.cert_format = fmt
        account.cert_content = normalized.cert_pem
        account.key_content = encrypt_sql_credential(normalized.key_pem)
        account.cert_subject = normalized.subject
        account.cert_valid_from = normalized.valid_from
        account.cert_valid_until = normalized.valid_until
    if credentials_changed:
        account.last_test_at = None
        account.last_test_ok = None
        account.last_test_message = None
    account.updated_by_user_id = current_user.id

    _get_or_create_config(db, company_id)
    db.commit()
    logger.info("[Cora] Credenciais %s atualizadas company=%s por user=%s", env, company_id, current_user.id)
    return _overview(db, company)


@router.delete("/companies/{company_id}/cora/accounts/{environment}")
def delete_cora_account(
    company_id: int,
    environment: str,
    db: Session = Depends(get_db),
    current_user=Depends(cora_access),
):
    env = _validate_environment(environment)
    company = _company_or_404(db, company_id)
    config = db.query(CoraConfig).filter(CoraConfig.company_id == company_id).first()
    if config and config.active_environment == env and env == "PRODUCTION":
        raise HTTPException(status_code=400, detail="Altere o ambiente ativo para Stage antes de remover as credenciais de Produção.")
    account = db.query(CoraAccount).filter(CoraAccount.company_id == company_id, CoraAccount.environment == env).first()
    if account:
        db.delete(account)
        db.commit()
        logger.info("[Cora] Credenciais %s removidas company=%s por user=%s", env, company_id, current_user.id)
    return _overview(db, company)


@router.post("/companies/{company_id}/cora/accounts/{environment}/test")
def test_cora_account(
    company_id: int,
    environment: str,
    db: Session = Depends(get_db),
    current_user=Depends(cora_access),
):
    env = _validate_environment(environment)
    _company_or_404(db, company_id)
    account = db.query(CoraAccount).filter(CoraAccount.company_id == company_id, CoraAccount.environment == env).first()
    if not account:
        raise HTTPException(status_code=400, detail="Cadastre as credenciais deste ambiente antes de testar.")

    ok, message = False, ""
    try:
        with CoraClient.from_account(account) as cora:
            result = cora.test_connection()
        ok, message = True, result["message"]
    except (CoraConfigError, CoraAPIError) as e:
        message = str(e)
    except Exception as e:  # erro inesperado (rede, TLS) — registra sem derrubar a rota
        logger.error("[Cora] Falha inesperada no teste company=%s env=%s: %s", company_id, env, e)
        message = f"Falha inesperada: {e}"

    account.last_test_at = datetime.now(timezone.utc)
    account.last_test_ok = ok
    account.last_test_message = message[:500]
    db.commit()
    return {"success": ok, "environment": env, "message": message, "tested_at": _iso(account.last_test_at)}


class WebhookRegisterPayload(BaseModel):
    public_base_url: str = Field(..., max_length=255)


@router.post("/companies/{company_id}/cora/webhook")
def register_cora_webhook(
    company_id: int,
    payload: WebhookRegisterPayload,
    db: Session = Depends(get_db),
    current_user=Depends(cora_access),
):
    """Registra no Cora (ambiente ativo) os webhooks de boleto pago, cancelado e vencido."""
    import re
    import secrets

    from app.payments.base import PaymentProviderError
    from app.payments.providers.cora import CoraProvider

    company = _company_or_404(db, company_id)
    base = payload.public_base_url.strip().rstrip("/")
    if not re.match(r"^https://[^\s/]+", base):
        raise HTTPException(status_code=400, detail="Informe a URL pública HTTPS da API (ex.: https://api.seudominio.com.br).")

    config = _get_or_create_config(db, company_id)
    if not config.webhook_secret:
        config.webhook_secret = secrets.token_urlsafe(32)[:48]
    url = f"{base}/payments/webhooks/cora/{company_id}/{config.webhook_secret}"
    previous = [x for x in (config.webhook_endpoint_ids or "").split(",") if x]
    try:
        with CoraProvider(db, company_id) as provider:
            created = provider.register_webhooks(url, previous if config.webhook_environment == provider.environment else [])
            env = provider.environment
    except PaymentProviderError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Falha ao registrar webhook: {e}")

    config.webhook_endpoint_ids = ",".join(created)[:500] or None
    config.webhook_environment = env
    db.commit()
    logger.info("[Cora] Webhook registrado company=%s env=%s endpoints=%s", company_id, env, len(created))
    return {"message": f"Webhook registrado no Cora ({len(created)} gatilhos).", **_overview(db, company)}
