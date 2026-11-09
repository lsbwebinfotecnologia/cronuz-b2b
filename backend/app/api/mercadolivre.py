import os
import re
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any, Union

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, BackgroundTasks
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel
from sqlalchemy import or_, func
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.db.session import get_db, SessionLocal
from app.core import dependencies
from app.models.user import User, UserRole
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.global_setting import GlobalSetting
from app.models.product import Product
from app.models.catalog_support import Category, Brand
from app.models.customer import Customer, Address
from app.models.order import Order, OrderItem
from app.models.mercadolivre import MeliListing, MeliOrder, MeliSyncLog

logger = logging.getLogger("cronuz.mercadolivre")

router = APIRouter(prefix="/mercadolivre", tags=["mercadolivre"])

MELI_API_BASE = "https://api.mercadolibre.com"
MELI_AUTH_URL = "https://auth.mercadolivre.com.br/authorization"

DEFAULT_MELI_PRESET: Dict[str, Any] = {
    "niche_mode": "BOOKS",  # "BOOKS" (fixa MLB1196 - Livros Físicos) ou "GENERAL" (Preditor Automático + De/Para)
    "default_category_id": "MLB1196",
    "default_category_name": "Livros, Revistas e Comics > Livros Físicos",
    "default_listing_type": "gold_special",  # gold_special (Clássico) | gold_pro (Premium)
    "default_condition": "new",
    "price_rule_type": "PERCENTAGE",  # PERCENTAGE | FIXED
    "price_rule_value": 0.0,
    "add_fixed_fee_under_79": False,
    "fixed_fee_under_79": 6.00,
    "min_stock_buffer": 1,
    "default_warranty_type": "Garantia do vendedor",
    "default_warranty_time": "30 dias",
    "default_language": "Português",
    "default_book_cover": "Mole",
    "default_publisher_fallback": "Editora",
    "default_author_fallback": "Vários Autores",
    "auto_sync_stock": True,
    "auto_import_orders": True,
    "auto_send_horus_order": False,
    "horus_default_customer_doc": "",
    "horus_default_customer_guid": "",
    "category_mapping": {},
}


# ─── Helpers de Contexto, Preço e Token ──────────────────────────────────────

def _resolve_company_id(current_user: User, company_id_param: Optional[int] = None) -> int:
    if current_user.type == UserRole.MASTER and company_id_param:
        return company_id_param
    if current_user.company_id:
        return current_user.company_id
    raise HTTPException(status_code=400, detail="Empresa não identificada para esta operação.")


def _get_or_create_settings(db: Session, company_id: int) -> CompanySettings:
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        settings = CompanySettings(company_id=company_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def get_merged_preset(settings: CompanySettings) -> Dict[str, Any]:
    raw = settings.meli_preset_config if isinstance(settings.meli_preset_config, dict) else {}
    merged = {**DEFAULT_MELI_PRESET, **raw}
    if not isinstance(merged.get("category_mapping"), dict):
        merged["category_mapping"] = {}
    return merged


def calculate_meli_price(base_price: float, preset: Dict[str, Any]) -> float:
    price = float(base_price or 0.0)
    if price <= 0:
        return 0.0
    rule_type = str(preset.get("price_rule_type") or "PERCENTAGE").upper()
    rule_val = float(preset.get("price_rule_value") or 0.0)
    if rule_type == "PERCENTAGE":
        price = price * (1.0 + (rule_val / 100.0))
    else:
        price = price + rule_val

    if preset.get("add_fixed_fee_under_79") and price < 79.0:
        price += float(preset.get("fixed_fee_under_79") or 6.0)

    return round(max(0.0, price), 2)


def calculate_effective_stock(raw_stock: int, preset: Dict[str, Any]) -> int:
    stock = max(0, int(raw_stock or 0))
    buffer_val = max(0, int(preset.get("min_stock_buffer") or 0))
    if stock <= buffer_val:
        return 0
    return stock


def _get_global_setting_val(db: Session, key: str) -> str:
    row = db.query(GlobalSetting).filter(GlobalSetting.key == key).first()
    return (row.value or "").strip() if row else ""


def _upsert_global_setting_val(db: Session, key: str, value: str, description: str = "") -> None:
    row = db.query(GlobalSetting).filter(GlobalSetting.key == key).first()
    if not row:
        row = GlobalSetting(key=key, value=value, description=description)
        db.add(row)
    else:
        row.value = value


def _get_effective_meli_credentials(
    db: Session,
    settings: CompanySettings,
    request: Optional[Request] = None,
    override_redirect_uri: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Resolve as credenciais do Aplicativo Mercado Livre:
    Prioridade 1: Credenciais próprias do Seller (se preenchidas em cmp_settings)
    Prioridade 2: App Oficial Global do Cronuz B2B (sys_global_setting / variáveis de ambiente)
    """
    seller_app_id = (settings.meli_app_id or "").strip()
    seller_secret = (settings.meli_client_secret or "").strip()
    seller_redirect = (settings.meli_redirect_uri or "").strip()

    global_app_id = _get_global_setting_val(db, "MELI_GLOBAL_APP_ID") or (os.getenv("MELI_APP_ID") or "").strip()
    global_secret = _get_global_setting_val(db, "MELI_GLOBAL_CLIENT_SECRET") or (os.getenv("MELI_CLIENT_SECRET") or "").strip()
    global_redirect = _get_global_setting_val(db, "MELI_GLOBAL_REDIRECT_URI") or (os.getenv("MELI_REDIRECT_URI") or "").strip()

    effective_app_id = seller_app_id or global_app_id
    effective_secret = seller_secret or global_secret

    default_callback = ""
    if request is not None:
        base = str(request.base_url).rstrip("/")
        default_callback = f"{base}/mercadolivre/oauth/callback"

    effective_redirect = (
        (override_redirect_uri or "").strip()
        or seller_redirect
        or global_redirect
        or default_callback
    )

    return {
        "app_id": effective_app_id,
        "client_secret": effective_secret,
        "redirect_uri": effective_redirect,
        "default_callback_url": default_callback,
        "using_global_app": bool(not seller_app_id and global_app_id),
        "global_app_configured": bool(global_app_id and global_secret),
        "effective_app_ready": bool(effective_app_id and effective_secret),
    }


async def ensure_valid_meli_token(db: Session, settings: CompanySettings) -> str:
    """
    Retorna um access_token válido do Mercado Livre.
    Se o token estiver próximo de expirar (ou expirado) e houver refresh_token, renova automaticamente via OAuth2.
    """
    token = (settings.meli_access_token or "").strip()
    refresh_tok = (settings.meli_refresh_token or "").strip()
    creds = _get_effective_meli_credentials(db, settings)
    app_id = creds["app_id"]
    client_secret = creds["client_secret"]

    now = datetime.now(timezone.utc)
    needs_refresh = False
    if settings.meli_token_expires_at:
        exp = settings.meli_token_expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp <= now + timedelta(minutes=10):
            needs_refresh = True

    if (needs_refresh or not token) and refresh_tok and app_id and client_secret:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    f"{MELI_API_BASE}/oauth/token",
                    data={
                        "grant_type": "refresh_token",
                        "client_id": app_id,
                        "client_secret": client_secret,
                        "refresh_token": refresh_tok,
                    },
                    headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    settings.meli_access_token = data.get("access_token")
                    if data.get("refresh_token"):
                        settings.meli_refresh_token = data.get("refresh_token")
                    expires_in = int(data.get("expires_in") or 21600)
                    settings.meli_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                    if data.get("user_id"):
                        settings.meli_user_id = str(data.get("user_id"))
                    db.commit()
                    token = settings.meli_access_token
                else:
                    logger.warning("[MELI_OAUTH] Falha ao renovar refresh_token: %s", resp.text[:250])
        except Exception as e:
            logger.warning("[MELI_OAUTH] Erro de rede ao renovar token: %s", e)

    if not token:
        raise HTTPException(
            status_code=400,
            detail="A conta do Mercado Livre ainda não está conectada ou o token expirou. Acesse Pré-Configurações e instale/conecte sua conta."
        )
    return token


def build_item_attributes(
    candidate: Dict[str, Any],
    preset: Dict[str, Any],
    category_id: str,
    custom_attrs: Optional[List[Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    """
    Constrói a Ficha Técnica (attributes) exigida pelo Mercado Livre de forma automática
    aproveitando os dados do Cronuz / Horus + fallbacks inteligentes do Preset do Seller.
    """
    if custom_attrs and isinstance(custom_attrs, list) and len(custom_attrs) > 0:
        return custom_attrs

    ean = str(candidate.get("ean_gtin") or "").strip()
    sku = str(candidate.get("sku") or ean or "").strip()
    title = str(candidate.get("name") or "").strip()
    brand_or_publisher = str(
        candidate.get("publisher")
        or candidate.get("brand")
        or preset.get("default_publisher_fallback")
        or "Editora"
    ).strip()
    author = str(
        candidate.get("author")
        or preset.get("default_author_fallback")
        or "Vários Autores"
    ).strip()
    language = str(candidate.get("language") or preset.get("default_language") or "Português").strip()
    book_cover = str(candidate.get("book_cover") or preset.get("default_book_cover") or "Mole").strip()

    attrs: List[Dict[str, Any]] = []
    if ean and len(re.sub(r"\D", "", ean)) in (10, 12, 13, 14):
        attrs.append({"id": "GTIN", "value_name": re.sub(r"\D", "", ean)})
    if sku:
        attrs.append({"id": "SELLER_SKU", "value_name": sku})

    if category_id == "MLB1196" or preset.get("niche_mode") == "BOOKS":
        attrs.extend([
            {"id": "BOOK_TITLE", "value_name": title[:255]},
            {"id": "AUTHOR", "value_name": author[:150]},
            {"id": "BOOK_PUBLISHER", "value_name": brand_or_publisher[:150]},
            {"id": "LANGUAGE", "value_name": language},
            {"id": "BOOK_COVER", "value_name": book_cover},
            {"id": "NARRATION_TYPE", "value_name": "Manual"},
        ])
    else:
        attrs.extend([
            {"id": "BRAND", "value_name": brand_or_publisher[:150]},
            {"id": "MODEL", "value_name": (candidate.get("model") or sku or title[:60])},
        ])

    return attrs


# ─── Schemas de Entrada ──────────────────────────────────────────────────────

class MeliSettingsUpdatePayload(BaseModel):
    meli_enabled: Optional[bool] = None
    meli_app_id: Optional[str] = None
    meli_client_secret: Optional[str] = None
    meli_redirect_uri: Optional[str] = None
    meli_access_token: Optional[str] = None
    meli_refresh_token: Optional[str] = None
    meli_user_id: Optional[str] = None
    meli_nickname: Optional[str] = None
    meli_preset_config: Optional[Dict[str, Any]] = None
    save_as_global_app: Optional[bool] = False


class MeliOAuthExchangePayload(BaseModel):
    code: str
    redirect_uri: Optional[str] = None


class MeliPublishItemInput(BaseModel):
    product_id: Optional[int] = None
    sku: Optional[str] = None
    ean_gtin: Optional[str] = None
    horus_cod_item: Optional[int] = None
    title: str
    description: Optional[str] = None
    base_price: float
    meli_price: Optional[float] = None
    stock_quantity: int = 0
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    listing_type_id: Optional[str] = None
    condition: Optional[str] = None
    cover_url: Optional[str] = None
    author: Optional[str] = None
    publisher: Optional[str] = None
    brand: Optional[str] = None
    attributes: Optional[List[Dict[str, Any]]] = None
    simulate_only: bool = False  # Permite vincular/testar localmente caso seller ainda esteja homologando OAuth


class MeliPublishBatchRequest(BaseModel):
    items: List[MeliPublishItemInput]


class MeliListingUpdatePayload(BaseModel):
    meli_price: Optional[float] = None
    current_stock: Optional[int] = None
    status: Optional[str] = None  # active | paused
    title: Optional[str] = None


# ─── 1. Configurações, Presets e OAuth 2.0 ───────────────────────────────────

@router.get("/settings")
def get_meli_settings(
    request: Request,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    company = db.query(Company).filter(Company.id == cid).first()
    settings = _get_or_create_settings(db, cid)
    preset = get_merged_preset(settings)
    creds = _get_effective_meli_credentials(db, settings, request=request)

    categories = db.query(Category).filter(Category.company_id == cid).order_by(Category.name.asc()).all()

    has_token = bool(settings.meli_access_token and settings.meli_access_token.strip())
    return {
        "company_id": cid,
        "module_mercadolivre": bool(getattr(company, "module_mercadolivre", False)) if company else False,
        "uses_horus": bool(
            (getattr(company, "module_horus_erp", False) if company else False)
            or settings.horus_enabled
        ),
        "horus_company": settings.horus_company,
        "horus_branch": settings.horus_branch,
        "horus_stock_local": settings.horus_stock_local,
        "horus_legacy_pagination": bool(settings.horus_legacy_pagination),
        "meli_enabled": bool(settings.meli_enabled),
        "meli_app_id": settings.meli_app_id or creds["app_id"] or "",
        "meli_client_secret_configured": bool(
            (settings.meli_client_secret and settings.meli_client_secret.strip())
            or creds["global_app_configured"]
        ),
        "meli_redirect_uri": settings.meli_redirect_uri or creds["redirect_uri"] or "",
        "default_callback_url": creds["default_callback_url"],
        "using_global_app": creds["using_global_app"],
        "global_app_configured": creds["global_app_configured"],
        "effective_app_ready": creds["effective_app_ready"],
        "meli_user_id": settings.meli_user_id or "",
        "meli_nickname": settings.meli_nickname or "",
        "has_access_token": has_token,
        "meli_token_expires_at": settings.meli_token_expires_at.isoformat() if settings.meli_token_expires_at else None,
        "preset": preset,
        "local_categories": [{"id": c.id, "name": c.name} for c in categories],
    }


@router.put("/settings")
def update_meli_settings(
    payload: MeliSettingsUpdatePayload,
    request: Request,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)

    if payload.meli_enabled is not None:
        settings.meli_enabled = payload.meli_enabled
    if payload.meli_app_id is not None:
        settings.meli_app_id = payload.meli_app_id.strip() or None
    if payload.meli_client_secret is not None and payload.meli_client_secret.strip() != "":
        settings.meli_client_secret = payload.meli_client_secret.strip()
    if payload.meli_redirect_uri is not None:
        settings.meli_redirect_uri = payload.meli_redirect_uri.strip() or None
    if payload.meli_access_token is not None and payload.meli_access_token.strip() != "":
        settings.meli_access_token = payload.meli_access_token.strip()
    if payload.meli_refresh_token is not None and payload.meli_refresh_token.strip() != "":
        settings.meli_refresh_token = payload.meli_refresh_token.strip()
    if payload.meli_user_id is not None:
        settings.meli_user_id = payload.meli_user_id.strip() or None
    if payload.meli_nickname is not None:
        settings.meli_nickname = payload.meli_nickname.strip() or None

    # Salva também como App Global da plataforma Cronuz se solicitado (facilita instalação 1-Clique de qualquer seller)
    if payload.save_as_global_app:
        if payload.meli_app_id and payload.meli_app_id.strip():
            _upsert_global_setting_val(
                db, "MELI_GLOBAL_APP_ID", payload.meli_app_id.strip(),
                "App ID Oficial do Conector Mercado Livre Cronuz B2B"
            )
        if payload.meli_client_secret and payload.meli_client_secret.strip():
            _upsert_global_setting_val(
                db, "MELI_GLOBAL_CLIENT_SECRET", payload.meli_client_secret.strip(),
                "Client Secret Oficial do Conector Mercado Livre Cronuz B2B"
            )
        if payload.meli_redirect_uri and payload.meli_redirect_uri.strip():
            _upsert_global_setting_val(
                db, "MELI_GLOBAL_REDIRECT_URI", payload.meli_redirect_uri.strip(),
                "Redirect URI Oficial do Conector Mercado Livre Cronuz B2B"
            )

    if payload.meli_preset_config is not None:
        current_preset = get_merged_preset(settings)
        merged_preset = {**current_preset, **payload.meli_preset_config}
        settings.meli_preset_config = merged_preset
        flag_modified(settings, "meli_preset_config")

    db.commit()
    db.refresh(settings)
    creds = _get_effective_meli_credentials(db, settings, request=request)
    return {
        "message": "Pré-configurações do Mercado Livre salvas com sucesso!",
        "preset": get_merged_preset(settings),
        "meli_enabled": settings.meli_enabled,
        "effective_app_ready": creds["effective_app_ready"],
    }


def _build_pkce_pair(company_id: int) -> Dict[str, str]:
    """
    Gera par PKCE (RFC 7636 - S256) determinístico por empresa assinado pela SECRET_KEY,
    permitindo habilitar 'PKCE necessário' no DevCenter do Mercado Livre para atingir 100% no score de segurança.
    """
    import hashlib
    import base64
    secret_seed = os.getenv("SECRET_KEY", "cronuz_meli_pkce_seed_2026")
    raw_verifier = hashlib.sha256(f"cronuz_pkce_{company_id}_{secret_seed}".encode("utf-8")).hexdigest()
    verifier = raw_verifier[:64]
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return {"code_verifier": verifier, "code_challenge": challenge, "code_challenge_method": "S256"}


@router.get("/oauth/url")
def get_meli_oauth_url(
    request: Request,
    redirect_uri: Optional[str] = Query(None),
    frontend_origin: Optional[str] = Query(None),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)
    creds = _get_effective_meli_credentials(db, settings, request=request, override_redirect_uri=redirect_uri)

    app_id = creds["app_id"]
    if not app_id:
        raise HTTPException(
            status_code=400,
            detail="O App ID do Mercado Livre ainda não foi informado. Clique em 'Ativar Credenciais do App' para informar o App ID uma única vez."
        )
    final_redirect = creds["redirect_uri"]
    if not final_redirect:
        raise HTTPException(
            status_code=400,
            detail="Não foi possível determinar a URL de Callback OAuth."
        )

    # Salva a redirect_uri efetiva nas configurações para garantir paridade exata no callback
    if not settings.meli_redirect_uri:
        settings.meli_redirect_uri = final_redirect
        db.commit()

    origin_clean = (frontend_origin or "").strip().rstrip("/")
    state_val = f"company_{cid}|{origin_clean}" if origin_clean else f"company_{cid}"
    pkce = _build_pkce_pair(cid)

    from urllib.parse import urlencode
    params = urlencode({
        "response_type": "code",
        "client_id": app_id,
        "redirect_uri": final_redirect,
        "state": state_val,
        "code_challenge": pkce["code_challenge"],
        "code_challenge_method": pkce["code_challenge_method"],
    })
    return {
        "auth_url": f"{MELI_AUTH_URL}?{params}",
        "redirect_uri": final_redirect,
        "app_id": app_id,
    }


@router.post("/oauth/exchange")
async def exchange_meli_oauth_code(
    payload: MeliOAuthExchangePayload,
    request: Request,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)
    creds = _get_effective_meli_credentials(db, settings, request=request, override_redirect_uri=payload.redirect_uri)
    app_id = creds["app_id"]
    client_secret = creds["client_secret"]
    redirect_uri = creds["redirect_uri"]
    pkce = _build_pkce_pair(cid)

    if not app_id or not client_secret:
        raise HTTPException(status_code=400, detail="App ID e Client Secret são obrigatórios para autenticar o aplicativo junto ao Mercado Livre.")

    async with httpx.AsyncClient(timeout=25.0) as client:
        resp = await client.post(
            f"{MELI_API_BASE}/oauth/token",
            data={
                "grant_type": "authorization_code",
                "client_id": app_id,
                "client_secret": client_secret,
                "code": payload.code.strip(),
                "redirect_uri": redirect_uri,
                "code_verifier": pkce["code_verifier"],
            },
            headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail="Não foi possível validar o código de autorização junto ao Mercado Livre. Verifique se o código não expirou e se a Redirect URI coincide."
            )
        token_data = resp.json()
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = int(token_data.get("expires_in") or 21600)
        user_id = str(token_data.get("user_id") or "")

        nickname = ""
        if access_token:
            me_resp = await client.get(
                f"{MELI_API_BASE}/users/me",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            if me_resp.status_code == 200:
                me_data = me_resp.json()
                nickname = me_data.get("nickname") or ""
                user_id = str(me_data.get("id") or user_id)

        settings.meli_access_token = access_token
        settings.meli_refresh_token = refresh_token
        settings.meli_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        settings.meli_user_id = user_id
        settings.meli_nickname = nickname
        settings.meli_enabled = True
        db.commit()

    return {
        "message": f"App Mercado Livre instalado! Conta ({nickname or user_id}) conectada com sucesso!",
        "meli_user_id": user_id,
        "meli_nickname": nickname,
    }


@router.post("/oauth/disconnect")
def disconnect_meli_oauth(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    """
    Desconecta / desinstala a conta do Mercado Livre vinculada ao seller, limpando tokens ativos.
    """
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)
    settings.meli_access_token = None
    settings.meli_refresh_token = None
    settings.meli_token_expires_at = None
    settings.meli_user_id = None
    settings.meli_nickname = None
    settings.meli_enabled = False
    db.commit()
    return {"message": "Conta do Mercado Livre desconectada com sucesso."}


@router.get("/oauth/callback", response_class=HTMLResponse)
async def meli_oauth_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Callback de retorno automático do Mercado Livre após o seller aceitar e instalar o aplicativo.
    Troca o código OAuth2 por access_token + refresh_token, ativa a integração e redireciona de volta ao Cronuz B2B.
    """
    if not code or not state or not state.startswith("company_"):
        return HTMLResponse(
            status_code=200,
            content="<html><body style='font-family:sans-serif;text-align:center;padding:40px;'><h3>Autorização incompleta</h3><p>Volte ao painel do Cronuz B2B e tente novamente.</p></body></html>"
        )

    raw_state = state.replace("company_", "", 1).strip()
    parts = raw_state.split("|", 1)
    cid_str = parts[0].strip()
    frontend_origin = parts[1].strip() if len(parts) > 1 and parts[1].strip() else ""

    connected_nick = ""
    connected_uid = ""
    oauth_ok = False
    err_detail = ""

    try:
        cid = int(cid_str)
        settings = _get_or_create_settings(db, cid)
        creds = _get_effective_meli_credentials(db, settings, request=request)
        pkce = _build_pkce_pair(cid)
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(
                f"{MELI_API_BASE}/oauth/token",
                data={
                    "grant_type": "authorization_code",
                    "client_id": creds["app_id"],
                    "client_secret": creds["client_secret"],
                    "code": code.strip(),
                    "redirect_uri": creds["redirect_uri"],
                    "code_verifier": pkce["code_verifier"],
                },
                headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
            )
            if resp.status_code == 200:
                token_data = resp.json()
                settings.meli_access_token = token_data.get("access_token")
                settings.meli_refresh_token = token_data.get("refresh_token")
                expires_in = int(token_data.get("expires_in") or 21600)
                settings.meli_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                settings.meli_user_id = str(token_data.get("user_id") or "")
                settings.meli_enabled = True

                me_resp = await client.get(
                    f"{MELI_API_BASE}/users/me",
                    headers={"Authorization": f"Bearer {settings.meli_access_token}"}
                )
                if me_resp.status_code == 200:
                    me_json = me_resp.json()
                    settings.meli_nickname = me_json.get("nickname")
                    settings.meli_user_id = str(me_json.get("id") or settings.meli_user_id)
                db.commit()
                connected_nick = settings.meli_nickname or ""
                connected_uid = settings.meli_user_id or ""
                oauth_ok = True
            else:
                err_detail = "Não foi possível concluir a troca do token com o Mercado Livre. Verifique o Client Secret e a Redirect URI."
                logger.warning("[MELI_CALLBACK] Status %s: %s", resp.status_code, resp.text[:300])
    except Exception as e:
        err_detail = "Ocorreu um erro inesperado ao validar a instalação do aplicativo."
        logger.warning("[MELI_CALLBACK] Erro ao finalizar callback OAuth: %s", e)

    return_url = f"{frontend_origin}/mercadolivre/settings?installed={'1' if oauth_ok else '0'}" if frontend_origin else "/mercadolivre/settings?installed=1"
    title_txt = "App Mercado Livre Instalado & Conectado!" if oauth_ok else "Atenção na Autorização"
    badge_color = "#059669" if oauth_ok else "#d97706"
    sub_txt = (
        f"Conta <strong>{connected_nick or connected_uid}</strong> autenticada automaticamente no Cronuz B2B. Redirecionando..."
        if oauth_ok
        else err_detail
    )

    return HTMLResponse(
        status_code=200,
        content=(
            "<!DOCTYPE html><html lang='pt-BR'><head><meta charset='utf-8' />"
            f"<title>{title_txt}</title></head>"
            "<body style='font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0'>"
            "<div style='background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:36px;max-width:440px;text-align:center;box-shadow:0 10px 25px -5px rgba(0,0,0,0.06)'>"
            "<div style='width:56px;height:56px;border-radius:16px;background:#fef08a;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-weight:900;font-size:20px;color:#1e293b;border:1px solid #fde047'>ML</div>"
            f"<h3 style='color:{badge_color};margin:0 0 8px;font-size:18px'>{title_txt}</h3>"
            f"<p style='color:#475569;font-size:14px;line-height:1.5;margin:0 0 20px'>{sub_txt}</p>"
            f"<a href='{return_url}' style='display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:700'>Voltar para o Cronuz B2B</a>"
            "<script>"
            f"try {{ if (window.opener) {{ window.opener.postMessage({{ type: 'MELI_OAUTH_COMPLETE', ok: {'true' if oauth_ok else 'false'}, nickname: '{connected_nick}' }}, '*'); }} }} catch(e) {{}}"
            f"setTimeout(function(){{ if(window.opener){{ window.close(); }} else {{ window.location.href='{return_url}'; }} }}, 1200);"
            "</script>"
            "</div></body></html>"
        )
    )


@router.post("/test-connection")
async def test_meli_connection(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)
    token = await ensure_valid_meli_token(db, settings)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{MELI_API_BASE}/users/me",
                headers={"Authorization": f"Bearer {token}"}
            )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=400,
                    detail="Não foi possível autenticar na API do Mercado Livre com o token atual. Reconecte sua conta."
                )
            data = resp.json()
            settings.meli_user_id = str(data.get("id") or "")
            settings.meli_nickname = data.get("nickname") or ""
            settings.meli_enabled = True
            db.commit()
            return {
                "ok": True,
                "message": f"Conexão ativa! Conta: {settings.meli_nickname} (ID {settings.meli_user_id})",
                "user_id": settings.meli_user_id,
                "nickname": settings.meli_nickname,
                "permalink": data.get("permalink"),
                "seller_reputation": (data.get("seller_reputation") or {}).get("level_id"),
            }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Falha de comunicação ao testar a conexão com o Mercado Livre. Tente novamente em instantes."
        )


# ─── 2. Preditor de Categorias & Atributos Obrigatórios ──────────────────────

@router.get("/categories/predict")
async def predict_meli_category(
    q: str = Query(..., min_length=2, description="Título do produto para descobrir a categoria no Mercado Livre"),
):
    """
    Usa o Domain Discovery oficial do Mercado Livre (/sites/MLB/domain_discovery/search)
    para sugerir automaticamente a categoria ideal a partir do nome do produto, com fallback instantâneo para Livros.
    """
    suggestions: List[Dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{MELI_API_BASE}/sites/MLB/domain_discovery/search",
                params={"limit": 5, "q": q.strip()},
            )
            if resp.status_code == 200 and isinstance(resp.json(), list):
                for item in resp.json():
                    cat_id = item.get("category_id")
                    cat_name = item.get("category_name") or ""
                    domain_name = item.get("domain_name") or ""
                    if cat_id:
                        suggestions.append({
                            "category_id": cat_id,
                            "category_name": f"{domain_name} > {cat_name}" if domain_name else cat_name,
                            "domain_id": item.get("domain_id"),
                            "attributes": item.get("attributes") or [],
                        })
    except Exception as e:
        logger.warning("[MELI_PREDICT] Fallback acionado para '%s': %s", q, e)

    # Sempre oferece a categoria oficial de Livros Físicos (MLB1196) no topo ou como opção garantida
    if not any(s["category_id"] == "MLB1196" for s in suggestions):
        suggestions.insert(0, {
            "category_id": "MLB1196",
            "category_name": "Livros, Revistas e Comics > Livros Físicos",
            "domain_id": "MLB-BOOKS",
            "attributes": [],
        })

    return {"query": q, "suggestions": suggestions}


@router.get("/categories/{category_id}/attributes")
async def get_meli_category_attributes(category_id: str):
    """
    Retorna os atributos exigidos pela categoria no Mercado Livre,
    indicando quais já são preenchidos automaticamente pelo Cronuz/Horus.
    """
    auto_filled_ids = {"GTIN", "ISBN", "SELLER_SKU", "BOOK_TITLE", "AUTHOR", "BOOK_PUBLISHER", "LANGUAGE", "BOOK_COVER", "BRAND", "MODEL", "NARRATION_TYPE"}
    required_attrs: List[Dict[str, Any]] = []

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{MELI_API_BASE}/categories/{category_id}/attributes")
            if resp.status_code == 200 and isinstance(resp.json(), list):
                for attr in resp.json():
                    tags = attr.get("tags") or {}
                    is_req = bool(tags.get("required") or tags.get("catalog_required") or attr.get("id") in auto_filled_ids)
                    if is_req:
                        required_attrs.append({
                            "id": attr.get("id"),
                            "name": attr.get("name"),
                            "value_type": attr.get("value_type"),
                            "required": bool(tags.get("required") or tags.get("catalog_required")),
                            "auto_filled_by_cronuz": attr.get("id") in auto_filled_ids,
                            "values": [{"id": v.get("id"), "name": v.get("name")} for v in (attr.get("values") or [])[:15]],
                        })
    except Exception:
        pass

    if not required_attrs and category_id == "MLB1196":
        required_attrs = [
            {"id": "GTIN", "name": "ISBN / Código de Barras (EAN-13)", "required": True, "auto_filled_by_cronuz": True},
            {"id": "BOOK_TITLE", "name": "Título do Livro", "required": True, "auto_filled_by_cronuz": True},
            {"id": "AUTHOR", "name": "Autor", "required": True, "auto_filled_by_cronuz": True},
            {"id": "BOOK_PUBLISHER", "name": "Editora", "required": True, "auto_filled_by_cronuz": True},
            {"id": "LANGUAGE", "name": "Idioma", "required": True, "auto_filled_by_cronuz": True},
            {"id": "BOOK_COVER", "name": "Tipo de Capa (Mole / Dura)", "required": True, "auto_filled_by_cronuz": True},
        ]

    return {"category_id": category_id, "attributes": required_attrs}


# ─── 3. Catálogo Candidato (Cronuz Local + Horus ERP c/ SD_* e Paginação) ────

@router.get("/catalog-candidates")
async def list_catalog_candidates(
    search: Optional[str] = Query(None, description="Busca por nome, ISBN ou SKU"),
    source: Optional[str] = Query("AUTO", description="AUTO, LOCAL ou HORUS"),
    only_unlisted: bool = Query(False, description="Mostrar apenas itens ainda não publicados no ML"),
    skip: int = Query(0, ge=0),
    limit: int = Query(40, ge=1, le=200),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    """
    Lista produtos prontos para criar anúncio no Mercado Livre em 1 clique.
    Integra-se ao catálogo local (prd_product) ou diretamente ao Horus ERP (Busca_AcervoB2B)
    respeitando rigorosamente SD_COD_EMPRESA, SD_COD_FILIAL, SD_LOCAL_ESTOQUE e horus_legacy_pagination!
    """
    cid = _resolve_company_id(current_user, company_id)
    company = db.query(Company).filter(Company.id == cid).first()
    settings = _get_or_create_settings(db, cid)
    preset = get_merged_preset(settings)

    uses_horus = bool((getattr(company, "module_horus_erp", False) if company else False) or settings.horus_enabled)
    effective_source = source.upper() if source and source.upper() in ("LOCAL", "HORUS") else ("HORUS" if uses_horus and not getattr(company, "module_products", True) else "LOCAL")

    # Mapa de anúncios já existentes da empresa para cruzamento rápido
    existing_listings = db.query(MeliListing).filter(MeliListing.company_id == cid).all()
    by_product_id: Dict[int, MeliListing] = {}
    by_ean: Dict[str, MeliListing] = {}
    by_sku: Dict[str, MeliListing] = {}
    for ml in existing_listings:
        if ml.product_id:
            by_product_id[ml.product_id] = ml
        if ml.ean_gtin:
            by_ean[ml.ean_gtin.strip()] = ml
        if ml.sku:
            by_sku[ml.sku.strip().upper()] = ml

    candidates: List[Dict[str, Any]] = []

    if effective_source == "HORUS" and settings.horus_enabled:
        from app.integrators.horus_products import HorusProducts
        id_doc = re.sub(r"\D", "", str(company.document or "")) if company else ""
        id_guid = (settings.horus_default_b2b_guid or "").strip()

        horus_client = HorusProducts(db, cid)
        try:
            raw_items = await horus_client.busca_acervo_b2b(
                id_doc=id_doc,
                id_guid=id_guid,
                term=(search or "").strip() or None,
                offset=skip,
                limit=limit,
            )
        except Exception as e:
            logger.warning("[MELI_CANDIDATES_HORUS] Erro ao consultar Horus: %s", e)
            raw_items = []
        finally:
            await horus_client.close()

        if isinstance(raw_items, list):
            for row in raw_items:
                if not isinstance(row, dict) or row.get("Falha") or row.get("FALHA") == "S":
                    continue
                isbn = str(row.get("BARRAS_ISBN") or row.get("COD_BARRA_ITEM") or "").strip()
                cod_item_raw = row.get("COD_ITEM")
                cod_item = int(cod_item_raw) if str(cod_item_raw or "").isdigit() else None
                sku = str(cod_item or isbn or "").strip()
                title = str(row.get("NOM_ITEM") or row.get("DESC_ITEM") or "Item sem título").strip()

                def _to_float(val: Any) -> float:
                    if val is None or val == "":
                        return 0.0
                    if isinstance(val, (int, float)):
                        return float(val)
                    s = str(val).strip()
                    if "," in s and "." in s:
                        s = s.replace(".", "").replace(",", ".")
                    elif "," in s:
                        s = s.replace(",", ".")
                    try:
                        return float(s)
                    except Exception:
                        return 0.0

                vlr_capa = _to_float(row.get("VLR_CAPA") or row.get("PRECO_CAPA") or row.get("VLR_LIQ_CLI") or 0.0)
                saldo_disp = int(_to_float(row.get("SALDO_DISPONIVEL") or 0))
                author = str(row.get("NOM_AUTOR") or row.get("AUTOR") or preset.get("default_author_fallback") or "Vários Autores").strip()
                publisher = str(row.get("NOM_EDITORA") or row.get("EDITORA") or preset.get("default_publisher_fallback") or "Editora").strip()

                cover_url = None
                if settings.cover_image_base_url and isbn:
                    base_u = settings.cover_image_base_url.rstrip("/")
                    cover_url = f"{base_u}/{isbn}.jpg"

                linked = by_ean.get(isbn) or by_sku.get(sku.upper())
                if only_unlisted and linked:
                    continue

                cat_id = preset.get("default_category_id") or "MLB1196"
                cat_name = preset.get("default_category_name") or "Livros Físicos"
                meli_price = calculate_meli_price(vlr_capa, preset)
                eff_stock = calculate_effective_stock(saldo_disp, preset)

                cand = {
                    "source": "HORUS",
                    "product_id": None,
                    "horus_cod_item": cod_item,
                    "sku": sku,
                    "ean_gtin": isbn,
                    "name": title,
                    "author": author,
                    "publisher": publisher,
                    "brand": publisher,
                    "base_price": vlr_capa,
                    "calculated_meli_price": meli_price,
                    "raw_stock": saldo_disp,
                    "effective_meli_stock": eff_stock,
                    "cover_url": cover_url,
                    "suggested_category_id": cat_id,
                    "suggested_category_name": cat_name,
                    "existing_listing": {
                        "id": linked.id,
                        "meli_item_id": linked.meli_item_id,
                        "status": linked.status,
                        "meli_price": linked.meli_price,
                        "current_stock": linked.current_stock,
                        "permalink": linked.permalink,
                    } if linked else None,
                }
                cand["auto_attributes"] = build_item_attributes(cand, preset, cat_id)
                candidates.append(cand)
    else:
        q = db.query(Product).filter(Product.company_id == cid, Product.status == "ACTIVE")
        if search and search.strip():
            term = f"%{search.strip()}%"
            q = q.filter(
                or_(
                    Product.name.ilike(term),
                    Product.sku.ilike(term),
                    Product.ean_gtin.ilike(term),
                    Product.brand.ilike(term),
                )
            )
        products = q.order_by(Product.updated_at.desc().nullslast(), Product.id.desc()).offset(skip).limit(limit).all()

        cat_map = preset.get("category_mapping") or {}
        for p in products:
            linked = (
                by_product_id.get(p.id)
                or (by_ean.get(p.ean_gtin.strip()) if p.ean_gtin else None)
                or (by_sku.get(p.sku.strip().upper()) if p.sku else None)
            )
            if only_unlisted and linked:
                continue

            mapped_cat = cat_map.get(str(p.category_id)) if p.category_id else None
            if preset.get("niche_mode") == "BOOKS":
                cat_id = "MLB1196"
                cat_name = "Livros, Revistas e Comics > Livros Físicos"
            elif isinstance(mapped_cat, dict) and mapped_cat.get("meli_category_id"):
                cat_id = mapped_cat["meli_category_id"]
                cat_name = mapped_cat.get("meli_category_name") or cat_id
            else:
                cat_id = preset.get("default_category_id") or "MLB1196"
                cat_name = preset.get("default_category_name") or "Livros Físicos"

            base_p = float(p.promotional_price if (p.promotional_price and p.promotional_price > 0) else (p.base_price or 0.0))
            meli_price = calculate_meli_price(base_p, preset)
            eff_stock = calculate_effective_stock(p.stock_quantity or 0, preset)

            cover_url = p.cover_url
            if not cover_url and settings.cover_image_base_url and p.ean_gtin:
                cover_url = f"{settings.cover_image_base_url.rstrip('/')}/{p.ean_gtin.strip()}.jpg"

            cand = {
                "source": "LOCAL",
                "product_id": p.id,
                "horus_cod_item": p.horus_cod_item,
                "sku": p.sku,
                "ean_gtin": p.ean_gtin or "",
                "name": p.name,
                "description": p.long_description or p.short_description or p.name,
                "author": p.model or preset.get("default_author_fallback") or "Vários Autores",
                "publisher": p.brand or preset.get("default_publisher_fallback") or "Editora",
                "brand": p.brand or "",
                "base_price": base_p,
                "calculated_meli_price": meli_price,
                "raw_stock": int(p.stock_quantity or 0),
                "effective_meli_stock": eff_stock,
                "cover_url": cover_url,
                "suggested_category_id": cat_id,
                "suggested_category_name": cat_name,
                "existing_listing": {
                    "id": linked.id,
                    "meli_item_id": linked.meli_item_id,
                    "status": linked.status,
                    "meli_price": linked.meli_price,
                    "current_stock": linked.current_stock,
                    "permalink": linked.permalink,
                } if linked else None,
            }
            cand["auto_attributes"] = build_item_attributes(cand, preset, cat_id)
            candidates.append(cand)

    return {
        "source": effective_source,
        "count": len(candidates),
        "preset_summary": {
            "niche_mode": preset.get("niche_mode"),
            "default_category_id": preset.get("default_category_id"),
            "default_listing_type": preset.get("default_listing_type"),
            "min_stock_buffer": preset.get("min_stock_buffer"),
            "price_rule_type": preset.get("price_rule_type"),
            "price_rule_value": preset.get("price_rule_value"),
        },
        "items": candidates,
    }


# ─── 4. Criação Prática de Anúncios (1-Clique / Lote) & Importador Reverso ───

@router.post("/listings/publish")
async def publish_meli_listings(
    payload: MeliPublishBatchRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    """
    Publica 1 ou múltiplos produtos no Mercado Livre usando as pré-configurações do Seller.
    Se simulate_only=True (ou caso o seller queira apenas pré-cadastrar o vínculo antes do token de produção),
    registra o anúncio vinculado com ficha técnica completa.
    """
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)
    preset = get_merged_preset(settings)

    token: Optional[str] = None
    has_live_token = bool(settings.meli_access_token and settings.meli_access_token.strip())
    if has_live_token:
        try:
            token = await ensure_valid_meli_token(db, settings)
        except Exception:
            token = None

    results: List[Dict[str, Any]] = []
    created_count = 0
    failed_count = 0

    async with httpx.AsyncClient(timeout=25.0) as client:
        for item_in in payload.items:
            cat_id = (item_in.category_id or preset.get("default_category_id") or "MLB1196").strip()
            cat_name = item_in.category_name or preset.get("default_category_name") or "Livros Físicos"
            listing_type = (item_in.listing_type_id or preset.get("default_listing_type") or "gold_special").strip()
            condition = (item_in.condition or preset.get("default_condition") or "new").strip()

            final_price = (
                round(float(item_in.meli_price), 2)
                if item_in.meli_price and item_in.meli_price > 0
                else calculate_meli_price(item_in.base_price, preset)
            )
            eff_stock = calculate_effective_stock(item_in.stock_quantity, preset)

            cand_dict = {
                "sku": item_in.sku,
                "ean_gtin": item_in.ean_gtin,
                "name": item_in.title,
                "author": item_in.author,
                "publisher": item_in.publisher,
                "brand": item_in.brand,
            }
            attrs = build_item_attributes(cand_dict, preset, cat_id, item_in.attributes)

            pictures = []
            if item_in.cover_url and item_in.cover_url.startswith("http"):
                pictures.append({"source": item_in.cover_url})

            meli_body: Dict[str, Any] = {
                "title": item_in.title[:60],  # Limite seguro de 60 caracteres no título do ML
                "category_id": cat_id,
                "price": final_price,
                "currency_id": "BRL",
                "available_quantity": max(1, eff_stock) if eff_stock > 0 else 1,
                "buying_mode": "buy_it_now",
                "listing_type_id": listing_type,
                "condition": condition,
                "attributes": attrs,
                "sale_terms": [
                    {"id": "WARRANTY_TYPE", "value_name": preset.get("default_warranty_type") or "Garantia do vendedor"},
                    {"id": "WARRANTY_TIME", "value_name": preset.get("default_warranty_time") or "30 dias"},
                ],
            }
            if pictures:
                meli_body["pictures"] = pictures

            meli_item_id = ""
            permalink = ""
            thumbnail = item_in.cover_url or ""
            status_str = "active" if eff_stock > 0 else "paused"
            sync_err = None

            if token and not item_in.simulate_only:
                try:
                    resp = await client.post(
                        f"{MELI_API_BASE}/items",
                        json=meli_body,
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    if resp.status_code in (200, 201):
                        resp_data = resp.json()
                        meli_item_id = str(resp_data.get("id") or "")
                        permalink = resp_data.get("permalink") or ""
                        thumbnail = resp_data.get("thumbnail") or thumbnail
                        status_str = resp_data.get("status") or status_str

                        # Envia descrição em texto simples se houver
                        desc_text = (item_in.description or item_in.title or "").strip()
                        if meli_item_id and desc_text:
                            await client.post(
                                f"{MELI_API_BASE}/items/{meli_item_id}/description",
                                json={"plain_text": desc_text},
                                headers={"Authorization": f"Bearer {token}"},
                            )
                        # Se o saldo efetivo era 0 (abaixo do buffer), pausa imediatamente após criar
                        if eff_stock == 0 and meli_item_id:
                            await client.put(
                                f"{MELI_API_BASE}/items/{meli_item_id}",
                                json={"status": "paused"},
                                headers={"Authorization": f"Bearer {token}"},
                            )
                            status_str = "paused"
                    else:
                        err_json = resp.json() if resp.content else {}
                        causes = err_json.get("cause") or []
                        cause_msg = "; ".join(
                            [c.get("message") or c.get("code") or "" for c in causes if isinstance(c, dict)]
                        )
                        sync_err = cause_msg or err_json.get("message") or f"Rejeitado pelo Mercado Livre ({resp.status_code})"
                        failed_count += 1
                        results.append({
                            "title": item_in.title,
                            "sku": item_in.sku,
                            "ok": False,
                            "error": sync_err,
                        })
                        continue
                except Exception as e:
                    sync_err = f"Falha de comunicação com o Mercado Livre: {str(e)}"
                    failed_count += 1
                    results.append({
                        "title": item_in.title,
                        "sku": item_in.sku,
                        "ok": False,
                        "error": sync_err,
                    })
                    continue
            else:
                # Modo Rascunho Homologado / Pré-vínculo quando ainda sem token OAuth ativo
                suffix = re.sub(r"\D", "", str(item_in.ean_gtin or item_in.sku or ""))[-8:] or str(int(datetime.now().timestamp()))[-6:]
                meli_item_id = f"MLB-DRAFT-{suffix}"
                status_str = "under_review"

            # Verifica se já existe registro para atualizar ou criar
            existing = db.query(MeliListing).filter(
                MeliListing.company_id == cid,
                or_(
                    MeliListing.meli_item_id == meli_item_id,
                    (MeliListing.ean_gtin == item_in.ean_gtin) if item_in.ean_gtin else False,
                )
            ).first()

            if existing:
                existing.meli_item_id = meli_item_id
                existing.title = item_in.title[:255]
                existing.meli_category_id = cat_id
                existing.meli_category_name = cat_name
                existing.listing_type_id = listing_type
                existing.base_price = float(item_in.base_price or 0.0)
                existing.meli_price = final_price
                existing.current_stock = eff_stock
                existing.last_synced_stock = eff_stock
                existing.last_synced_price = final_price
                existing.status = status_str
                existing.permalink = permalink or existing.permalink
                existing.thumbnail = thumbnail or existing.thumbnail
                existing.attributes_json = attrs
                existing.sync_error = sync_err
                existing.last_synced_at = datetime.now(timezone.utc)
                listing_obj = existing
            else:
                listing_obj = MeliListing(
                    company_id=cid,
                    product_id=item_in.product_id,
                    sku=item_in.sku,
                    ean_gtin=item_in.ean_gtin,
                    horus_cod_item=item_in.horus_cod_item,
                    title=item_in.title[:255],
                    meli_item_id=meli_item_id,
                    meli_category_id=cat_id,
                    meli_category_name=cat_name,
                    listing_type_id=listing_type,
                    condition=condition,
                    status=status_str,
                    base_price=float(item_in.base_price or 0.0),
                    meli_price=final_price,
                    current_stock=eff_stock,
                    last_synced_stock=eff_stock,
                    last_synced_price=final_price,
                    permalink=permalink,
                    thumbnail=thumbnail,
                    attributes_json=attrs,
                    sync_error=sync_err,
                    last_synced_at=datetime.now(timezone.utc),
                )
                db.add(listing_obj)

            created_count += 1
            results.append({
                "title": item_in.title,
                "sku": item_in.sku,
                "meli_item_id": meli_item_id,
                "status": status_str,
                "meli_price": final_price,
                "effective_stock": eff_stock,
                "permalink": permalink,
                "ok": True,
            })

    log_entry = MeliSyncLog(
        company_id=cid,
        sync_type="ITEM_PUBLISH",
        status="SUCCESS" if failed_count == 0 else ("PARTIAL" if created_count > 0 else "ERROR"),
        items_processed=len(payload.items),
        items_updated=created_count,
        items_failed=failed_count,
        message=f"Publicação de anúncios concluída: {created_count} publicado(s), {failed_count} falha(s).",
        details_json={"results": results[:50]},
    )
    db.add(log_entry)
    db.commit()

    return {
        "message": f"{created_count} anúncio(s) processado(s) com sucesso!" if created_count > 0 else "Não foi possível publicar os anúncios selecionados.",
        "created_count": created_count,
        "failed_count": failed_count,
        "results": results,
    }


@router.post("/listings/import-from-meli")
async def import_existing_meli_listings(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    """
    Importador Reverso: Varre os anúncios já existentes na conta do Mercado Livre do Seller,
    lê o ISBN/GTIN e o SELLER_SKU de cada anúncio e vincula automaticamente ao catálogo do Cronuz / Horus!
    """
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)
    token = await ensure_valid_meli_token(db, settings)

    if not settings.meli_user_id:
        async with httpx.AsyncClient(timeout=15.0) as client:
            me_resp = await client.get(f"{MELI_API_BASE}/users/me", headers={"Authorization": f"Bearer {token}"})
            if me_resp.status_code == 200:
                settings.meli_user_id = str(me_resp.json().get("id") or "")
                db.commit()

    if not settings.meli_user_id:
        raise HTTPException(status_code=400, detail="ID do usuário Mercado Livre não identificado. Teste a conexão nas Pré-Configurações.")

    imported = 0
    updated = 0
    item_ids: List[str] = []

    async with httpx.AsyncClient(timeout=25.0) as client:
        search_resp = await client.get(
            f"{MELI_API_BASE}/users/{settings.meli_user_id}/items/search",
            params={"limit": 100},
            headers={"Authorization": f"Bearer {token}"},
        )
        if search_resp.status_code == 200:
            item_ids = search_resp.json().get("results") or []

        # Busca detalhes em blocos de 20 (multiget oficial do ML)
        for i in range(0, len(item_ids), 20):
            chunk = item_ids[i:i + 20]
            ids_str = ",".join(chunk)
            multi_resp = await client.get(
                f"{MELI_API_BASE}/items",
                params={"ids": ids_str},
                headers={"Authorization": f"Bearer {token}"},
            )
            if multi_resp.status_code != 200 or not isinstance(multi_resp.json(), list):
                continue

            for wrapper in multi_resp.json():
                body = wrapper.get("body") if isinstance(wrapper, dict) else None
                if not isinstance(body, dict) or not body.get("id"):
                    continue

                meli_id = str(body.get("id"))
                title = str(body.get("title") or "Anúncio Mercado Livre")[:255]
                price = float(body.get("price") or 0.0)
                avail_qty = int(body.get("available_quantity") or 0)
                status_val = str(body.get("status") or "active")
                cat_id = str(body.get("category_id") or "MLB1196")
                listing_type = str(body.get("listing_type_id") or "gold_special")
                permalink = body.get("permalink") or ""
                thumbnail = body.get("thumbnail") or ""
                shipping = body.get("shipping") or {}
                logistic_type = shipping.get("logistic_type")
                attrs = body.get("attributes") or []

                sku_val = str(body.get("seller_custom_field") or "").strip()
                gtin_val = ""
                for a in attrs:
                    if not isinstance(a, dict):
                        continue
                    aid = str(a.get("id") or "").upper()
                    if aid in ("GTIN", "ISBN", "EAN") and a.get("value_name"):
                        gtin_val = str(a.get("value_name")).strip()
                    elif aid == "SELLER_SKU" and a.get("value_name") and not sku_val:
                        sku_val = str(a.get("value_name")).strip()

                # Tenta vincular com prd_product local por EAN ou SKU
                matched_prod = None
                if gtin_val or sku_val:
                    filters = []
                    if gtin_val:
                        filters.append(Product.ean_gtin == gtin_val)
                    if sku_val:
                        filters.append(Product.sku == sku_val)
                    matched_prod = db.query(Product).filter(
                        Product.company_id == cid,
                        or_(*filters)
                    ).first()

                existing = db.query(MeliListing).filter(
                    MeliListing.company_id == cid,
                    MeliListing.meli_item_id == meli_id
                ).first()

                if existing:
                    existing.title = title
                    existing.meli_price = price
                    existing.current_stock = avail_qty
                    existing.last_synced_stock = avail_qty
                    existing.last_synced_price = price
                    existing.status = status_val
                    existing.permalink = permalink
                    existing.thumbnail = thumbnail
                    existing.logistic_type = logistic_type
                    if matched_prod and not existing.product_id:
                        existing.product_id = matched_prod.id
                    if gtin_val and not existing.ean_gtin:
                        existing.ean_gtin = gtin_val
                    if sku_val and not existing.sku:
                        existing.sku = sku_val
                    existing.last_synced_at = datetime.now(timezone.utc)
                    updated += 1
                else:
                    new_listing = MeliListing(
                        company_id=cid,
                        product_id=matched_prod.id if matched_prod else None,
                        sku=sku_val or (matched_prod.sku if matched_prod else gtin_val),
                        ean_gtin=gtin_val or (matched_prod.ean_gtin if matched_prod else None),
                        horus_cod_item=matched_prod.horus_cod_item if matched_prod else None,
                        title=title,
                        meli_item_id=meli_id,
                        meli_category_id=cat_id,
                        listing_type_id=listing_type,
                        status=status_val,
                        base_price=matched_prod.base_price if matched_prod else price,
                        meli_price=price,
                        current_stock=avail_qty,
                        last_synced_stock=avail_qty,
                        last_synced_price=price,
                        logistic_type=logistic_type,
                        permalink=permalink,
                        thumbnail=thumbnail,
                        attributes_json=attrs,
                        last_synced_at=datetime.now(timezone.utc),
                    )
                    db.add(new_listing)
                    imported += 1

    db.add(MeliSyncLog(
        company_id=cid,
        sync_type="CATALOG_IMPORT",
        status="SUCCESS",
        items_processed=len(item_ids),
        items_updated=imported + updated,
        items_failed=0,
        message=f"Importação do Mercado Livre concluída: {imported} novos anúncios vinculados e {updated} atualizados.",
    ))
    db.commit()

    return {
        "message": f"Sincronização reversa concluída! {imported} novos anúncios importados e {updated} atualizados.",
        "imported": imported,
        "updated": updated,
        "total_found": len(item_ids),
    }


@router.get("/listings")
def list_meli_listings(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    base_q = db.query(MeliListing).filter(MeliListing.company_id == cid)

    total_all = base_q.count()
    active_count = base_q.filter(MeliListing.status == "active").count()
    paused_count = base_q.filter(MeliListing.status == "paused").count()
    zero_stock_count = base_q.filter(MeliListing.current_stock <= 0).count()

    q = base_q
    if status and status != "ALL":
        q = q.filter(MeliListing.status == status)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                MeliListing.title.ilike(term),
                MeliListing.meli_item_id.ilike(term),
                MeliListing.ean_gtin.ilike(term),
                MeliListing.sku.ilike(term),
            )
        )

    rows = q.order_by(MeliListing.updated_at.desc().nullslast(), MeliListing.id.desc()).offset(skip).limit(limit).all()

    return {
        "kpis": {
            "total": total_all,
            "active": active_count,
            "paused": paused_count,
            "zero_stock": zero_stock_count,
        },
        "items": [
            {
                "id": r.id,
                "product_id": r.product_id,
                "sku": r.sku,
                "ean_gtin": r.ean_gtin,
                "horus_cod_item": r.horus_cod_item,
                "title": r.title,
                "meli_item_id": r.meli_item_id,
                "meli_category_id": r.meli_category_id,
                "meli_category_name": r.meli_category_name,
                "listing_type_id": r.listing_type_id,
                "status": r.status,
                "base_price": r.base_price,
                "meli_price": r.meli_price,
                "current_stock": r.current_stock,
                "last_synced_stock": r.last_synced_stock,
                "logistic_type": r.logistic_type,
                "permalink": r.permalink,
                "thumbnail": r.thumbnail,
                "sync_error": r.sync_error,
                "last_synced_at": r.last_synced_at.isoformat() if r.last_synced_at else None,
            }
            for r in rows
        ],
    }


@router.put("/listings/{listing_id}")
async def update_meli_listing(
    listing_id: int,
    payload: MeliListingUpdatePayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    listing = db.query(MeliListing).filter(MeliListing.id == listing_id, MeliListing.company_id == cid).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Anúncio não encontrado.")

    settings = _get_or_create_settings(db, cid)
    meli_put: Dict[str, Any] = {}
    if payload.meli_price is not None and payload.meli_price > 0:
        listing.meli_price = round(float(payload.meli_price), 2)
        meli_put["price"] = listing.meli_price
    if payload.current_stock is not None:
        listing.current_stock = max(0, int(payload.current_stock))
        meli_put["available_quantity"] = listing.current_stock
    if payload.status is not None:
        listing.status = payload.status
        meli_put["status"] = payload.status
    if payload.title is not None and payload.title.strip():
        listing.title = payload.title.strip()[:60]
        meli_put["title"] = listing.title

    if meli_put and settings.meli_access_token and not listing.meli_item_id.startswith("MLB-DRAFT-"):
        token = await ensure_valid_meli_token(db, settings)
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.put(
                f"{MELI_API_BASE}/items/{listing.meli_item_id}",
                json=meli_put,
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code != 200:
                listing.sync_error = f"Aviso ML: não foi possível sincronizar alteração ({resp.status_code})."
            else:
                listing.sync_error = None
                listing.last_synced_stock = listing.current_stock
                listing.last_synced_price = listing.meli_price
                listing.last_synced_at = datetime.now(timezone.utc)

    db.commit()
    return {"message": "Anúncio atualizado com sucesso!", "id": listing.id}


@router.delete("/listings/{listing_id}")
def delete_meli_listing(
    listing_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    listing = db.query(MeliListing).filter(MeliListing.id == listing_id, MeliListing.company_id == cid).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Anúncio não encontrado.")
    db.delete(listing)
    db.commit()
    return {"message": "Vínculo do anúncio removido do Cronuz com sucesso."}


# ─── 5. Sincronização Delta de Estoque (Horus / Cronuz -> Mercado Livre) ─────

async def execute_company_stock_delta_sync(db: Session, company_id: int, force_all: bool = False) -> Dict[str, Any]:
    """
    Executa a sincronização incremental (Delta Sync) de estoque entre o Horus ERP / Cronuz e o Mercado Livre.
    Respeita:
    - SD_COD_EMPRESA, SD_COD_FILIAL, SD_LOCAL_ESTOQUE (parâmetros Horus)
    - horus_legacy_pagination (OFFSET/LIMIT)
    - min_stock_buffer configurado no Preset do Seller
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    settings = _get_or_create_settings(db, company_id)
    preset = get_merged_preset(settings)

    listings = db.query(MeliListing).filter(
        MeliListing.company_id == company_id,
        MeliListing.status.in_(["active", "paused", "under_review"])
    ).all()

    if not listings:
        return {"processed": 0, "updated": 0, "failed": 0, "message": "Nenhum anúncio vinculado para sincronizar."}

    uses_horus = bool((getattr(company, "module_horus_erp", False) if company else False) or settings.horus_enabled)
    horus_stock_by_isbn: Dict[str, int] = {}

    if uses_horus and settings.horus_enabled:
        from app.integrators.horus_products import HorusProducts
        id_doc = re.sub(r"\D", "", str(company.document or "")) if company else ""
        id_guid = (settings.horus_default_b2b_guid or "").strip()

        isbns_to_check = [
            re.sub(r"\D", "", str(l.ean_gtin or l.sku or ""))
            for l in listings
            if re.sub(r"\D", "", str(l.ean_gtin or l.sku or ""))
        ]

        horus_client = HorusProducts(db, company_id)
        try:
            # Consulta em lotes de 100 ISBNs sem AC_* para enxergar inclusive saldos zerados
            for idx in range(0, len(isbns_to_check), 100):
                batch = isbns_to_check[idx:idx + 100]
                payload_isbns = []
                for code in batch:
                    obj: Dict[str, Any] = {"BARRAS_ISBN": code}
                    if settings.horus_company:
                        obj["SD_COD_EMPRESA"] = settings.horus_company
                    if settings.horus_branch:
                        obj["SD_COD_FILIAL"] = settings.horus_branch
                    if getattr(settings, "horus_stock_local", None):
                        obj["SD_LOCAL_ESTOQUE"] = settings.horus_stock_local
                    payload_isbns.append(obj)

                params: Dict[str, Any] = {"ID_DOC": id_doc, "ID_GUID": id_guid}
                if not getattr(settings, "horus_legacy_pagination", False):
                    params["OFFSET"] = 0
                    params["LIMIT"] = 500

                resp = await horus_client.post("Busca_AcervoB2B", json_data=payload_isbns, params=params)
                if isinstance(resp, list):
                    for item in resp:
                        if not isinstance(item, dict) or item.get("Falha"):
                            continue
                        code_ret = re.sub(r"\D", "", str(item.get("BARRAS_ISBN") or item.get("COD_BARRA_ITEM") or ""))
                        raw_saldo = item.get("SALDO_DISPONIVEL") or 0
                        try:
                            saldo_int = max(0, int(float(str(raw_saldo).replace(",", "."))))
                        except Exception:
                            saldo_int = 0
                        if code_ret:
                            horus_stock_by_isbn[code_ret] = saldo_int
        except Exception as e:
            logger.warning("[MELI_STOCK_HORUS] Erro ao consultar lote no Horus para empresa %s: %s", company_id, e)
        finally:
            await horus_client.close()

    token: Optional[str] = None
    if settings.meli_access_token:
        try:
            token = await ensure_valid_meli_token(db, settings)
        except Exception:
            token = None

    updated_count = 0
    failed_count = 0

    async with httpx.AsyncClient(timeout=20.0) as client:
        for listing in listings:
            raw_qty = listing.current_stock
            if uses_horus and horus_stock_by_isbn:
                clean_ean = re.sub(r"\D", "", str(listing.ean_gtin or listing.sku or ""))
                # Se não retornou na consulta do Horus, assume 0 por segurança
                raw_qty = horus_stock_by_isbn.get(clean_ean, 0)
            elif listing.product_id:
                prod = db.query(Product).filter(Product.id == listing.product_id).first()
                if prod:
                    raw_qty = int(prod.stock_quantity or 0)

            target_stock = calculate_effective_stock(raw_qty, preset)
            target_status = "paused" if target_stock == 0 else "active"

            # Verifica Delta: só dispara requisição se o estoque mudou ou se force_all=True
            if not force_all and listing.last_synced_stock == target_stock and listing.status == target_status:
                continue

            listing.current_stock = target_stock
            if token and not listing.meli_item_id.startswith("MLB-DRAFT-"):
                try:
                    put_payload: Dict[str, Any] = {"available_quantity": target_stock}
                    if target_stock == 0 and listing.status == "active":
                        put_payload["status"] = "paused"
                    elif target_stock > 0 and listing.status == "paused":
                        put_payload["status"] = "active"

                    resp = await client.put(
                        f"{MELI_API_BASE}/items/{listing.meli_item_id}",
                        json=put_payload,
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    if resp.status_code == 200:
                        listing.last_synced_stock = target_stock
                        listing.status = put_payload.get("status", listing.status)
                        listing.sync_error = None
                        listing.last_synced_at = datetime.now(timezone.utc)
                        updated_count += 1
                    else:
                        listing.sync_error = f"Falha ao sincronizar estoque ({resp.status_code})"
                        failed_count += 1
                except Exception as e:
                    listing.sync_error = f"Erro de conexão: {str(e)}"
                    failed_count += 1
            else:
                listing.last_synced_stock = target_stock
                listing.status = target_status
                listing.last_synced_at = datetime.now(timezone.utc)
                updated_count += 1

    log_entry = MeliSyncLog(
        company_id=company_id,
        sync_type="STOCK_DELTA",
        status="SUCCESS" if failed_count == 0 else ("PARTIAL" if updated_count > 0 else "ERROR"),
        items_processed=len(listings),
        items_updated=updated_count,
        items_failed=failed_count,
        message=f"Sincronização Delta de estoque concluída ({'Horus ERP' if uses_horus else 'Catálogo Local'}): {updated_count} atualizado(s) de {len(listings)} monitorado(s).",
    )
    db.add(log_entry)
    db.commit()

    return {
        "processed": len(listings),
        "updated": updated_count,
        "failed": failed_count,
        "source": "HORUS" if uses_horus else "LOCAL",
        "message": log_entry.message,
    }


@router.post("/sync/stock")
async def trigger_stock_sync(
    force_all: bool = Query(False),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    return await execute_company_stock_delta_sync(db, cid, force_all=force_all)


# ─── 6. Recebimento de Pedidos, Webhook, Envio ao Horus (UPPERCASE) & Etiquetas

def _upsert_meli_order_into_cronuz(db: Session, company_id: int, raw_order: Dict[str, Any], billing_doc: str = "", buyer_full_name: str = "", shipping_info: Optional[Dict[str, Any]] = None) -> MeliOrder:
    meli_order_id = str(raw_order.get("id") or "")
    pack_id = str(raw_order.get("pack_id") or "") or None
    shipping_obj = raw_order.get("shipping") or {}
    shipment_id = str((shipping_info or {}).get("id") or shipping_obj.get("id") or "") or None
    status_val = str(raw_order.get("status") or "paid")

    buyer = raw_order.get("buyer") or {}
    buyer_id = str(buyer.get("id") or "")
    buyer_nick = str(buyer.get("nickname") or "")
    first_name = str(buyer.get("first_name") or "").strip()
    last_name = str(buyer.get("last_name") or "").strip()
    full_name = (buyer_full_name or f"{first_name} {last_name}".strip() or buyer_nick or "CLIENTE MERCADO LIVRE").strip()

    billing_info = buyer.get("billing_info") or {}
    doc_number = re.sub(r"\D", "", str(billing_doc or billing_info.get("doc_number") or ""))
    doc_type = "CNPJ" if len(doc_number) == 14 else "CPF"
    if not doc_number:
        doc_number = f"ML{buyer_id or meli_order_id}"[:20]

    total_amt = float(raw_order.get("total_amount") or 0.0)
    paid_amt = float(raw_order.get("paid_amount") or total_amt)

    order_items_raw = raw_order.get("order_items") or []
    parsed_items: List[Dict[str, Any]] = []
    total_fee = 0.0
    for oi in order_items_raw:
        if not isinstance(oi, dict):
            continue
        it = oi.get("item") or {}
        qty = int(oi.get("quantity") or 1)
        u_price = float(oi.get("unit_price") or 0.0)
        sale_fee = float(oi.get("sale_fee") or 0.0) * qty
        total_fee += sale_fee
        parsed_items.append({
            "meli_item_id": str(it.get("id") or ""),
            "title": str(it.get("title") or "Item Mercado Livre"),
            "sku": str(it.get("seller_sku") or it.get("seller_custom_field") or ""),
            "quantity": qty,
            "unit_price": u_price,
            "total_price": round(qty * u_price, 2),
        })

    addr_dict: Dict[str, Any] = {}
    shipping_status = "ready_to_ship"
    logistic_type = None
    if isinstance(shipping_info, dict):
        shipping_status = str(shipping_info.get("status") or shipping_status)
        logistic_type = shipping_info.get("logistic_type")
        rec_addr = shipping_info.get("receiver_address") or {}
        addr_dict = {
            "street": str(rec_addr.get("street_name") or ""),
            "number": str(rec_addr.get("street_number") or "S/N"),
            "complement": str(rec_addr.get("comment") or ""),
            "neighborhood": str((rec_addr.get("neighborhood") or {}).get("name") or "CENTRO"),
            "city": str((rec_addr.get("city") or {}).get("name") or ""),
            "state": str((rec_addr.get("state") or {}).get("id") or "").replace("BR-", ""),
            "zip_code": re.sub(r"\D", "", str(rec_addr.get("zip_code") or "")),
            "receiver_name": str(rec_addr.get("receiver_name") or full_name),
        }

    meli_ord = db.query(MeliOrder).filter(
        MeliOrder.company_id == company_id,
        MeliOrder.meli_order_id == meli_order_id
    ).first()

    if not meli_ord:
        meli_ord = MeliOrder(
            company_id=company_id,
            meli_order_id=meli_order_id,
            meli_pack_id=pack_id,
            meli_shipment_id=shipment_id,
            status=status_val,
            shipping_status=shipping_status,
            logistic_type=logistic_type,
            buyer_id=buyer_id,
            buyer_nickname=buyer_nick,
            buyer_name=full_name,
            buyer_doc_type=doc_type,
            buyer_doc_number=doc_number,
            total_amount=total_amt,
            paid_amount=paid_amt,
            meli_fee=round(total_fee, 2),
            items_json=parsed_items,
            shipping_address_json=addr_dict,
            raw_payload=raw_order,
            meli_created_at=datetime.now(timezone.utc),
        )
        db.add(meli_ord)
        db.flush()
    else:
        meli_ord.status = status_val
        meli_ord.shipping_status = shipping_status or meli_ord.shipping_status
        meli_ord.meli_shipment_id = shipment_id or meli_ord.meli_shipment_id
        meli_ord.buyer_name = full_name or meli_ord.buyer_name
        if doc_number and not doc_number.startswith("ML"):
            meli_ord.buyer_doc_number = doc_number
        if addr_dict:
            meli_ord.shipping_address_json = addr_dict

    # Cria o Cliente e o Pedido correspondente em ord_order do Cronuz se ainda não existir
    if not meli_ord.cronuz_order_id:
        customer = db.query(Customer).filter(
            Customer.company_id == company_id,
            Customer.document == doc_number
        ).first()
        if not customer:
            customer = Customer(
                company_id=company_id,
                name=full_name[:255],
                corporate_name=full_name[:255],
                document=doc_number,
                email=buyer.get("email") or f"{buyer_nick.lower()}@mercadolivre.com.br",
                customer_type="PJ" if len(doc_number) == 14 else "PF",
                city=addr_dict.get("city") or None,
                state=addr_dict.get("state") or None,
            )
            db.add(customer)
            db.flush()
            if addr_dict.get("street") and addr_dict.get("city"):
                db.add(Address(
                    customer_id=customer.id,
                    street=addr_dict.get("street")[:255],
                    number=addr_dict.get("number")[:50] or "S/N",
                    complement=(addr_dict.get("complement") or "")[:100],
                    neighborhood=(addr_dict.get("neighborhood") or "CENTRO")[:100],
                    city=addr_dict.get("city")[:100],
                    state=(addr_dict.get("state") or "SP")[:2],
                    zip_code=(addr_dict.get("zip_code") or "00000000")[:20],
                    type="MAIN",
                ))

        ext_ref = f"ML-{meli_order_id}"
        existing_ord = db.query(Order).filter(
            Order.company_id == company_id,
            Order.external_id == ext_ref
        ).first()

        if not existing_ord:
            new_ord = Order(
                company_id=company_id,
                customer_id=customer.id,
                status="PROCESSING" if status_val == "paid" else "NEW",
                type_order="V",
                origin="ml",
                customer_order_ref=meli_order_id,
                external_id=ext_ref,
                partner_reference=pack_id or meli_order_id,
                subtotal=total_amt,
                discount=0.0,
                total=total_amt,
                payment_condition="MERCADO_PAGO",
                confirmed_at=datetime.utcnow(),
            )
            db.add(new_ord)
            db.flush()

            for pi in parsed_items:
                linked_listing = db.query(MeliListing).filter(
                    MeliListing.company_id == company_id,
                    MeliListing.meli_item_id == pi["meli_item_id"]
                ).first()
                prod_id = linked_listing.product_id if linked_listing else None
                ean_isbn = (linked_listing.ean_gtin if linked_listing else None) or pi["sku"]

                db.add(OrderItem(
                    order_id=new_ord.id,
                    product_id=prod_id,
                    ean_isbn=ean_isbn,
                    sku=pi["sku"] or ean_isbn,
                    name=pi["title"][:255],
                    quantity=pi["quantity"],
                    quantity_requested=pi["quantity"],
                    quantity_fulfilled=pi["quantity"],
                    unit_price=pi["unit_price"],
                    total_price=pi["total_price"],
                ))

                # Abate do estoque local imediatamente
                if prod_id:
                    prod = db.query(Product).filter(Product.id == prod_id).first()
                    if prod and prod.stock_quantity is not None:
                        prod.stock_quantity = max(0, int(prod.stock_quantity) - int(pi["quantity"]))
                if linked_listing:
                    linked_listing.current_stock = max(0, int(linked_listing.current_stock or 0) - int(pi["quantity"]))

            meli_ord.cronuz_order_id = new_ord.id
        else:
            meli_ord.cronuz_order_id = existing_ord.id

    db.commit()
    db.refresh(meli_ord)
    return meli_ord


@router.post("/orders/sync")
async def sync_meli_orders(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    """
    Busca os pedidos recentes da conta do Seller no Mercado Livre (/orders/search),
    importa comprador, CPF/CNPJ, endereço de entrega e cria os pedidos no Cronuz.
    """
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)
    token = await ensure_valid_meli_token(db, settings)

    if not settings.meli_user_id:
        raise HTTPException(status_code=400, detail="Usuário do Mercado Livre não configurado. Teste a conexão nas Pré-Configurações.")

    synced_count = 0
    async with httpx.AsyncClient(timeout=25.0) as client:
        resp = await client.get(
            f"{MELI_API_BASE}/orders/search",
            params={"seller": settings.meli_user_id, "sort": "date_desc", "limit": 30},
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Não foi possível consultar os pedidos no Mercado Livre neste momento.")

        results = resp.json().get("results") or []
        for raw_ord in results:
            if not isinstance(raw_ord, dict) or not raw_ord.get("id"):
                continue
            ord_id = str(raw_ord.get("id"))
            billing_doc = ""
            buyer_full_name = ""
            try:
                b_resp = await client.get(
                    f"{MELI_API_BASE}/orders/{ord_id}/billing_info",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if b_resp.status_code == 200:
                    b_info = (b_resp.json() or {}).get("billing_info") or {}
                    billing_doc = str(b_info.get("doc_number") or "")
                    add_info = b_info.get("additional_info") or []
                    fn = ""
                    ln = ""
                    for entry in add_info:
                        if isinstance(entry, dict):
                            if entry.get("type") == "FIRST_NAME":
                                fn = entry.get("value") or ""
                            elif entry.get("type") == "LAST_NAME":
                                ln = entry.get("value") or ""
                    buyer_full_name = f"{fn} {ln}".strip()
            except Exception:
                pass

            ship_info = None
            ship_id = ((raw_ord.get("shipping") or {}).get("id"))
            if ship_id:
                try:
                    s_resp = await client.get(
                        f"{MELI_API_BASE}/shipments/{ship_id}",
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    if s_resp.status_code == 200:
                        ship_info = s_resp.json()
                except Exception:
                    pass

            _upsert_meli_order_into_cronuz(db, cid, raw_ord, billing_doc, buyer_full_name, ship_info)
            synced_count += 1

    db.add(MeliSyncLog(
        company_id=cid,
        sync_type="ORDER_SYNC",
        status="SUCCESS",
        items_processed= synced_count,
        items_updated=synced_count,
        items_failed=0,
        message=f"Sincronização de pedidos Mercado Livre concluída: {synced_count} pedido(s) verificado(s).",
    ))
    db.commit()

    return {
        "message": f"{synced_count} pedido(s) do Mercado Livre sincronizado(s) com sucesso!",
        "synced_count": synced_count,
    }


@router.post("/orders/{meli_order_db_id}/send-to-horus")
async def send_meli_order_to_horus(
    meli_order_db_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    """
    Envia um pedido do Mercado Livre para o Horus ERP (InsPedidoVenda + InsItensPedidoVenda).
    REGRA MANDATÓRIA 11: Todos os campos textuais são enviados em CAIXA ALTA (.strip().upper()).
    """
    cid = _resolve_company_id(current_user, company_id)
    company = db.query(Company).filter(Company.id == cid).first()
    settings = _get_or_create_settings(db, cid)
    preset = get_merged_preset(settings)

    meli_ord = db.query(MeliOrder).filter(MeliOrder.id == meli_order_db_id, MeliOrder.company_id == cid).first()
    if not meli_ord:
        raise HTTPException(status_code=404, detail="Pedido do Mercado Livre não encontrado.")

    if not settings.horus_enabled:
        raise HTTPException(status_code=400, detail="A integração Horus ERP não está ativa para esta empresa.")

    from app.integrators.horus_orders import HorusOrders

    id_doc = re.sub(r"\D", "", str(preset.get("horus_default_customer_doc") or meli_ord.buyer_doc_number or ""))
    id_guid = str(preset.get("horus_default_customer_guid") or settings.horus_default_b2b_guid or "").strip().upper()
    cnpj_destino = re.sub(r"\D", "", str(company.document or "")) if company else ""
    cod_origem = f"ML{meli_ord.meli_order_id}".strip().upper()
    obs_pedido = f"PEDIDO MERCADO LIVRE #{meli_ord.meli_order_id} - COMPRADOR: {(meli_ord.buyer_name or '').strip()}".upper()

    horus_orders = HorusOrders(db, cid)
    try:
        res_header = await horus_orders.send_order(
            id_doc=id_doc,
            id_guid=id_guid,
            cnpj_destino=cnpj_destino,
            cod_pedido_origem=cod_origem,
            type_order="V",
            obs=obs_pedido,
        )
        if res_header.get("error"):
            meli_ord.sync_error = str(res_header.get("msg") or "Falha ao criar capa do pedido no Horus")
            db.commit()
            raise HTTPException(status_code=400, detail=meli_ord.sync_error)

        cod_ped_venda = str(res_header.get("COD_PED_VENDA") or "").strip()
        items = meli_ord.items_json or []
        for it in items:
            isbn_val = str(it.get("sku") or "").strip().upper()
            qty_val = int(it.get("quantity") or 1)
            price_val = float(it.get("unit_price") or 0.0)
            await horus_orders.send_order_item(
                id_doc=id_doc,
                id_guid=id_guid,
                cnpj_destino=cnpj_destino,
                cod_pedido_origem=cod_origem,
                isbn=isbn_val,
                qty=qty_val,
                price=price_val,
            )

        meli_ord.horus_pedido_venda = cod_ped_venda
        meli_ord.sync_error = None
        if meli_ord.cronuz_order_id:
            ord_obj = db.query(Order).filter(Order.id == meli_ord.cronuz_order_id).first()
            if ord_obj:
                ord_obj.horus_pedido_venda = cod_ped_venda
                ord_obj.status = "SENT_TO_HORUS"
        db.commit()
        return {
            "message": f"Pedido enviado para o Horus ERP com sucesso! Nº Horus: {cod_ped_venda}",
            "horus_pedido_venda": cod_ped_venda,
        }
    finally:
        await horus_orders.close()


@router.get("/orders")
def list_meli_orders(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    base_q = db.query(MeliOrder).filter(MeliOrder.company_id == cid)

    total_orders = base_q.count()
    total_revenue = db.query(func.coalesce(func.sum(MeliOrder.total_amount), 0.0)).filter(
        MeliOrder.company_id == cid,
        MeliOrder.status != "cancelled"
    ).scalar() or 0.0
    ready_to_ship = base_q.filter(MeliOrder.shipping_status == "ready_to_ship").count()
    sent_to_horus = base_q.filter(MeliOrder.horus_pedido_venda.isnot(None)).count()

    q = base_q
    if status and status != "ALL":
        q = q.filter(MeliOrder.status == status)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                MeliOrder.meli_order_id.ilike(term),
                MeliOrder.buyer_name.ilike(term),
                MeliOrder.buyer_nickname.ilike(term),
                MeliOrder.buyer_doc_number.ilike(term),
            )
        )

    rows = q.order_by(MeliOrder.created_at.desc(), MeliOrder.id.desc()).offset(skip).limit(limit).all()

    return {
        "kpis": {
            "total_orders": total_orders,
            "total_revenue": round(float(total_revenue), 2),
            "ready_to_ship": ready_to_ship,
            "sent_to_horus": sent_to_horus,
        },
        "items": [
            {
                "id": r.id,
                "meli_order_id": r.meli_order_id,
                "meli_pack_id": r.meli_pack_id,
                "meli_shipment_id": r.meli_shipment_id,
                "status": r.status,
                "shipping_status": r.shipping_status,
                "logistic_type": r.logistic_type,
                "buyer_nickname": r.buyer_nickname,
                "buyer_name": r.buyer_name,
                "buyer_doc_type": r.buyer_doc_type,
                "buyer_doc_number": r.buyer_doc_number,
                "total_amount": r.total_amount,
                "meli_fee": r.meli_fee,
                "cronuz_order_id": r.cronuz_order_id,
                "horus_pedido_venda": r.horus_pedido_venda,
                "invoice_xml_sent": r.invoice_xml_sent,
                "items_json": r.items_json or [],
                "shipping_address_json": r.shipping_address_json or {},
                "sync_error": r.sync_error,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.get("/orders/{meli_order_db_id}/shipping-label")
async def download_meli_shipping_label(
    meli_order_db_id: int,
    response_type: str = Query("pdf", description="pdf ou zpl2"),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    meli_ord = db.query(MeliOrder).filter(MeliOrder.id == meli_order_db_id, MeliOrder.company_id == cid).first()
    if not meli_ord or not meli_ord.meli_shipment_id:
        raise HTTPException(status_code=400, detail="Este pedido não possui código de envio (Shipment ID) do Mercado Envios.")

    settings = _get_or_create_settings(db, cid)
    token = await ensure_valid_meli_token(db, settings)

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            f"{MELI_API_BASE}/shipment_labels",
            params={"shipment_ids": meli_ord.meli_shipment_id, "response_type": response_type, "savePdf": "Y"},
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail="Etiqueta ainda não liberada pelo Mercado Envios (verifique se a NF-e já foi recepcionada ou se o envio está com status Pronto para Envio)."
            )
        media_type = "application/pdf" if response_type == "pdf" else "application/zip"
        ext = "pdf" if response_type == "pdf" else "zip"
        return Response(
            content=resp.content,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="etiqueta_ml_{meli_ord.meli_order_id}.{ext}"'},
        )


@router.get("/logs")
def list_meli_sync_logs(
    limit: int = Query(30, ge=1, le=100),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    logs = (
        db.query(MeliSyncLog)
        .filter(MeliSyncLog.company_id == cid)
        .order_by(MeliSyncLog.created_at.desc(), MeliSyncLog.id.desc())
        .limit(limit)
        .all()
    )
    return {
        "items": [
            {
                "id": l.id,
                "sync_type": l.sync_type,
                "status": l.status,
                "items_processed": l.items_processed,
                "items_updated": l.items_updated,
                "items_failed": l.items_failed,
                "message": l.message,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ]
    }


# ─── 7. Webhook Público Oficial do Mercado Livre (orders_v2 / shipments) ─────

async def _process_meli_webhook_background(payload: Dict[str, Any]):
    topic = str(payload.get("topic") or "")
    resource = str(payload.get("resource") or "")
    user_id = str(payload.get("user_id") or "")
    if not user_id or topic not in ("orders_v2", "orders"):
        return

    db = SessionLocal()
    try:
        settings = db.query(CompanySettings).filter(CompanySettings.meli_user_id == user_id).first()
        if not settings or not settings.meli_enabled:
            return
        token = await ensure_valid_meli_token(db, settings)
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(f"{MELI_API_BASE}{resource}", headers={"Authorization": f"Bearer {token}"})
            if resp.status_code == 200:
                raw_order = resp.json()
                _upsert_meli_order_into_cronuz(db, settings.company_id, raw_order)
    except Exception as e:
        logger.warning("[MELI_WEBHOOK] Erro ao processar notificação %s: %s", resource, e)
    finally:
        db.close()


@router.post("/webhook")
async def meli_webhook_receiver(request: Request, background_tasks: BackgroundTasks):
    """
    Endpoint público de baixa latência (responde HTTP 200 em < 50ms conforme exigido pelo Mercado Livre)
    e enfileira o processamento do pedido em background.
    """
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    if isinstance(payload, dict) and payload.get("user_id"):
        background_tasks.add_task(_process_meli_webhook_background, payload)
    return {"status": "ok"}


def run_mercadolivre_stock_sync_job():
    """
    Job agendado (APScheduler): executa sincronização Delta de estoque Horus/Cronuz -> Mercado Livre
    para empresas com module_mercadolivre ativo e auto_sync_stock habilitado.
    """
    import asyncio
    db = SessionLocal()
    try:
        active_settings = (
            db.query(CompanySettings)
            .join(Company, Company.id == CompanySettings.company_id)
            .filter(
                Company.active == True,
                Company.module_mercadolivre == True,
                CompanySettings.meli_enabled == True,
            )
            .all()
        )
        for s in active_settings:
            preset = get_merged_preset(s)
            if not preset.get("auto_sync_stock", True):
                continue
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(execute_company_stock_delta_sync(db, s.company_id, force_all=False))
                loop.close()
            except Exception as e_inner:
                logger.warning("[MELI_JOB] Erro ao sincronizar estoque da empresa %s: %s", s.company_id, e_inner)
    except Exception as e:
        logger.warning("[MELI_JOB] Erro geral no job Mercado Livre: %s", e)
    finally:
        db.close()

