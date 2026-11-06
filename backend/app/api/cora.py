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
from app.models.company_settings import CompanySettings
from app.models.cora import (
    CORA_CERT_FORMATS, CORA_ENVIRONMENTS, CORA_INTEGRATION_MODES, CORA_NOTIFY_RULES, CORA_PAYMENT_FORMS,
    CoraAccount, CoraConfig,
)
from app.models.financial import FinancialAccount
from app.models.payments import PayChannelRoute
from app.payments.catalog import PRIMARY_USAGE_CHANNELS, PROVIDER_CATALOG
from sqlalchemy import text as sa_text

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_CERT_FILE_BYTES = 1 * 1024 * 1024  # certificados reais têm poucos KB; teto de 1 MB por arquivo
_CORA_SETTLEMENT_COLUMNS_CHECKED = False


def _ensure_cora_settlement_columns(db: Session) -> None:
    """Garante defensivamente que as colunas de baixa de retorno (Cronuz e Horus) existam em fin_cora_config."""
    global _CORA_SETTLEMENT_COLUMNS_CHECKED
    if _CORA_SETTLEMENT_COLUMNS_CHECKED:
        return
    try:
        db.execute(sa_text(
            "ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS cronuz_baixa_enabled BOOLEAN NOT NULL DEFAULT TRUE; "
            "ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS cronuz_account_id INTEGER REFERENCES fin_account(id) ON DELETE SET NULL; "
            "ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_baixa_enabled BOOLEAN NOT NULL DEFAULT FALSE; "
            "ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_cod_banco VARCHAR(20); "
            "ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_cod_agencia VARCHAR(20); "
            "ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_cod_contac VARCHAR(20); "
            "ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_nro_carteira VARCHAR(20); "
            "ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_cod_forma VARCHAR(20); "
            "ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_tarifa_boleto NUMERIC(10, 2);"
        ))
        db.commit()
        _CORA_SETTLEMENT_COLUMNS_CHECKED = True
    except Exception as e:
        db.rollback()
        logger.warning("[Cora] Falha ao verificar/criar colunas de baixa em fin_cora_config: %s", e)


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
    _ensure_cora_settlement_columns(db)
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
        "invoice_allowed_payment_forms": [f.strip() for f in (config.invoice_allowed_payment_forms or "").split(",") if f.strip()] if config else [],
        "cronuz_baixa_enabled": bool(getattr(config, "cronuz_baixa_enabled", True)) if config else True,
        "cronuz_account_id": getattr(config, "cronuz_account_id", None) if config else None,
        "horus_baixa_enabled": bool(getattr(config, "horus_baixa_enabled", False)) if config else False,
        "horus_cod_banco": (getattr(config, "horus_cod_banco", None) or "") if config else "",
        "horus_cod_agencia": (getattr(config, "horus_cod_agencia", None) or "") if config else "",
        "horus_cod_contac": (getattr(config, "horus_cod_contac", None) or "") if config else "",
        "horus_nro_carteira": (getattr(config, "horus_nro_carteira", None) or "") if config else "",
        "horus_cod_forma": (getattr(config, "horus_cod_forma", None) or "") if config else "",
        "horus_tarifa_boleto": dec(getattr(config, "horus_tarifa_boleto", None)) if config else None,
    }


def _build_usage_channels(db: Session, company_id: int, config: Optional[CoraConfig]) -> List[dict]:
    routes = db.query(PayChannelRoute).filter(PayChannelRoute.company_id == company_id).all()
    by_ch_m = {(r.channel, r.method): r.provider for r in routes}
    forms = config.payment_forms if config else "BANK_SLIP_PIX"
    cora_methods = ["BOLETO", "PIX"] if forms == "BANK_SLIP_PIX" else ["BOLETO"]

    out: List[dict] = []
    for ch in PRIMARY_USAGE_CHANNELS:
        code = ch["code"]
        boleto_prov = by_ch_m.get((code, "BOLETO"))
        pix_prov = by_ch_m.get((code, "PIX"))
        cora_active = (boleto_prov == "CORA") or (pix_prov == "CORA")
        other_prov = None
        if boleto_prov and boleto_prov != "CORA":
            other_prov = boleto_prov
        elif pix_prov and pix_prov != "CORA" and "PIX" in cora_methods:
            other_prov = pix_prov

        out.append({
            "code": code,
            "name": ch["name"],
            "description": ch["description"],
            "enabled": cora_active,
            "methods": [m for m in cora_methods if by_ch_m.get((code, m)) == "CORA"] if cora_active else cora_methods,
            "occupied_by_provider": other_prov,
            "occupied_by_name": PROVIDER_CATALOG.get(other_prov, {}).get("name", other_prov) if other_prov else None,
        })
    return out


def _sync_cora_usage_channels(
    db: Session,
    company_id: int,
    selected_channels: List[str],
    payment_forms: str,
    user_id: Optional[int],
) -> None:
    valid_codes = {c["code"]: c["name"] for c in PRIMARY_USAGE_CHANNELS}
    wanted = {c.strip().upper() for c in (selected_channels or []) if c and c.strip().upper() in valid_codes}
    cora_methods = ["BOLETO", "PIX"] if (payment_forms or "BANK_SLIP_PIX") == "BANK_SLIP_PIX" else ["BOLETO"]

    existing = {
        (r.channel, r.method): r
        for r in db.query(PayChannelRoute).filter(
            PayChannelRoute.company_id == company_id,
            PayChannelRoute.channel.in_(list(valid_codes.keys())),
        ).all()
    }

    # 1. Trava arquitetural: não permite ativar se outro provedor já ocupa o canal/forma
    for ch_code in wanted:
        for method in cora_methods:
            row = existing.get((ch_code, method))
            if row and row.provider != "CORA":
                other_name = PROVIDER_CATALOG.get(row.provider, {}).get("name", row.provider)
                ch_name = valid_codes.get(ch_code, ch_code)
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"O local '{ch_name}' ({method}) já está vinculado a {other_name}. "
                        f"Por segurança, não é permitido utilizar mais de uma integração para a mesma forma de pagamento no mesmo canal."
                    ),
                )

    # 2. Aplica canais marcados e remove canais desmarcados (apenas onde o provedor é CORA)
    for ch_code in valid_codes:
        if ch_code in wanted:
            for method in ("BOLETO", "PIX"):
                row = existing.get((ch_code, method))
                if method in cora_methods:
                    if row is None:
                        db.add(PayChannelRoute(
                            company_id=company_id,
                            channel=ch_code,
                            method=method,
                            provider="CORA",
                            changed_by_user_id=user_id,
                        ))
                    elif row.provider == "CORA":
                        row.changed_by_user_id = user_id
                else:
                    if row is not None and row.provider == "CORA":
                        db.delete(row)
        else:
            for method in ("BOLETO", "PIX"):
                row = existing.get((ch_code, method))
                if row is not None and row.provider == "CORA":
                    db.delete(row)


def _overview(db: Session, company: Company) -> dict:
    _ensure_cora_settlement_columns(db)
    config = db.query(CoraConfig).filter(CoraConfig.company_id == company.id).first()
    accounts = {a.environment: a for a in db.query(CoraAccount).filter(CoraAccount.company_id == company.id).all()}
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company.id).first()
    cora_enabled = bool(is_enabled(db, company.id, "CORA"))
    horus_enabled = bool(settings and (settings.horus_enabled or settings.horus_sql_enabled))
    horus_sql_enabled = bool(settings and settings.horus_sql_enabled)
    cronuz_accounts = [
        {
            "id": a.id,
            "name": a.name,
            "type": a.type,
            "current_balance": float(a.current_balance or 0),
        }
        for a in db.query(FinancialAccount)
        .filter(FinancialAccount.company_id == company.id, FinancialAccount.active.is_(True))
        .order_by(FinancialAccount.name.asc())
        .all()
    ]
    return {
        "enabled": cora_enabled,
        "integrations": {
            "cora_enabled": cora_enabled,
            "horus_enabled": horus_enabled,
            "horus_sql_enabled": horus_sql_enabled,
            "can_use_horus_baixa": bool(cora_enabled and horus_sql_enabled),
        },
        "cronuz_accounts": cronuz_accounts,
        "webhook": {
            "registered": bool(config and config.webhook_endpoint_ids),
            "environment": config.webhook_environment if config else None,
        },
        "config": _serialize_config(config),
        "usage_channels": _build_usage_channels(db, company.id, config),
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


@router.get("/companies/{company_id}/cora/horus-bank-options")
def get_cora_horus_bank_options(company_id: int, db: Session = Depends(get_db), current_user=Depends(cora_access)):
    """
    Consulta somente-leitura opcional no Horus SQL para auxiliar o seller a visualizar
    as Contas Bancárias (BCONTAC_GERAL / BCONTAC_CARTEIRA) e Formas de Pagamento (FORMA_PAGTO)
    cadastradas no Horus ERP.
    """
    _company_or_404(db, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings or not settings.horus_sql_enabled:
        raise HTTPException(
            status_code=400,
            detail="A conexão Horus SQL não está habilitada para esta empresa.",
        )

    from app.integrators.horus_sql import HorusSQLClient

    bank_accounts = []
    payment_forms = []
    try:
        with HorusSQLClient(settings) as sql:
            rows_acc = sql.fetch_all("""
                SELECT
                    cg.COD_EMPRESA,
                    cg.COD_FILIAL,
                    cg.COD_BANCO,
                    b.NOME_BANCO,
                    cg.COD_AGENCIA,
                    ag.NOME_AGENCIA,
                    cg.COD_CONTAC,
                    cg.NUM_CC,
                    cg.DIG_CC,
                    cg.NOME_CONTAC,
                    cart.NRO_CARTEIRA
                FROM BCONTAC_GERAL cg
                LEFT JOIN BBANCOS b ON b.COD_BANCO = cg.COD_BANCO
                LEFT JOIN BAGENCIAS ag ON ag.COD_BANCO = cg.COD_BANCO AND ag.COD_AGENCIA = cg.COD_AGENCIA
                LEFT JOIN BCONTAC_CARTEIRA cart
                    ON cart.COD_BANCO = cg.COD_BANCO
                   AND cart.COD_AGENCIA = cg.COD_AGENCIA
                   AND cart.COD_CONTAC = cg.COD_CONTAC
                ORDER BY cg.COD_BANCO, cg.COD_AGENCIA, cg.COD_CONTAC
            """)
            for r in rows_acc:
                bank_accounts.append({
                    "cod_empresa": str(r.get("COD_EMPRESA") or "").strip(),
                    "cod_filial": str(r.get("COD_FILIAL") or "").strip(),
                    "cod_banco": str(r.get("COD_BANCO") or "").strip(),
                    "nome_banco": str(r.get("NOME_BANCO") or "").strip(),
                    "cod_agencia": str(r.get("COD_AGENCIA") or "").strip(),
                    "nome_agencia": str(r.get("NOME_AGENCIA") or "").strip(),
                    "cod_contac": str(r.get("COD_CONTAC") or "").strip(),
                    "num_cc": str(r.get("NUM_CC") or "").strip(),
                    "dig_cc": str(r.get("DIG_CC") or "").strip(),
                    "nome_contac": str(r.get("NOME_CONTAC") or "").strip(),
                    "nro_carteira": str(r.get("NRO_CARTEIRA") or "").strip(),
                })

            rows_fp = sql.fetch_all("""
                SELECT COD_FORMA, NOM_FORMA, TIPO_FORMA_PAGTO
                FROM FORMA_PAGTO
                ORDER BY COD_FORMA
            """)
            for f in rows_fp:
                payment_forms.append({
                    "cod_forma": str(f.get("COD_FORMA") or "").strip(),
                    "nom_forma": str(f.get("NOM_FORMA") or "").strip(),
                    "tipo_forma_pagto": str(f.get("TIPO_FORMA_PAGTO") or "").strip(),
                })
    except Exception as e:
        logger.warning("[Cora] Falha ao consultar contas/formas no Horus SQL company=%s: %s", company_id, e)
        raise HTTPException(
            status_code=400,
            detail="Não foi possível consultar as tabelas bancárias do Horus no momento. Você pode preencher os códigos diretamente nos campos abaixo.",
        )

    return {
        "bank_accounts": bank_accounts,
        "payment_forms": payment_forms,
    }


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
    usage_channels: Optional[List[str]] = None
    invoice_allowed_payment_forms: Optional[List[str]] = None
    cronuz_baixa_enabled: Optional[bool] = None
    cronuz_account_id: Optional[int] = None
    horus_baixa_enabled: Optional[bool] = None
    horus_cod_banco: Optional[str] = Field(None, max_length=20)
    horus_cod_agencia: Optional[str] = Field(None, max_length=20)
    horus_cod_contac: Optional[str] = Field(None, max_length=20)
    horus_nro_carteira: Optional[str] = Field(None, max_length=20)
    horus_cod_forma: Optional[str] = Field(None, max_length=20)
    horus_tarifa_boleto: Optional[float] = Field(None, ge=0, le=99999)

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
    usage_channels = data.pop("usage_channels", None)

    if data.get("active_environment") == "PRODUCTION":
        prod = db.query(CoraAccount).filter(
            CoraAccount.company_id == company_id, CoraAccount.environment == "PRODUCTION"
        ).first()
        if not (prod and prod.client_id and prod.cert_content and prod.key_content):
            raise HTTPException(status_code=400, detail="Cadastre as credenciais de Produção antes de ativar esse ambiente.")

    # Validação da Conta Bancária nativa do Cronuz (se informada)
    if "cronuz_account_id" in data and data["cronuz_account_id"] is not None:
        acc = db.query(FinancialAccount).filter(
            FinancialAccount.id == data["cronuz_account_id"],
            FinancialAccount.company_id == company_id,
        ).first()
        if not acc:
            raise HTTPException(status_code=400, detail="Conta bancária do Cronuz inválida para esta empresa.")

    # Sanitiza campos textuais do Horus
    for h_str_field in ("horus_cod_banco", "horus_cod_agencia", "horus_cod_contac", "horus_nro_carteira", "horus_cod_forma"):
        if h_str_field in data:
            val = (data[h_str_field] or "").strip()
            data[h_str_field] = val or None

    # Trava arquitetural de dependência: Baixa no Horus exige Cora ativo + Horus SQL ativo + Banco/Agência/Conta preenchidos
    next_horus_baixa = data.get("horus_baixa_enabled", bool(getattr(config, "horus_baixa_enabled", False)))
    if next_horus_baixa:
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
        cora_active = is_enabled(db, company_id, "CORA")
        horus_sql_active = bool(settings and settings.horus_sql_enabled)
        if not (cora_active and horus_sql_active):
            raise HTTPException(
                status_code=400,
                detail="A baixa automática no Horus ERP só pode ser ativada quando a empresa possui o Banco Cora e a integração Horus SQL habilitados simultaneamente.",
            )
        eff_banco = data.get("horus_cod_banco", getattr(config, "horus_cod_banco", None))
        eff_agencia = data.get("horus_cod_agencia", getattr(config, "horus_cod_agencia", None))
        eff_contac = data.get("horus_cod_contac", getattr(config, "horus_cod_contac", None))
        if not (eff_banco and eff_agencia and eff_contac):
            raise HTTPException(
                status_code=400,
                detail="Informe os códigos obrigatórios do Horus (Código do Banco, Código da Agência e Código da Conta Corrente) antes de ativar a baixa automática no Horus ERP.",
            )

    for field in ("fine_rate", "interest_rate", "discount_rate", "horus_tarifa_boleto"):
        if field in data:
            data[field] = Decimal(str(data[field])).quantize(Decimal("0.01")) if data[field] is not None else None
    if "notify_rules" in data:
        data["notify_rules"] = ",".join(data["notify_rules"] or []) or None
    if "invoice_allowed_payment_forms" in data:
        cleaned_forms = [str(f).strip() for f in (data["invoice_allowed_payment_forms"] or []) if str(f).strip()]
        data["invoice_allowed_payment_forms"] = ",".join(dict.fromkeys(cleaned_forms)) or None

    for field, value in data.items():
        setattr(config, field, value)
    config.updated_by_user_id = current_user.id

    if usage_channels is not None:
        _sync_cora_usage_channels(db, company_id, usage_channels, config.payment_forms or "BANK_SLIP_PIX", current_user.id)
    elif "payment_forms" in data:
        # Sincroniza PIX nos canais já ativos do Cora caso tenha mudado entre Boleto+Pix e Somente Boleto
        current_active = [c["code"] for c in _build_usage_channels(db, company_id, config) if c["enabled"]]
        _sync_cora_usage_channels(db, company_id, current_active, config.payment_forms or "BANK_SLIP_PIX", current_user.id)

    db.commit()
    return _overview(db, company)


class CoraChannelsPayload(BaseModel):
    channels: List[str] = Field(default_factory=list)


@router.put("/companies/{company_id}/cora/channels")
def update_cora_channels(
    company_id: int,
    payload: CoraChannelsPayload,
    db: Session = Depends(get_db),
    current_user=Depends(cora_access),
):
    company = _company_or_404(db, company_id)
    config = _get_or_create_config(db, company_id)
    _sync_cora_usage_channels(db, company_id, payload.channels, config.payment_forms or "BANK_SLIP_PIX", current_user.id)
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
