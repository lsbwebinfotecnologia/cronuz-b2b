"""
horus_api_bridge.py
-------------------
Gateway da API Horus Complementar & Túnel Reverso para o Executável Windows (HorusAPIBridge.exe).

Responsabilidades:
1. Licenciamento Criptográfico HMAC-SHA256 (HBRI1.<payload>.<sig>) com validade gerenciada pelo Master.
2. Geração e validação de Credenciais da API Pública por Seller (Basic Auth Login/Senha + Bearer Token / X-API-Key).
3. Túnel Reverso Outbound de Baixa Latência (Long-Polling Assíncrono com Event + WebSocket + Compressão GZIP)
   para clientes sem porta liberada no firewall (8060 API Horus / 1433 SQL Server).
4. Espelhamento 100% compatível de todos os endpoints da documentação oficial Horus (/Horus/api/TServerB2B/<Endpoint>).
5. Endpoints Complementares Financeiros e Operacionais (executados localmente no SQL Server pelo .exe via pytds,
   sem expor o banco de dados na internet e sem trafegar SQL aberto).
6. Governança: Rate Limiting por Seller, respeito automático a horus_legacy_pagination (OFFSET/LIMIT) e SD_*/AC_*.
"""

import asyncio
import base64
import gzip
import hashlib
import hmac
import json
import logging
import secrets
import time
import uuid
from collections import deque
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core import dependencies, security
from app.core.utils import assert_company_ownership
from app.db.session import get_db, SessionLocal
from app.models import company as company_models
from app.models import company_settings as settings_models
from app.models import user as user_models

logger = logging.getLogger("cronuz.horus_api_bridge")

router = APIRouter(tags=["horus-api-bridge"])

# Segredo criptográfico compartilhado entre o Backend e o Executável HorusAPIBridge.exe
HORUS_BRIDGE_LICENSE_SECRET = b"CRONUZ-HORUS-API-BRIDGE-LICENSE-V1-2026-KEY-4D9E8A7F"


# ──────────────────────────────────────────────────────────────────────────────
# Estruturas em Memória do Túnel Reverso e Rate Limiting (Alta Performance)
# ──────────────────────────────────────────────────────────────────────────────

class BridgeCommandRequest:
    def __init__(
        self,
        req_id: str,
        company_id: int,
        target_type: str,  # "HORUS_HTTP" ou "HORUS_SQL_COMPLEMENT"
        method: str,
        endpoint: str,
        params: Dict[str, Any],
        body: Any = None,
        timeout: float = 55.0,
    ):
        self.req_id = req_id
        self.company_id = company_id
        self.target_type = target_type
        self.method = method.upper()
        self.endpoint = endpoint
        self.params = params or {}
        self.body = body
        self.created_at = time.time()
        self.timeout = timeout
        self.event = asyncio.Event()
        self.response_status: int = 200
        self.response_data: Any = None
        self.error_message: Optional[str] = None

    def to_agent_dict(self) -> Dict[str, Any]:
        return {
            "req_id": self.req_id,
            "target_type": self.target_type,
            "method": self.method,
            "endpoint": self.endpoint,
            "params": self.params,
            "body": self.body,
            "created_at": self.created_at,
        }


class AgentSessionState:
    def __init__(self, company_id: int):
        self.company_id = company_id
        self.last_seen: float = 0.0
        self.connected_since: Optional[float] = None
        self.agent_version: str = "1.0.0"
        self.hostname: str = "-"
        self.os_info: str = "Windows"
        self.local_horus_url: str = ""
        self.local_horus_ok: bool = False
        self.local_sql_ok: bool = False
        self.local_sql_database: str = ""
        self.service_mode: bool = False
        self.total_requests_served: int = 0
        self.last_latency_ms: float = 0.0
        self.pending_queue: deque[BridgeCommandRequest] = deque()
        self.wake_event: asyncio.Event = asyncio.Event()
        self.active_ws: Optional[WebSocket] = None
        self.recent_logs: deque[Dict[str, Any]] = deque(maxlen=60)

    def is_online(self) -> bool:
        return (time.time() - self.last_seen) < 45.0 or self.active_ws is not None


_AGENT_SESSIONS: Dict[int, AgentSessionState] = {}
_INFLIGHT_REQUESTS: Dict[str, BridgeCommandRequest] = {}
_RATE_LIMIT_BUCKETS: Dict[int, deque[float]] = {}


def _get_agent_session(company_id: int) -> AgentSessionState:
    st = _AGENT_SESSIONS.get(company_id)
    if not st:
        st = AgentSessionState(company_id)
        _AGENT_SESSIONS[company_id] = st
    return st


def _check_rate_limit(company_id: int, max_per_min: int) -> Tuple[bool, int]:
    now = time.time()
    limit = max(10, int(max_per_min or 120))
    bucket = _RATE_LIMIT_BUCKETS.get(company_id)
    if bucket is None:
        bucket = deque()
        _RATE_LIMIT_BUCKETS[company_id] = bucket
    while bucket and (now - bucket[0]) > 60.0:
        bucket.popleft()
    if len(bucket) >= limit:
        return False, 0
    bucket.append(now)
    return True, max(0, limit - len(bucket))


# ──────────────────────────────────────────────────────────────────────────────
# Licenciamento Criptográfico HMAC-SHA256 (HBRI1)
# ──────────────────────────────────────────────────────────────────────────────

def generate_horus_bridge_license_key(
    company_id: int,
    company_document: str,
    enabled: bool,
    expires_at_iso: str,
    allow_financial_sql: bool = True,
    rate_limit_per_min: int = 120,
) -> str:
    """
    Gera chave assinada no formato:
    HBRI1.<payload_base64url>.<assinatura_hmac_24chars>
    """
    payload_dict = {
        "v": 1,
        "cid": int(company_id),
        "doc": "".join(c for c in (company_document or "") if c.isdigit()),
        "en": 1 if enabled else 0,
        "exp": str(expires_at_iso or "")[:10],
        "fin": 1 if allow_financial_sql else 0,
        "rl": int(rate_limit_per_min or 120),
        "iat": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }
    raw_json = json.dumps(payload_dict, separators=(",", ":"), sort_keys=True).encode("utf-8")
    b64_payload = base64.urlsafe_b64encode(raw_json).decode("ascii").rstrip("=")
    sig = hmac.new(HORUS_BRIDGE_LICENSE_SECRET, b64_payload.encode("ascii"), hashlib.sha256).hexdigest()[:24].upper()
    return f"HBRI1.{b64_payload}.{sig}"


def verify_horus_bridge_license_key(license_key: str) -> Tuple[bool, str, Dict[str, Any]]:
    if not license_key or not isinstance(license_key, str) or not license_key.startswith("HBRI1."):
        return False, "Formato de chave de licença inválido.", {}
    parts = license_key.strip().split(".")
    if len(parts) != 3:
        return False, "Estrutura da chave de licença corrompida.", {}
    _, b64_payload, provided_sig = parts
    expected_sig = hmac.new(
        HORUS_BRIDGE_LICENSE_SECRET, b64_payload.encode("ascii"), hashlib.sha256
    ).hexdigest()[:24].upper()
    if not hmac.compare_digest(provided_sig.upper(), expected_sig):
        return False, "Assinatura criptográfica da licença inválida.", {}
    try:
        pad = "=" * ((4 - len(b64_payload) % 4) % 4)
        payload = json.loads(base64.urlsafe_b64decode(b64_payload + pad).decode("utf-8"))
    except Exception:
        return False, "Não foi possível decodificar os dados da licença.", {}

    if not payload.get("en"):
        return False, "Licença desativada pelo administrador Master.", payload

    exp_str = str(payload.get("exp") or "")[:10]
    if not exp_str:
        return False, "Licença sem data de validade configurada.", payload
    try:
        br_tz = timezone(timedelta(hours=-3))
        today_br = datetime.now(br_tz).date()
        exp_date = datetime.strptime(exp_str, "%Y-%m-%d").date()
        if exp_date < today_br:
            return False, f"Licença expirada em {exp_date.strftime('%d/%m/%Y')}.", payload
    except Exception:
        return False, "Data de validade inválida na licença.", payload

    return True, "Licença válida e ativa.", payload


def _build_bridge_config_response(
    company: company_models.Company,
    settings: Optional[settings_models.CompanySettings],
    request: Optional[Request] = None,
) -> Dict[str, Any]:
    br_tz = timezone(timedelta(hours=-3))
    today_br = datetime.now(br_tz).date()

    module_active = bool(getattr(company, "module_horus_api_bridge", False))
    enabled = bool(getattr(settings, "horus_bridge_enabled", False)) if settings else False
    exp_dt = getattr(settings, "horus_bridge_expires_at", None) if settings else None
    lic_key = getattr(settings, "horus_bridge_license_key", None) if settings else None
    api_user = getattr(settings, "horus_bridge_api_username", None) if settings else None
    api_pass = getattr(settings, "horus_bridge_api_password", None) if settings else None
    api_token = getattr(settings, "horus_bridge_api_token", None) if settings else None
    rate_limit = int(getattr(settings, "horus_bridge_rate_limit_per_min", 120) or 120) if settings else 120
    allow_fin_sql = bool(getattr(settings, "horus_bridge_allow_financial_sql", True)) if settings else True
    custom_gw = getattr(settings, "horus_bridge_custom_gateway_url", None) if settings else None

    days_remaining = None
    is_expired = True
    exp_iso = None
    exp_br = None

    if exp_dt is not None:
        exp_date = exp_dt.date() if hasattr(exp_dt, "date") else exp_dt
        exp_iso = exp_date.strftime("%Y-%m-%d")
        exp_br = exp_date.strftime("%d/%m/%Y")
        days_remaining = (exp_date - today_br).days
        is_expired = days_remaining < 0

    is_valid = bool(module_active and enabled and exp_dt is not None and not is_expired)

    if not module_active:
        status_label = "MÓDULO API HORUS PARALELA DESATIVADO NO MASTER"
    elif not enabled:
        status_label = "LICENÇA DO AGENTE .EXE BLOQUEADA PELO MASTER"
    elif exp_dt is None:
        status_label = "SEM DATA DE VALIDADE DEFINIDA PELO MASTER"
    elif is_expired:
        status_label = f"LICENÇA EXPIRADA EM {exp_br}"
    else:
        status_label = f"LICENÇA ATIVA ATÉ {exp_br} ({days_remaining} dia(s) restante(s))"

    # Determina a Base URL pública para a documentação e integrações
    base_host = (custom_gw or "").strip().rstrip("/")
    if not base_host and request is not None:
        scheme = request.headers.get("x-forwarded-proto") or request.url.scheme or "http"
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost:8000"
        base_host = f"{scheme}://{host}"
    if not base_host:
        base_host = "http://localhost:8000"

    agent_st = _get_agent_session(company.id)
    online = agent_st.is_online()
    last_seen_iso = (
        datetime.fromtimestamp(agent_st.last_seen, tz=br_tz).strftime("%d/%m/%Y %H:%M:%S")
        if agent_st.last_seen > 0
        else None
    )

    return {
        "company_id": company.id,
        "company_name": company.name,
        "company_document": company.document,
        "module_horus_api_bridge": module_active,
        "enabled": enabled,
        "expires_at": exp_iso,
        "expires_at_br": exp_br,
        "days_remaining": days_remaining,
        "is_expired": is_expired,
        "is_valid": is_valid,
        "status_label": status_label,
        "license_key": lic_key,
        "api_username": api_user,
        "api_password": api_pass,
        "api_token": api_token,
        "rate_limit_per_min": rate_limit,
        "allow_financial_sql": allow_fin_sql,
        "custom_gateway_url": custom_gw,
        "horus_legacy_pagination": bool(getattr(settings, "horus_legacy_pagination", False)) if settings else False,
        "sd_cod_empresa": getattr(settings, "horus_company", "1") if settings else "1",
        "sd_cod_filial": getattr(settings, "horus_branch", "1") if settings else "1",
        "sd_local_estoque": getattr(settings, "horus_stock_local", None) if settings else None,
        "public_horus_base_url": f"{base_host}/Horus/api/TServerB2B/",
        "public_seller_scoped_url": f"{base_host}/horus-api-bridge/public/{company.id}/Horus/api/TServerB2B/",
        "agent_status": {
            "online": online,
            "last_seen": last_seen_iso,
            "seconds_since_heartbeat": round(time.time() - agent_st.last_seen, 1) if agent_st.last_seen > 0 else None,
            "agent_version": agent_st.agent_version,
            "hostname": agent_st.hostname,
            "os_info": agent_st.os_info,
            "local_horus_url": agent_st.local_horus_url,
            "local_horus_ok": agent_st.local_horus_ok,
            "local_sql_ok": agent_st.local_sql_ok,
            "local_sql_database": agent_st.local_sql_database,
            "service_mode": agent_st.service_mode,
            "total_requests_served": agent_st.total_requests_served,
            "last_latency_ms": agent_st.last_latency_ms,
            "recent_logs": list(agent_st.recent_logs)[:25],
        },
    }


# ──────────────────────────────────────────────────────────────────────────────
# Schemas de Configuração e Autenticação do Agente
# ──────────────────────────────────────────────────────────────────────────────

class BridgeConfigUpdateRequest(BaseModel):
    module_horus_api_bridge: Optional[bool] = None
    enabled: bool = True
    expires_at: Optional[str] = None  # YYYY-MM-DD
    api_username: Optional[str] = None
    api_password: Optional[str] = None
    regenerate_token: bool = False
    rate_limit_per_min: int = 120
    allow_financial_sql: bool = True
    custom_gateway_url: Optional[str] = None


class AgentAuthRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    api_token: Optional[str] = None
    license_key: Optional[str] = None
    company_id: Optional[int] = None
    hostname: Optional[str] = None
    agent_version: Optional[str] = "1.0.0"
    service_mode: Optional[bool] = False


class AgentHeartbeatPayload(BaseModel):
    company_id: int
    license_key: str
    agent_version: Optional[str] = "1.0.0"
    hostname: Optional[str] = "-"
    os_info: Optional[str] = "Windows"
    local_horus_url: Optional[str] = ""
    local_horus_ok: Optional[bool] = False
    local_sql_ok: Optional[bool] = False
    local_sql_database: Optional[str] = ""
    service_mode: Optional[bool] = False
    wait_seconds: Optional[int] = 20


class AgentCommandResponsePayload(BaseModel):
    req_id: str
    company_id: int
    license_key: str
    status_code: int = 200
    is_gzip_base64: bool = False
    data: Any = None
    error_message: Optional[str] = None
    elapsed_ms: Optional[float] = 0.0


# ──────────────────────────────────────────────────────────────────────────────
# Endpoints de Gestão Master / Seller (Painel Cronuz B2B)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/horus-api-bridge/config")
def get_horus_bridge_config(
    request: Request,
    company_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    assert_company_ownership(current_user, company_id)
    company = db.query(company_models.Company).filter(company_models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    settings = db.query(settings_models.CompanySettings).filter(
        settings_models.CompanySettings.company_id == company_id
    ).first()
    if not settings:
        settings = settings_models.CompanySettings(company_id=company_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)

    return _build_bridge_config_response(company, settings, request)


@router.put("/horus-api-bridge/config")
def update_horus_bridge_config(
    payload: BridgeConfigUpdateRequest,
    request: Request,
    company_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    raw_type = getattr(current_user, "type", None) or getattr(current_user, "role", None)
    user_type = (getattr(raw_type, "value", None) or str(raw_type)).upper()
    if "MASTER" not in user_type:
        raise HTTPException(
            status_code=403,
            detail="Apenas usuários MASTER podem gerenciar a licença e credenciais da API Horus Paralela.",
        )

    company = db.query(company_models.Company).filter(company_models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    settings = db.query(settings_models.CompanySettings).filter(
        settings_models.CompanySettings.company_id == company_id
    ).first()
    if not settings:
        settings = settings_models.CompanySettings(company_id=company_id)
        db.add(settings)

    if payload.module_horus_api_bridge is not None:
        company.module_horus_api_bridge = bool(payload.module_horus_api_bridge)

    settings.horus_bridge_enabled = bool(payload.enabled)
    settings.horus_bridge_rate_limit_per_min = max(10, min(5000, int(payload.rate_limit_per_min or 120)))
    settings.horus_bridge_allow_financial_sql = bool(payload.allow_financial_sql)
    if payload.custom_gateway_url is not None:
        settings.horus_bridge_custom_gateway_url = payload.custom_gateway_url.strip() or None

    # Credenciais da API Pública para o Seller
    doc_digits = "".join(c for c in (company.document or "") if c.isdigit())
    default_username = f"horus_{company.id}_{doc_digits[:6] or 'b2b'}"
    if payload.api_username and payload.api_username.strip():
        settings.horus_bridge_api_username = payload.api_username.strip()
    elif not settings.horus_bridge_api_username:
        settings.horus_bridge_api_username = default_username

    if payload.api_password and payload.api_password.strip():
        settings.horus_bridge_api_password = payload.api_password.strip()
    elif not settings.horus_bridge_api_password:
        settings.horus_bridge_api_password = f"hb2b@{secrets.token_hex(4)}"

    if payload.regenerate_token or not settings.horus_bridge_api_token:
        settings.horus_bridge_api_token = f"hb2b_live_{company.id}_{secrets.token_urlsafe(24)}"

    exp_iso = ""
    if payload.expires_at and str(payload.expires_at).strip():
        raw_exp = str(payload.expires_at).strip()[:10]
        try:
            parsed_dt = datetime.strptime(raw_exp, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, tzinfo=timezone(timedelta(hours=-3))
            )
            settings.horus_bridge_expires_at = parsed_dt
            exp_iso = raw_exp
        except ValueError:
            raise HTTPException(status_code=400, detail="Data de validade inválida. Use YYYY-MM-DD.")
    elif settings.horus_bridge_expires_at:
        exp_iso = settings.horus_bridge_expires_at.strftime("%Y-%m-%d")
    else:
        # Padrão: +365 dias se estiver ativando sem data informada
        default_exp = datetime.now(timezone(timedelta(hours=-3))) + timedelta(days=365)
        settings.horus_bridge_expires_at = default_exp
        exp_iso = default_exp.strftime("%Y-%m-%d")

    settings.horus_bridge_license_key = generate_horus_bridge_license_key(
        company_id=company.id,
        company_document=company.document or "",
        enabled=bool(company.module_horus_api_bridge and settings.horus_bridge_enabled),
        expires_at_iso=exp_iso,
        allow_financial_sql=settings.horus_bridge_allow_financial_sql,
        rate_limit_per_min=settings.horus_bridge_rate_limit_per_min,
    )

    db.commit()
    db.refresh(company)
    db.refresh(settings)
    return _build_bridge_config_response(company, settings, request)


# ──────────────────────────────────────────────────────────────────────────────
# Endpoints de Comunicação com o Executável Windows (HorusAPIBridge.exe)
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/horus-api-bridge/agent/auth")
def authenticate_bridge_agent(
    payload: AgentAuthRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Autentica o HorusAPIBridge.exe usando:
    - E-mail e Senha do Seller/Master no Cronuz B2B, OU
    - API Token + Chave de Licença da empresa.
    Retorna as configurações completas da empresa, licença assinada atualizada e credenciais.
    """
    company: Optional[company_models.Company] = None
    settings: Optional[settings_models.CompanySettings] = None

    if payload.api_token and payload.api_token.strip():
        settings = db.query(settings_models.CompanySettings).filter(
            settings_models.CompanySettings.horus_bridge_api_token == payload.api_token.strip()
        ).first()
        if settings:
            company = db.query(company_models.Company).filter(
                company_models.Company.id == settings.company_id
            ).first()

    if not company and payload.email and payload.password:
        user = db.query(user_models.User).filter(
            user_models.User.email == payload.email.strip()
        ).first()
        if not user or not security.verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="E-mail ou senha inválidos no Cronuz B2B.")
        target_cid = payload.company_id or user.company_id
        if not target_cid:
            raise HTTPException(status_code=400, detail="Informe o ID da empresa para usuários Master.")
        company = db.query(company_models.Company).filter(company_models.Company.id == target_cid).first()
        if company:
            settings = db.query(settings_models.CompanySettings).filter(
                settings_models.CompanySettings.company_id == company.id
            ).first()

    if not company or not settings:
        raise HTTPException(status_code=401, detail="Credenciais ou Token da API Horus Paralela inválidos.")

    cfg = _build_bridge_config_response(company, settings, request)
    if not cfg["is_valid"]:
        raise HTTPException(status_code=403, detail=f"Acesso bloqueado: {cfg['status_label']}")

    st = _get_agent_session(company.id)
    st.last_seen = time.time()
    if not st.connected_since:
        st.connected_since = st.last_seen
    if payload.hostname:
        st.hostname = payload.hostname
    if payload.agent_version:
        st.agent_version = payload.agent_version
    st.service_mode = bool(payload.service_mode)

    return {
        "status": "authenticated",
        "message": f"Agente autenticado com sucesso para {company.name}.",
        "config": cfg,
    }


@router.post("/horus-api-bridge/agent/poll")
async def poll_bridge_commands(
    payload: AgentHeartbeatPayload,
    db: Session = Depends(get_db),
):
    """
    Long-Polling Assíncrono de Baixa Latência para o HorusAPIBridge.exe.
    - Valida a assinatura HMAC-SHA256 da licença sem sobrecarregar o banco.
    - Mantém a conexão aberta por até `wait_seconds` (padrão 20s) aguardando comandos na fila.
    - Assim que uma chamada chega na API Pública, o `wake_event` dispara em < 2ms e entrega o comando ao .exe!
    """
    ok, msg, lic_data = verify_horus_bridge_license_key(payload.license_key)
    if not ok or int(lic_data.get("cid", 0)) != int(payload.company_id):
        raise HTTPException(status_code=403, detail=f"Licença inválida no Agente: {msg}")

    # Atualiza status online do agente em memória
    st = _get_agent_session(payload.company_id)
    now = time.time()
    st.last_seen = now
    if not st.connected_since:
        st.connected_since = now
    st.agent_version = payload.agent_version or "1.0.0"
    st.hostname = payload.hostname or "-"
    st.os_info = payload.os_info or "Windows"
    st.local_horus_url = payload.local_horus_url or ""
    st.local_horus_ok = bool(payload.local_horus_ok)
    st.local_sql_ok = bool(payload.local_sql_ok)
    st.local_sql_database = payload.local_sql_database or ""
    st.service_mode = bool(payload.service_mode)

    wait_sec = max(1, min(30, int(payload.wait_seconds or 20)))

    # Se já houver comandos na fila, retorna imediatamente
    commands_out = []
    while st.pending_queue and len(commands_out) < 5:
        cmd = st.pending_queue.popleft()
        if (time.time() - cmd.created_at) < cmd.timeout:
            commands_out.append(cmd.to_agent_dict())

    if not commands_out:
        st.wake_event.clear()
        try:
            await asyncio.wait_for(st.wake_event.wait(), timeout=float(wait_sec))
        except asyncio.TimeoutError:
            pass
        st.last_seen = time.time()
        while st.pending_queue and len(commands_out) < 5:
            cmd = st.pending_queue.popleft()
            if (time.time() - cmd.created_at) < cmd.timeout:
                commands_out.append(cmd.to_agent_dict())

    return {
        "ok": True,
        "server_time": datetime.now(timezone.utc).isoformat(),
        "commands": commands_out,
    }


@router.post("/horus-api-bridge/agent/respond")
async def receive_bridge_command_response(payload: AgentCommandResponsePayload):
    """
    Recebe o resultado processado localmente pelo HorusAPIBridge.exe (com suporte a GZIP Base64)
    e acorda imediatamente a requisição HTTP externa que estava aguardando.
    """
    ok, msg, lic_data = verify_horus_bridge_license_key(payload.license_key)
    if not ok or int(lic_data.get("cid", 0)) != int(payload.company_id):
        raise HTTPException(status_code=403, detail=f"Licença inválida: {msg}")

    cmd = _INFLIGHT_REQUESTS.get(payload.req_id)
    st = _get_agent_session(payload.company_id)
    st.last_seen = time.time()
    st.total_requests_served += 1
    if payload.elapsed_ms:
        st.last_latency_ms = round(float(payload.elapsed_ms), 1)

    decoded_data = payload.data
    if payload.is_gzip_base64 and isinstance(payload.data, str):
        try:
            compressed_bytes = base64.b64decode(payload.data.encode("ascii"))
            raw_bytes = gzip.decompress(compressed_bytes)
            decoded_data = json.loads(raw_bytes.decode("utf-8"))
        except Exception as e:
            logger.error("[HorusBridge] Falha ao descomprimir payload GZIP req_id=%s: %s", payload.req_id, e)
            decoded_data = [{"Falha": True, "Mensagem": f"Erro ao descomprimir resposta do Agente: {e}"}]

    if cmd:
        cmd.response_status = payload.status_code
        cmd.response_data = decoded_data
        cmd.error_message = payload.error_message
        cmd.event.set()

    return {"ok": True}


# ──────────────────────────────────────────────────────────────────────────────
# Despacho de Comandos pelo Túnel Reverso
# ──────────────────────────────────────────────────────────────────────────────

async def dispatch_command_to_agent(
    company_id: int,
    target_type: str,
    method: str,
    endpoint: str,
    params: Dict[str, Any],
    body: Any = None,
    timeout: float = 55.0,
) -> Tuple[int, Any]:
    """
    Enfileira um comando para o HorusAPIBridge.exe daquele Seller e aguarda a resposta assincronamente.
    """
    st = _get_agent_session(company_id)
    if not st.is_online():
        return 503, [{
            "Falha": True,
            "Mensagem": (
                "O Agente Local HorusAPIBridge.exe desta empresa está OFFLINE no momento. "
                "Verifique se o executável ou serviço Windows está iniciado no servidor local."
            ),
        }]

    req_id = uuid.uuid4().hex
    cmd = BridgeCommandRequest(
        req_id=req_id,
        company_id=company_id,
        target_type=target_type,
        method=method,
        endpoint=endpoint,
        params=params,
        body=body,
        timeout=timeout,
    )
    _INFLIGHT_REQUESTS[req_id] = cmd
    st.pending_queue.append(cmd)
    st.wake_event.set()

    t0 = time.time()
    try:
        await asyncio.wait_for(cmd.event.wait(), timeout=timeout)
        elapsed_ms = round((time.time() - t0) * 1000, 1)
        st.recent_logs.appendleft({
            "timestamp": datetime.now(timezone(timedelta(hours=-3))).strftime("%H:%M:%S"),
            "method": method.upper(),
            "endpoint": endpoint,
            "target_type": target_type,
            "status_code": cmd.response_status,
            "elapsed_ms": elapsed_ms,
        })
        if cmd.error_message and cmd.response_data is None:
            return cmd.response_status or 502, [{"Falha": True, "Mensagem": cmd.error_message}]
        return cmd.response_status, cmd.response_data
    except asyncio.TimeoutError:
        elapsed_ms = round((time.time() - t0) * 1000, 1)
        st.recent_logs.appendleft({
            "timestamp": datetime.now(timezone(timedelta(hours=-3))).strftime("%H:%M:%S"),
            "method": method.upper(),
            "endpoint": endpoint,
            "target_type": target_type,
            "status_code": 504,
            "elapsed_ms": elapsed_ms,
        })
        return 504, [{
            "Falha": True,
            "Mensagem": f"Timeout ({int(timeout)}s) aguardando resposta do HorusAPIBridge.exe para [{endpoint}].",
        }]
    finally:
        _INFLIGHT_REQUESTS.pop(req_id, None)


# ──────────────────────────────────────────────────────────────────────────────
# Resolução de Autenticação da API Pública (Basic Auth + Bearer Token + X-API-Key)
# ──────────────────────────────────────────────────────────────────────────────

def _resolve_public_api_company(
    request: Request,
    db: Session,
    explicit_company_id: Optional[int] = None,
) -> Tuple[company_models.Company, settings_models.CompanySettings]:
    auth_header = (request.headers.get("Authorization") or "").strip()
    api_key_header = (request.headers.get("X-API-Key") or request.query_params.get("api_key") or "").strip()

    settings: Optional[settings_models.CompanySettings] = None

    # 1. X-API-Key ou query param api_key
    if api_key_header:
        q = db.query(settings_models.CompanySettings).filter(
            settings_models.CompanySettings.horus_bridge_api_token == api_key_header
        )
        if explicit_company_id:
            q = q.filter(settings_models.CompanySettings.company_id == explicit_company_id)
        settings = q.first()

    # 2. Authorization: Bearer <token>
    elif auth_header.lower().startswith("bearer "):
        token_val = auth_header[7:].strip()
        q = db.query(settings_models.CompanySettings).filter(
            settings_models.CompanySettings.horus_bridge_api_token == token_val
        )
        if explicit_company_id:
            q = q.filter(settings_models.CompanySettings.company_id == explicit_company_id)
        settings = q.first()

    # 3. Authorization: Basic base64(usuario:senha) — 100% compatível com o padrão Horus!
    elif auth_header.lower().startswith("basic "):
        b64_part = auth_header[6:].strip()
        try:
            decoded = base64.b64decode(b64_part).decode("utf-8", errors="ignore")
            if ":" in decoded:
                username, password = decoded.split(":", 1)
                q = db.query(settings_models.CompanySettings).filter(
                    settings_models.CompanySettings.horus_bridge_api_username == username.strip(),
                    settings_models.CompanySettings.horus_bridge_api_password == password.strip(),
                )
                if explicit_company_id:
                    q = q.filter(settings_models.CompanySettings.company_id == explicit_company_id)
                settings = q.first()
        except Exception:
            pass

    if not settings:
        raise HTTPException(
            status_code=401,
            detail=[{
                "Falha": True,
                "Mensagem": "Não autorizado. Envie Authorization: Basic (usuário/senha da API) ou Bearer Token / X-API-Key válido.",
            }],
            headers={"WWW-Authenticate": 'Basic realm="Horus B2B API Gateway"'},
        )

    company = db.query(company_models.Company).filter(
        company_models.Company.id == settings.company_id
    ).first()
    if not company or not company.active:
        raise HTTPException(
            status_code=403,
            detail=[{"Falha": True, "Mensagem": "Empresa inativa ou não encontrada."}],
        )

    # Verifica licença e módulo
    if not getattr(company, "module_horus_api_bridge", False) or not getattr(settings, "horus_bridge_enabled", False):
        raise HTTPException(
            status_code=403,
            detail=[{"Falha": True, "Mensagem": "Módulo API Horus Paralela desativado para esta empresa."}],
        )

    ok_lic, msg_lic, _ = verify_horus_bridge_license_key(settings.horus_bridge_license_key or "")
    if not ok_lic:
        raise HTTPException(
            status_code=403,
            detail=[{"Falha": True, "Mensagem": f"Licença da API Horus Paralela bloqueada/expirada: {msg_lic}"}],
        )

    # Verifica Rate Limiting por Seller
    allowed, remaining = _check_rate_limit(company.id, settings.horus_bridge_rate_limit_per_min or 120)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=[{
                "Falha": True,
                "Mensagem": f"Limite de requisições excedido ({settings.horus_bridge_rate_limit_per_min} req/min). Tente novamente em instantes.",
            }],
        )

    return company, settings


# ──────────────────────────────────────────────────────────────────────────────
# Endpoints Complementares Financeiros e SQL Seguro (Executados pelo .EXE)
# ──────────────────────────────────────────────────────────────────────────────

COMPLEMENTARY_SQL_ENDPOINTS = {
    "busca_titulosfinanceiros": "Busca_TitulosFinanceiros",
    "busca_resumofinanceirocliente": "Busca_ResumoFinanceiroCliente",
    "busca_pedidosdbm": "Busca_PedidosDBM",
    "busca_notasfiscaissql": "Busca_NotasFiscaisSQL",
    "status_conexaolocal": "Status_ConexaoLocal",
}


async def _handle_public_tserverb2b_request(
    request: Request,
    endpoint_name: str,
    db: Session,
    explicit_company_id: Optional[int] = None,
) -> JSONResponse:
    company, settings = _resolve_public_api_company(request, db, explicit_company_id=explicit_company_id)

    # Extrai query parameters
    query_params: Dict[str, Any] = dict(request.query_params)
    query_params.pop("api_key", None)

    # Regra Mandatória de Arquitetura: Respeito a horus_legacy_pagination (OFFSET / LIMIT)
    is_legacy_pagination = bool(getattr(settings, "horus_legacy_pagination", False))
    if is_legacy_pagination:
        query_params.pop("OFFSET", None)
        query_params.pop("offset", None)
        query_params.pop("LIMIT", None)
        query_params.pop("limit", None)
    else:
        # Se não enviou OFFSET/LIMIT em endpoints de consulta de lote, aplica limite seguro padrão
        has_offset = "OFFSET" in query_params or "offset" in query_params
        has_limit = "LIMIT" in query_params or "limit" in query_params
        ep_lower = endpoint_name.strip().lower()
        if ep_lower.startswith("busca_") or ep_lower in ("estoque", "autores_item", "arvore_generos", "bi_vendas"):
            if not has_offset:
                query_params["OFFSET"] = 0
            if not has_limit:
                query_params["LIMIT"] = 100
            else:
                # Trava teto máximo por página em 5.000 registros para proteger memória
                raw_lim = query_params.get("LIMIT") or query_params.get("limit") or 100
                try:
                    if int(raw_lim) > 5000:
                        query_params["LIMIT"] = 5000
                except ValueError:
                    pass

    # Regra Mandatória de Arquitetura: Parâmetros SD_* em Busca_AcervoB2B
    if endpoint_name.strip().lower() == "busca_acervob2b":
        if "SD_COD_EMPRESA" not in query_params and getattr(settings, "horus_company", None):
            query_params["SD_COD_EMPRESA"] = settings.horus_company
        if "SD_COD_FILIAL" not in query_params and getattr(settings, "horus_branch", None):
            query_params["SD_COD_FILIAL"] = settings.horus_branch
        if "SD_LOCAL_ESTOQUE" not in query_params and getattr(settings, "horus_stock_local", None):
            query_params["SD_LOCAL_ESTOQUE"] = settings.horus_stock_local

    # Extrai body JSON se houver
    body_data = None
    if request.method in ("POST", "PUT", "DELETE"):
        try:
            raw_bytes = await request.body()
            if raw_bytes:
                body_data = json.loads(raw_bytes.decode("utf-8"))
        except Exception:
            body_data = None

    ep_clean = endpoint_name.strip().strip("/")
    ep_key = ep_clean.lower()

    # Verifica se é um Endpoint Complementar Financeiro/SQL ou Endpoint Nativo Horus TServerB2B
    if ep_key in COMPLEMENTARY_SQL_ENDPOINTS:
        if not getattr(settings, "horus_bridge_allow_financial_sql", True):
            return JSONResponse(
                status_code=403,
                content=[{
                    "Falha": True,
                    "Mensagem": "Os endpoints complementares Financeiros/SQL estão desabilitados para esta empresa.",
                }],
            )
        target_type = "HORUS_SQL_COMPLEMENT"
        canonical_ep = COMPLEMENTARY_SQL_ENDPOINTS[ep_key]
    else:
        target_type = "HORUS_HTTP"
        canonical_ep = ep_clean

    status_code, resp_data = await dispatch_command_to_agent(
        company_id=company.id,
        target_type=target_type,
        method=request.method,
        endpoint=canonical_ep,
        params=query_params,
        body=body_data,
    )

    return JSONResponse(
        status_code=status_code,
        content=resp_data,
        headers={
            "X-Horus-Bridge-Company": str(company.id),
            "X-Horus-Bridge-Target": target_type,
        },
    )


# 1. Rota Padrão Horus (Idêntica à URL nativa do Horus: /Horus/api/TServerB2B/<Endpoint>)
@router.api_route(
    "/Horus/api/TServerB2B/{endpoint_name:path}",
    methods=["GET", "POST", "PUT", "DELETE"],
)
@router.api_route(
    "/Horus/api/TserverB2B/{endpoint_name:path}",
    methods=["GET", "POST", "PUT", "DELETE"],
    include_in_schema=False,
)
async def public_horus_tserverb2b_direct(
    endpoint_name: str,
    request: Request,
    db: Session = Depends(get_db),
):
    return await _handle_public_tserverb2b_request(request, endpoint_name, db, explicit_company_id=None)


# 2. Rota Escopada por Seller (/horus-api-bridge/public/{company_id}/Horus/api/TServerB2B/<Endpoint>)
@router.api_route(
    "/horus-api-bridge/public/{company_id}/Horus/api/TServerB2B/{endpoint_name:path}",
    methods=["GET", "POST", "PUT", "DELETE"],
)
async def public_horus_tserverb2b_scoped(
    company_id: int,
    endpoint_name: str,
    request: Request,
    db: Session = Depends(get_db),
):
    return await _handle_public_tserverb2b_request(request, endpoint_name, db, explicit_company_id=company_id)


# ──────────────────────────────────────────────────────────────────────────────
# Catálogo Completo da Documentação Interativa da API Horus + Complementar
# ──────────────────────────────────────────────────────────────────────────────

HORUS_API_DOCUMENTATION_CATALOG = [
    {
        "category": "Diagnóstico & Conexão",
        "badge": "Sistema",
        "description": "Endpoints para teste rápido de conectividade da API Horus e diagnóstico local do Agente Bridge (.exe).",
        "endpoints": [
            {
                "name": "Teste de Conexão API Horus (T1)",
                "method": "GET",
                "path": "Teste1",
                "type": "HORUS_HTTP",
                "summary": "Verifica se o serviço webservice Horus S.I.G.A está ativo e respondendo.",
                "query_params": [],
                "response_example": [{"ATIVA": "S", "VERSAO": "01.128"}],
            },
            {
                "name": "Diagnóstico Completo do Agente Local (API + SQL)",
                "method": "GET",
                "path": "Status_ConexaoLocal",
                "type": "HORUS_SQL_COMPLEMENT",
                "summary": "Retorna o diagnóstico em tempo real do servidor local do cliente (API 8060 + SQL Server 1433).",
                "query_params": [],
                "response_example": [{
                    "Falha": False,
                    "HORUS_HTTP_OK": True,
                    "HORUS_SQL_OK": True,
                    "BANCO_SQL": "HORUS_SIGA",
                    "HOSTNAME": "OPEN-SERVER",
                }],
            },
        ],
    },
    {
        "category": "Produtos, Acervo, Preços & Estoque",
        "badge": "Oficial Horus",
        "description": "Consultas completas de catálogo, obras, kits, autores, estoque, árvore de gêneros e características.",
        "endpoints": [
            {
                "name": "Consultar Produtos / Acervo Geral",
                "method": "GET",
                "path": "Busca_Acervo",
                "type": "HORUS_HTTP",
                "summary": "Pesquisa produtos no acervo Horus com suporte a sub-consultas (autores, estoque, preço, gêneros) e paginação OFFSET/LIMIT.",
                "query_params": [
                    {"name": "COD_ITEM", "type": "int", "desc": "Código interno do item no Horus"},
                    {"name": "BARRAS_ISBN", "type": "string", "desc": "Código de barras EAN13 / ISBN"},
                    {"name": "NOM_ITEM", "type": "string", "desc": "Título ou parte do nome do produto"},
                    {"name": "DATA_INI", "type": "string", "desc": "Data inicial de atualização (DD/MM/YYYY HH:MM:SS)"},
                    {"name": "DATA_FIM", "type": "string", "desc": "Data final de atualização (DD/MM/YYYY HH:MM:SS)"},
                    {"name": "SUB_AUTORES", "type": "string", "desc": "S ou N — embute lista de autores no retorno"},
                    {"name": "SUB_ESTOQUE", "type": "string", "desc": "S ou N — embute saldo de estoque no retorno"},
                    {"name": "OFFSET", "type": "int", "desc": "Deslocamento inicial da paginação (ex: 0)"},
                    {"name": "LIMIT", "type": "int", "desc": "Quantidade máxima de registros (ex: 50)"},
                ],
                "response_example": [{
                    "COD_ITEM": 736198,
                    "NOM_ITEM": "O PEQUENO PRINCIPE",
                    "COD_BARRA_ITEM": "9788522005239",
                    "VLR_CAPA": 39.90,
                    "SITUACAO_ITEM": "A",
                }],
            },
            {
                "name": "Consultar Acervo B2B (Saldo Disponível & Desconto Cliente)",
                "method": "GET",
                "path": "Busca_AcervoB2B",
                "type": "HORUS_HTTP",
                "summary": "Consulta especializada para operações B2B/Catálogo com cálculo de SALDO_DISPONIVEL (SD_*) e política comercial do cliente (ID_DOC / ID_GUID).",
                "query_params": [
                    {"name": "ID_DOC", "type": "string", "desc": "CNPJ/CPF do cliente ou da empresa"},
                    {"name": "ID_GUID", "type": "string", "desc": "GUID de identificação B2B configurado no Horus"},
                    {"name": "TERM", "type": "string", "desc": "Termo de busca (ISBN, Título, Autor ou Editora)"},
                    {"name": "SD_COD_EMPRESA", "type": "int", "desc": "Empresa para cálculo do SALDO_DISPONIVEL"},
                    {"name": "SD_COD_FILIAL", "type": "int", "desc": "Filial para cálculo do SALDO_DISPONIVEL"},
                    {"name": "SD_LOCAL_ESTOQUE", "type": "int", "desc": "Local de estoque para cálculo do SALDO_DISPONIVEL"},
                    {"name": "OFFSET", "type": "int", "desc": "Deslocamento da paginação"},
                    {"name": "LIMIT", "type": "int", "desc": "Limite de registros"},
                ],
                "response_example": [{
                    "COD_ITEM": 1024,
                    "NOM_ITEM": "DOM CASMURRO",
                    "COD_BARRA_ITEM": "9788535914849",
                    "VLR_CAPA": 49.90,
                    "VLR_LIQUIDO": 29.94,
                    "PERC_DESCONTO": 40.0,
                    "SALDO_DISPONIVEL": 85,
                }],
            },
            {
                "name": "Consultar Estoque por Filial / Local",
                "method": "GET",
                "path": "Estoque",
                "type": "HORUS_HTTP",
                "summary": "Retorna o saldo físico, reservado, consignado e disponível por item, empresa, filial e local de estoque.",
                "query_params": [
                    {"name": "COD_EMPRESA", "type": "int", "desc": "Código da empresa"},
                    {"name": "COD_FILIAL", "type": "int", "desc": "Código da filial"},
                    {"name": "COD_LOCAL_ESTOQUE", "type": "int", "desc": "Código do local de estoque"},
                    {"name": "COD_ITEM", "type": "int", "desc": "Código do produto"},
                    {"name": "DATA_INI", "type": "string", "desc": "Filtro de movimentação inicial (DD/MM/YYYY HH:MM:SS)"},
                    {"name": "DATA_FIM", "type": "string", "desc": "Filtro de movimentação final (DD/MM/YYYY HH:MM:SS)"},
                    {"name": "OFFSET", "type": "int", "desc": "Offset de paginação"},
                    {"name": "LIMIT", "type": "int", "desc": "Limite de registros"},
                ],
                "response_example": [{
                    "COD_EMPRESA": 1,
                    "COD_FILIAL": 1,
                    "COD_ITEM": 1024,
                    "SALDO_FISICO": 100,
                    "SALDO_RESERVADO": 15,
                    "SALDO_DISPONIVEL": 85,
                }],
            },
            {
                "name": "Consultar Preços de Itens",
                "method": "GET",
                "path": "Busca_preco_item",
                "type": "HORUS_HTTP",
                "summary": "Consulta tabelas de preços e atualizações de preço por período.",
                "query_params": [
                    {"name": "COD_ITEM", "type": "int", "desc": "Código do item"},
                    {"name": "DATA_INI", "type": "string", "desc": "Início do período"},
                    {"name": "DATA_FIM", "type": "string", "desc": "Fim do período"},
                    {"name": "OFFSET", "type": "int", "desc": "Offset"},
                    {"name": "LIMIT", "type": "int", "desc": "Limit"},
                ],
                "response_example": [{"COD_ITEM": 1024, "VLR_PRECO": 49.90}],
            },
            {
                "name": "Consultar Composição de Kits",
                "method": "GET",
                "path": "Busca_Acervo_kit",
                "type": "HORUS_HTTP",
                "summary": "Lista os itens filhos que compõem um Kit/Box editorial.",
                "query_params": [
                    {"name": "COD_ITEM", "type": "int", "desc": "Código do item Kit"},
                    {"name": "OFFSET", "type": "int", "desc": "Offset"},
                    {"name": "LIMIT", "type": "int", "desc": "Limit"},
                ],
                "response_example": [{"COD_ITEM_KIT": 736198, "COD_ITEM_COMPONENTE": 70010, "QTD_ITEM": 1}],
            },
            {
                "name": "Consultar Autores",
                "method": "GET",
                "path": "Autores_item",
                "type": "HORUS_HTTP",
                "summary": "Consulta autores vinculados aos itens do acervo.",
                "query_params": [
                    {"name": "COD_ITEM", "type": "int", "desc": "Código do item"},
                    {"name": "COD_AUTOR", "type": "int", "desc": "Código do autor"},
                ],
                "response_example": [{"COD_AUTOR": 15, "NOM_AUTOR": "ANTOINE DE SAINT-EXUPERY"}],
            },
            {
                "name": "Consultar Árvore de Gêneros (3 Níveis)",
                "method": "GET",
                "path": "Arvore_generos",
                "type": "HORUS_HTTP",
                "summary": "Retorna a árvore mercadológica de gêneros/categorias associadas aos produtos.",
                "query_params": [
                    {"name": "OFFSET", "type": "int", "desc": "Offset"},
                    {"name": "LIMIT", "type": "int", "desc": "Limit"},
                ],
                "response_example": [{"COD_GENERO": 1, "DESC_GENERO": "LITERATURA ESTRANGEIRA"}],
            },
            {
                "name": "Consultar Prazo de Entrega, Preço Promocional & Características",
                "method": "GET",
                "path": "Busca_Caracteristicas",
                "type": "HORUS_HTTP",
                "summary": "Demais endpoints de catálogo: Busca_Caracteristicas, Busca_prazo_entrega e Busca_Preco_promocional.",
                "query_params": [
                    {"name": "COD_TPO_CARACT", "type": "int", "desc": "Tipo da característica"},
                    {"name": "COD_CARACT", "type": "int", "desc": "Código da característica"},
                ],
                "response_example": [{"COD_TPO_CARACT": 1, "COD_CARACT": 1, "DESC_CARACT": "DESTAQUE"}],
            },
        ],
    },
    {
        "category": "Clientes, Endereços & Contratos",
        "badge": "Oficial Horus",
        "description": "Consulta, cadastro e manutenção de clientes, tipos de clientes, endereços e contratos.",
        "endpoints": [
            {
                "name": "Consultar Clientes",
                "method": "GET",
                "path": "Busca_Cliente",
                "type": "HORUS_HTTP",
                "summary": "Pesquisa clientes por código (`COD_CLI`), CPF/CNPJ (`CPF_CGC`), nome ou período de atualização.",
                "query_params": [
                    {"name": "COD_CLI", "type": "int", "desc": "Código do cliente no Horus"},
                    {"name": "CPF_CGC", "type": "string", "desc": "CPF ou CNPJ (somente números)"},
                    {"name": "NOM_CLI", "type": "string", "desc": "Nome / Razão Social"},
                    {"name": "OFFSET", "type": "int", "desc": "Offset"},
                    {"name": "LIMIT", "type": "int", "desc": "Limit"},
                ],
                "response_example": [{
                    "COD_CLI": 200596143,
                    "NOM_CLI": "LIVRARIA EXEMPLO LTDA",
                    "CPF_CGC": "12345678000199",
                    "STA_CLI": "A",
                }],
            },
            {
                "name": "Inclusão ou Manutenção de Clientes",
                "method": "POST",
                "path": "InsAltCliente",
                "type": "HORUS_HTTP",
                "summary": "Cadastra ou atualiza os dados cadastrais de um cliente no Horus (aceita GET, POST ou PUT).",
                "query_params": [],
                "response_example": [{"Falha": False, "COD_CLI": 200596143, "Mensagem": "Cliente gravado com sucesso"}],
            },
            {
                "name": "Consultar / Cadastrar Endereços do Cliente",
                "method": "GET",
                "path": "Busca_EndCliente",
                "type": "HORUS_HTTP",
                "summary": "Consulta endereços (`Busca_EndCliente`), tipos (`Busca_TipoEndCliente`) ou insere/atualiza (`InsAltEndCliente`).",
                "query_params": [
                    {"name": "COD_CLI", "type": "int", "desc": "Código do cliente"},
                ],
                "response_example": [{"COD_CLI": 200596143, "NOM_LOGRADOURO": "AV PAULISTA", "NUM_END": "1000", "SIG_UF": "SP"}],
            },
            {
                "name": "Consultar Totalizador de Contrato do Cliente",
                "method": "GET",
                "path": "Busca_Contrato_Cliente_Sintetico",
                "type": "HORUS_HTTP",
                "summary": "Retorna informações sintéticas de contrato comercial do cliente.",
                "query_params": [
                    {"name": "COD_EMPRESA", "type": "int", "desc": "Empresa"},
                    {"name": "COD_FILIAL", "type": "int", "desc": "Filial"},
                    {"name": "COD_CLI", "type": "int", "desc": "Código do cliente"},
                ],
                "response_example": [{"COD_CLI": 200663677, "PERC_DESC_PADRAO": 45.0}],
            },
        ],
    },
    {
        "category": "Pedidos de Venda, Faturamento & Expedição",
        "badge": "Oficial Horus",
        "description": "Ciclo completo de pedidos no Horus: consulta, implantação de cabeçalho e itens, vencimentos, nota fiscal, rastreio e conferência.",
        "endpoints": [
            {
                "name": "Consultar Pedidos de Venda",
                "method": "GET",
                "path": "Busca_PedidosVenda",
                "type": "HORUS_HTTP",
                "summary": "Pesquisa pedidos de venda por cliente, pedido origem (`COD_PEDIDO_ORIGEM`), número do pedido (`COD_PED_VENDA`) ou período.",
                "query_params": [
                    {"name": "COD_EMPRESA", "type": "int", "desc": "Código da empresa"},
                    {"name": "COD_FILIAL", "type": "int", "desc": "Código da filial"},
                    {"name": "COD_CLI", "type": "int", "desc": "Código do cliente"},
                    {"name": "COD_PED_VENDA", "type": "int", "desc": "Número do pedido no Horus"},
                    {"name": "COD_PEDIDO_ORIGEM", "type": "string", "desc": "Código do pedido externo / B2B"},
                    {"name": "OFFSET", "type": "int", "desc": "Offset"},
                    {"name": "LIMIT", "type": "int", "desc": "Limit"},
                ],
                "response_example": [{
                    "COD_EMPRESA": 1,
                    "COD_FILIAL": 1,
                    "COD_PED_VENDA": 671636,
                    "COD_PEDIDO_ORIGEM": "500081",
                    "STATUS_PEDIDO_VENDA": "L",
                    "VLR_LIQ_PEDIDO": 1450.00,
                }],
            },
            {
                "name": "Consultar Itens do Pedido de Venda",
                "method": "GET",
                "path": "Busca_ItensPedidosVenda",
                "type": "HORUS_HTTP",
                "summary": "Retorna todos os itens de um pedido de venda específico.",
                "query_params": [
                    {"name": "COD_EMPRESA", "type": "int", "desc": "Empresa"},
                    {"name": "COD_FILIAL", "type": "int", "desc": "Filial"},
                    {"name": "COD_PED_VENDA", "type": "int", "desc": "Número do pedido"},
                ],
                "response_example": [{"COD_PED_VENDA": 671636, "COD_ITEM": 1024, "QTD_PEDIDA": 10, "VLR_LIQ_ITEM": 29.94}],
            },
            {
                "name": "Implantar Cabeçalho e Itens de Pedido",
                "method": "POST",
                "path": "InsPedidoVenda",
                "type": "HORUS_HTTP",
                "summary": "Cria o cabeçalho do pedido (`InsPedidoVenda`), insere os itens (`InsItensPedidoVenda`), vencimentos (`InsVencPedidoVenda`) e altera status (`AltStatus_Pedido`).",
                "query_params": [],
                "response_example": [{"Falha": False, "COD_PED_VENDA": 671637}],
            },
            {
                "name": "Consultar Nota Fiscal e Rastreio do Pedido",
                "method": "GET",
                "path": "Busca_NotaFiscal",
                "type": "HORUS_HTTP",
                "summary": "Retorna dados da NF-e emitida (`Busca_NotaFiscal`) e código de rastreamento logístico (`Busca_RastreioPedido`).",
                "query_params": [
                    {"name": "COD_EMPRESA", "type": "int", "desc": "Empresa"},
                    {"name": "COD_FILIAL", "type": "int", "desc": "Filial"},
                    {"name": "COD_CLI", "type": "int", "desc": "Cliente"},
                    {"name": "COD_PED_VENDA", "type": "int", "desc": "Pedido no Horus"},
                ],
                "response_example": [{"NUM_NOTA_FISCAL": 45890, "CHAVE_ACESSO_NFE": "352610..."}],
            },
            {
                "name": "Formas de Pagamento, Método de Venda, Transportadoras, Minuta & BI",
                "method": "GET",
                "path": "Busca_FormaPagto",
                "type": "HORUS_HTTP",
                "summary": "Inclui `Busca_FormaPagto`, `Busca_MetodoVenda`, `Busca_Transportadora`, `Pular_expedicao`, `ConfereItem_Pedido`, `InsVolume_Pedido`, `Busca_MinutaDespacho`, `bi_vendas_parametros` e `bi_vendas`.",
                "query_params": [
                    {"name": "OFFSET", "type": "int", "desc": "Offset"},
                    {"name": "LIMIT", "type": "int", "desc": "Limit"},
                ],
                "response_example": [{"COD_FORMA": 1, "DESC_FORMA": "BOLETO BANCARIO 30 DIAS"}],
            },
        ],
    },
    {
        "category": "Financeiro & Operacional Complementar (SQL Seguro via Agente .EXE)",
        "badge": "Exclusivo Cronuz Bridge",
        "description": "Endpoints REST de alta segurança que consultam o banco SQL Server local através do HorusAPIBridge.exe, sem necessidade de expor a porta 1433 na internet.",
        "endpoints": [
            {
                "name": "Consultar Títulos Financeiros (Contas a Receber / LANCTOS_CRECEBER)",
                "method": "GET",
                "path": "Busca_TitulosFinanceiros",
                "type": "HORUS_SQL_COMPLEMENT",
                "summary": "Lista títulos financeiros do Horus (`LANCTOS_CRECEBER`) filtrados por cliente, CPF/CNPJ, status (`AB` aberto, `BX` baixado), vencimento ou nota fiscal.",
                "query_params": [
                    {"name": "COD_EMPRESA", "type": "int", "desc": "Código da empresa (padrão: 1)"},
                    {"name": "COD_FILIAL", "type": "int", "desc": "Código da filial (padrão: 1)"},
                    {"name": "COD_CLI", "type": "int", "desc": "Código do cliente no Horus"},
                    {"name": "CPF_CGC", "type": "string", "desc": "CPF ou CNPJ do cliente"},
                    {"name": "STA_LANCTO", "type": "string", "desc": "Status do título: AB (Aberto), BX (Baixado), CA (Cancelado) ou TODOS"},
                    {"name": "DATA_VENC_INI", "type": "string", "desc": "Vencimento inicial (YYYY-MM-DD)"},
                    {"name": "DATA_VENC_FIM", "type": "string", "desc": "Vencimento final (YYYY-MM-DD)"},
                    {"name": "NUM_DOCUMENTO", "type": "string", "desc": "Número do documento / Nota Fiscal / Pedido"},
                    {"name": "OFFSET", "type": "int", "desc": "Deslocamento de paginação (padrão: 0)"},
                    {"name": "LIMIT", "type": "int", "desc": "Limite de registros (padrão: 100, máx: 1000)"},
                ],
                "response_example": [{
                    "COD_EMPRESA": 1,
                    "COD_FILIAL": 1,
                    "SEQ_LANCTO_CRECEBER": 984512,
                    "COD_CLI": 200596143,
                    "NOM_CLI": "LIVRARIA EXEMPLO LTDA",
                    "CPF_CGC": "12345678000199",
                    "NUM_DOCUMENTO": "00045890/01",
                    "STA_LANCTO_CRECEBER": "AB",
                    "DAT_EMISSAO": "2026-10-01",
                    "DAT_VENCIMENTO": "2026-11-01",
                    "VLR_ORIGINAL": 1250.50,
                    "VLR_ABERTO": 1250.50,
                    "COD_FORMA": "BOL",
                    "LINHA_DIGITAVEL": "34191.79001 01043.510047...",
                }],
            },
            {
                "name": "Consultar Resumo Financeiro e Inadimplência do Cliente",
                "method": "GET",
                "path": "Busca_ResumoFinanceiroCliente",
                "type": "HORUS_SQL_COMPLEMENT",
                "summary": "Retorna os totalizadores financeiros de um cliente direto do SQL Server local: total em aberto, total vencido (inadimplente), total a vencer e quantidade de títulos.",
                "query_params": [
                    {"name": "COD_EMPRESA", "type": "int", "desc": "Código da empresa"},
                    {"name": "COD_FILIAL", "type": "int", "desc": "Código da filial"},
                    {"name": "COD_CLI", "type": "int", "desc": "Código do cliente no Horus"},
                    {"name": "CPF_CGC", "type": "string", "desc": "CPF ou CNPJ do cliente"},
                ],
                "response_example": [{
                    "COD_CLI": 200596143,
                    "QTD_TITULOS_ABERTOS": 4,
                    "VLR_TOTAL_ABERTO": 4890.00,
                    "QTD_TITULOS_VENCIDOS": 1,
                    "VLR_TOTAL_VENCIDO": 950.00,
                    "QTD_TITULOS_A_VENCER": 3,
                    "VLR_TOTAL_A_VENCER": 3940.00,
                    "POSSUI_RESTRICAO_VENCIDOS": True,
                }],
            },
            {
                "name": "Consultar Pedidos Detalhados via SQL (DBM / Horus Direct)",
                "method": "GET",
                "path": "Busca_PedidosDBM",
                "type": "HORUS_SQL_COMPLEMENT",
                "summary": "Consulta rápida de pedidos (`PEDIDOS_VENDA`) com status operacional, pedido origem web e vínculo de nota fiscal sem sobrecarga da API legada.",
                "query_params": [
                    {"name": "COD_EMPRESA", "type": "int", "desc": "Empresa"},
                    {"name": "COD_FILIAL", "type": "int", "desc": "Filial"},
                    {"name": "COD_CLI", "type": "int", "desc": "Código do cliente"},
                    {"name": "COD_PEDIDO_ORIGEM", "type": "string", "desc": "Código do pedido web/origem"},
                    {"name": "COD_PED_VENDA", "type": "int", "desc": "Número do pedido no Horus"},
                    {"name": "OFFSET", "type": "int", "desc": "Offset"},
                    {"name": "LIMIT", "type": "int", "desc": "Limit"},
                ],
                "response_example": [{
                    "COD_EMPRESA": 1,
                    "COD_FILIAL": 1,
                    "COD_PED_VENDA": 671636,
                    "COD_PEDIDO_ORIGEM": "500081",
                    "COD_CLI": 200596143,
                    "STA_PEDIDO_VENDA": "F",
                    "DAT_PEDIDO": "2026-10-30",
                    "VLR_LIQ_PEDIDO": 1450.00,
                }],
            },
            {
                "name": "Consultar Notas Fiscais (`NF_MESTRE`) via SQL",
                "method": "GET",
                "path": "Busca_NotasFiscaisSQL",
                "type": "HORUS_SQL_COMPLEMENT",
                "summary": "Retorna cabeçalho de notas fiscais de saída, chave de acesso NF-e, série, valor total e status Sefaz.",
                "query_params": [
                    {"name": "COD_EMPRESA", "type": "int", "desc": "Empresa"},
                    {"name": "COD_FILIAL", "type": "int", "desc": "Filial"},
                    {"name": "COD_CLI", "type": "int", "desc": "Código do cliente"},
                    {"name": "NUM_NOTA", "type": "int", "desc": "Número da Nota Fiscal"},
                    {"name": "OFFSET", "type": "int", "desc": "Offset"},
                    {"name": "LIMIT", "type": "int", "desc": "Limit"},
                ],
                "response_example": [{
                    "COD_EMPRESA": 1,
                    "COD_FILIAL": 1,
                    "NUM_NOTA_FISCAL": 45890,
                    "SERIE_FISCAL": "1",
                    "COD_CLI": 200596143,
                    "DAT_EMISSAO": "2026-10-30",
                    "VLR_TOTAL_NOTA": 1450.00,
                    "CHAVE_ACESSO_NFE": "35261012345678000199550010000458901000458900",
                }],
            },
        ],
    },
]


@router.get("/horus-api-bridge/documentation")
def get_horus_bridge_documentation(request: Request):
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme or "http"
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost:8000"
    base_url = f"{scheme}://{host}"
    return {
        "title": "Documentação Oficial — API Horus B2B & Financeiro Complementar (Cronuz Gateway)",
        "version": "1.0.0",
        "base_endpoint": f"{base_url}/Horus/api/TServerB2B/",
        "auth_modes": [
            {
                "type": "Basic Auth (Padrão Nativo Horus)",
                "header": "Authorization: Basic base64(usuario:senha)",
                "description": "100% compatível com qualquer integrador ou e-commerce já homologado no Horus S.I.G.A.",
            },
            {
                "type": "Bearer Token / X-API-Key",
                "header": "Authorization: Bearer hb2b_live_...  ou  X-API-Key: hb2b_live_...",
                "description": "Autenticação moderna via Token exclusivo gerado no Painel Master do Cronuz B2B.",
            },
        ],
        "pagination_rules": {
            "offset_param": "OFFSET",
            "limit_param": "LIMIT",
            "max_limit": 5000,
            "note": "O Gateway respeita automaticamente a flag de paginação legada (horus_legacy_pagination) e injeta SD_COD_EMPRESA/SD_COD_FILIAL/SD_LOCAL_ESTOQUE quando configurados no Seller.",
        },
        "categories": HORUS_API_DOCUMENTATION_CATALOG,
    }
