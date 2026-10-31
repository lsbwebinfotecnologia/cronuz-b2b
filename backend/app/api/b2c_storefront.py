import re
import uuid
import logging
from datetime import datetime, date, timezone
from decimal import Decimal
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.dependencies import get_current_user, get_current_user_optional
from app.core import security
from app.models.user import User
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.customer import Customer, Address
from app.models.product import Product
from app.models.order import Order, OrderItem
from app.models.b2c_storefront import (
    B2CCouponBatch,
    B2CCoupon,
    B2CCouponRedemption,
    B2CLgpdConsent,
)
from app.integrators.tray_client import (
    TrayClient,
    get_global_tray_app_credentials,
    save_global_tray_app_credentials,
)
from app.api.storefront import _fetch_from_horus_storefront, calculate_product_availability

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/b2c", tags=["b2c_storefront"])


def _clean_digits(val: Optional[str]) -> str:
    return re.sub(r"\D", "", str(val or ""))


def _generate_unique_code(prefix: str = "VOUCHER") -> str:
    clean_prefix = re.sub(r"[^A-Z0-9]", "", (prefix or "VOUCHER").upper())[:10] or "VOUCHER"
    suffix = uuid.uuid4().hex[:6].upper()
    return f"{clean_prefix}-{suffix}"


# ══════════════════════════════════════════════════════════════════════════════
# SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════

class GlobalTrayAppRequest(BaseModel):
    app_name: Optional[str] = "App Cronuz Tray"
    consumer_key: str
    consumer_secret: str


class EmployeeRecipientItem(BaseModel):
    name: Optional[str] = None
    cpf: Optional[str] = None
    email: Optional[str] = None


class CouponBatchCreateRequest(BaseModel):
    name: str
    partner_company_name: Optional[str] = None
    partner_document: Optional[str] = None
    batch_mode: str = "INDIVIDUAL_CODES"  # INDIVIDUAL_CODES or SHARED_CPF_LIMIT
    code_prefix: Optional[str] = "BENEFICIO"
    shared_code: Optional[str] = None
    quantity: int = Field(default=10, ge=1, le=5000)
    coupon_value: float = Field(..., gt=0)
    discount_type: str = "FIXED_BRL"  # FIXED_BRL or PERCENTAGE
    allows_freight_discount: bool = True
    allow_residual_balance: bool = True
    min_order_value: float = 0.0
    valid_from: Optional[date] = None
    valid_until: Optional[date] = None
    notes: Optional[str] = None
    employees: Optional[List[EmployeeRecipientItem]] = None


class SingleCouponCreateRequest(BaseModel):
    code: Optional[str] = None
    initial_value: float = Field(..., gt=0)
    discount_type: str = "FIXED_BRL"
    max_uses: int = Field(default=1, ge=1, le=10000)
    allows_freight_discount: bool = True
    allow_residual_balance: bool = True
    min_order_value: float = 0.0
    assigned_name: Optional[str] = None
    assigned_cpf: Optional[str] = None
    assigned_email: Optional[str] = None
    valid_from: Optional[date] = None
    valid_until: Optional[date] = None


class B2CSettingsUpdateRequest(BaseModel):
    b2c_custom_domain: Optional[str] = None
    b2c_storefront_open: Optional[bool] = None
    b2c_checkout_mode: Optional[str] = None
    b2c_lgpd_terms_text: Optional[str] = None
    b2c_default_freight_value: Optional[float] = None
    b2c_free_shipping_min_value: Optional[float] = None
    b2c_showcases_config: Optional[Dict[str, Any]] = None
    tray_enabled: Optional[bool] = None
    tray_store_url: Optional[str] = None
    tray_auth_code: Optional[str] = None


class B2CAppearanceUpdateRequest(BaseModel):
    branding: Optional[Dict[str, Any]] = None
    banners: Optional[List[Dict[str, Any]]] = None
    showcases: Optional[List[Dict[str, Any]]] = None
    categories: Optional[List[Dict[str, Any]]] = None
    promotions: Optional[List[Dict[str, Any]]] = None
    footer_info: Optional[Dict[str, Any]] = None
    b2c_custom_domain: Optional[str] = None


class B2CContactMessageRequest(BaseModel):
    company_id: int
    name: str
    email: str
    phone: Optional[str] = None
    subject: Optional[str] = "Atendimento Loja Virtual"
    message: str



class CouponValidateRequest(BaseModel):
    company_id: int
    code: str
    customer_cpf: Optional[str] = None
    subtotal: float = Field(..., ge=0)
    freight: float = Field(default=0.0, ge=0)


class FreightCalculateRequest(BaseModel):
    company_id: int
    zip_code: str
    subtotal: float = Field(default=0.0, ge=0)
    items_count: int = Field(default=1, ge=1)


class B2CCartItemInput(BaseModel):
    product_id: Optional[int] = None
    sku: str
    ean_gtin: Optional[str] = None
    name: str
    author: Optional[str] = None
    brand: Optional[str] = None
    unit_price: float
    quantity: int = Field(default=1, ge=1)


class B2CCheckoutRequest(BaseModel):
    company_id: int
    customer_name: str
    customer_cpf: str
    customer_email: str
    customer_phone: Optional[str] = None
    customer_password: Optional[str] = None
    zip_code: str
    street: str
    number: str
    complement: Optional[str] = None
    neighborhood: str
    city: str
    state: str
    items: List[B2CCartItemInput]
    freight_value: float = 0.0
    freight_service_name: Optional[str] = "Entrega Padrão"
    coupon_code: Optional[str] = None
    payment_method: Optional[str] = "PIX"  # PIX, CREDIT_CARD, TRAY, VOUCHER_100
    lgpd_accepted: bool = True
    marketing_opt_in: bool = False
    terms_version: str = "v1.0"


# ══════════════════════════════════════════════════════════════════════════════
# 1. TRAY E-COMMERCE CONNECTION & WEBHOOK ENDPOINTS (MASTER & SELLER)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/tray/global-app")
def get_master_global_tray_app(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.type != "MASTER":
        raise HTTPException(status_code=403, detail="Apenas usuários Master podem consultar as credenciais universais do App Tray.")
    return get_global_tray_app_credentials(db)


@router.put("/tray/global-app")
def update_master_global_tray_app(
    data: GlobalTrayAppRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.type != "MASTER":
        raise HTTPException(status_code=403, detail="Apenas usuários Master podem alterar as credenciais universais do App Tray.")
    saved = save_global_tray_app_credentials(
        db=db,
        consumer_key=data.consumer_key,
        consumer_secret=data.consumer_secret,
        app_name=data.app_name or "App Cronuz Tray",
    )
    return {
        "message": "Credenciais universais do App Cronuz na Tray salvas com sucesso!",
        **saved,
    }


@router.post("/tray/test-connection/{company_id}")
async def test_tray_connection(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.type != "MASTER" and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Sem permissão para testar integração desta empresa.")

    client = TrayClient(db, company_id)
    try:
        res = await client.test_connection()
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tray/authenticate/{company_id}")
async def authenticate_tray_store(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.type != "MASTER" and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Sem permissão.")

    client = TrayClient(db, company_id)
    try:
        token_data = await client.authenticate_with_code()
        return {
            "message": "Autenticado com sucesso na API da Tray!",
            "store_id": client.settings.tray_store_id if client.settings else None,
            "api_address": client.settings.tray_api_address if client.settings else None,
            "token_expires_at": (
                client.settings.tray_token_expires_at.isoformat()
                if client.settings and client.settings.tray_token_expires_at
                else None
            ),
            "raw": token_data,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tray/webhook/{company_id}")
async def tray_order_webhook(
    company_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Recebe notificações da Tray quando o pedido redirecionado é finalizado lá.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    session_id = body.get("session_id") or body.get("scope_id")
    if session_id:
        redemption = (
            db.query(B2CCouponRedemption)
            .filter(
                B2CCouponRedemption.company_id == company_id,
                B2CCouponRedemption.tray_cart_session_id == str(session_id),
            )
            .first()
        )
        if redemption:
            redemption.status = "COMPLETED"
            if redemption.order_id:
                ord_obj = db.query(Order).filter(Order.id == redemption.order_id).first()
                if ord_obj and ord_obj.status == "NEW":
                    ord_obj.status = "PROCESSING"
            db.commit()

    return {"status": "ok"}


# ══════════════════════════════════════════════════════════════════════════════
# 2. SELLER PANEL — COUPON BATCHES, INDIVIDUAL COUPONS, AUDITING & LGPD
# ══════════════════════════════════════════════════════════════════════════════

def _resolve_seller_company_id(current_user: User, company_id_param: Optional[int] = None) -> int:
    if current_user.type == "MASTER" and company_id_param:
        return company_id_param
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="Usuário não vinculado a uma empresa.")
    return current_user.company_id


@router.get("/coupons/summary")
def get_b2c_coupons_summary(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)

    total_batches = db.query(func.count(B2CCouponBatch.id)).filter(B2CCouponBatch.company_id == cid).scalar() or 0
    coupons = db.query(B2CCoupon).filter(B2CCoupon.company_id == cid).all()

    total_coupons = len(coupons)
    available_coupons = sum(1 for c in coupons if c.status == "AVAILABLE")
    partially_used = sum(1 for c in coupons if c.status == "PARTIALLY_USED")
    exhausted = sum(1 for c in coupons if c.status == "EXHAUSTED")
    residual_generated = sum(1 for c in coupons if c.coupon_mode == "RESIDUAL")

    # Exclude child residual coupons from initial_value sum to avoid double counting the original budget
    total_issued_value = sum(
        float(c.initial_value or 0) for c in coupons if c.coupon_mode != "RESIDUAL" and c.status != "CANCELLED"
    )
    total_used_value = sum(float(c.used_amount or 0) for c in coupons if c.status != "CANCELLED")
    total_remaining_balance = sum(
        float(c.current_balance or 0) for c in coupons if c.status in ("AVAILABLE", "PARTIALLY_USED")
    )

    total_redemptions = (
        db.query(func.count(B2CCouponRedemption.id)).filter(B2CCouponRedemption.company_id == cid).scalar() or 0
    )
    total_lgpd_consents = (
        db.query(func.count(B2CLgpdConsent.id)).filter(B2CLgpdConsent.company_id == cid).scalar() or 0
    )

    total_b2c_orders = (
        db.query(func.count(Order.id))
        .filter(Order.company_id == cid, Order.origin == "b2c_storefront")
        .scalar()
        or 0
    )

    company = db.query(Company).filter(Company.id == cid).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()

    return {
        "total_batches": total_batches,
        "total_coupons": total_coupons,
        "available_coupons": available_coupons,
        "partially_used_coupons": partially_used,
        "exhausted_coupons": exhausted,
        "residual_generated_coupons": residual_generated,
        "total_issued_value": round(total_issued_value, 2),
        "total_used_value": round(total_used_value, 2),
        "total_remaining_balance": round(total_remaining_balance, 2),
        "total_redemptions": total_redemptions,
        "total_b2c_orders": total_b2c_orders,
        "total_lgpd_consents": total_lgpd_consents,
        "settings": {
            "b2c_custom_domain": getattr(company, "b2c_custom_domain", None) if company else None,
            "domain": company.domain if company else None,
            "custom_domain": company.custom_domain if company else None,
            "module_b2c_storefront": bool(getattr(company, "module_b2c_storefront", False)) if company else False,
            "b2c_storefront_open": bool(getattr(settings, "b2c_storefront_open", False)) if settings else False,
            "b2c_checkout_mode": getattr(settings, "b2c_checkout_mode", "NATIVE_GATEWAY") if settings else "NATIVE_GATEWAY",
            "b2c_lgpd_terms_text": getattr(settings, "b2c_lgpd_terms_text", None) if settings else None,
            "b2c_default_freight_value": float(getattr(settings, "b2c_default_freight_value", 0) or 0) if settings else 0.0,
            "b2c_free_shipping_min_value": float(getattr(settings, "b2c_free_shipping_min_value", 0) or 0) if settings else 0.0,
            "tray_enabled": bool(getattr(settings, "tray_enabled", False)) if settings else False,
            "tray_store_url": getattr(settings, "tray_store_url", None) if settings else None,
            "tray_auth_code": getattr(settings, "tray_auth_code", None) if settings else None,
            "tray_store_id": getattr(settings, "tray_store_id", None) if settings else None,
            "payment_gateway_active": getattr(settings, "payment_gateway_active", "EFI") if settings else "EFI",
        },
    }


@router.put("/settings")
def update_b2c_seller_settings(
    data: B2CSettingsUpdateRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    company = db.query(Company).filter(Company.id == cid).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    if not settings:
        settings = CompanySettings(company_id=cid)
        db.add(settings)

    if data.b2c_custom_domain is not None and company:
        clean_dom = data.b2c_custom_domain.strip().lower()
        clean_dom = re.sub(r"^https?://", "", clean_dom).rstrip("/")
        company.b2c_custom_domain = clean_dom or None

    if data.b2c_storefront_open is not None:
        settings.b2c_storefront_open = data.b2c_storefront_open
    if data.b2c_checkout_mode is not None:
        settings.b2c_checkout_mode = data.b2c_checkout_mode
    if data.b2c_lgpd_terms_text is not None:
        settings.b2c_lgpd_terms_text = data.b2c_lgpd_terms_text
    if data.b2c_default_freight_value is not None:
        settings.b2c_default_freight_value = Decimal(str(round(data.b2c_default_freight_value, 2)))
    if data.b2c_free_shipping_min_value is not None:
        settings.b2c_free_shipping_min_value = Decimal(str(round(data.b2c_free_shipping_min_value, 2)))
    if data.b2c_showcases_config is not None:
        settings.b2c_showcases_config = data.b2c_showcases_config
    if data.tray_enabled is not None:
        settings.tray_enabled = data.tray_enabled
    if data.tray_store_url is not None:
        clean_tray_url = data.tray_store_url.strip().rstrip("/")
        if clean_tray_url and not clean_tray_url.startswith("http"):
            clean_tray_url = f"https://{clean_tray_url}"
        settings.tray_store_url = clean_tray_url or None
        if clean_tray_url and not settings.tray_api_address:
            settings.tray_api_address = f"{clean_tray_url}/web_api"
    if data.tray_auth_code is not None:
        settings.tray_auth_code = data.tray_auth_code.strip() or None

    db.commit()
    _b2c_cache_clear(cid)
    return {"message": "Configurações do Storefront B2C atualizadas com sucesso!"}


def _slugify_store_name(name: Optional[str], company_id: int) -> str:
    import unicodedata
    raw = str(name or f"loja-{company_id}").strip().lower()
    norm = unicodedata.normalize("NFKD", raw).encode("ASCII", "ignore").decode("ASCII")
    slug = re.sub(r"[^a-z0-9]+", "-", norm).strip("-")
    return slug or f"loja-{company_id}"


import time as _time
import json as _json

# ==============================================================================
# MOTOR DE CACHE DE ALTA PERFORMANCE DA LOJA B2C (GERENCIADO PELO SELLER)
# ==============================================================================
_B2C_STORE_CACHE: Dict[int, Dict[str, Dict[str, Any]]] = {}
_B2C_CACHE_STATS: Dict[int, Dict[str, Any]] = {}


def _get_b2c_cache_settings(settings: Optional[CompanySettings]) -> Dict[str, Any]:
    raw_cfg = getattr(settings, "b2c_showcases_config", None) if settings else None
    cache_cfg = (
        raw_cfg.get("cache_config")
        if isinstance(raw_cfg, dict) and isinstance(raw_cfg.get("cache_config"), dict)
        else {}
    )
    return {
        "enabled": bool(cache_cfg.get("enabled", True)),
        "ttl_seconds": int(cache_cfg.get("ttl_seconds", 1800) or 1800),
    }


def _ensure_company_cache_stats(company_id: int) -> Dict[str, Any]:
    if company_id not in _B2C_CACHE_STATS:
        _B2C_CACHE_STATS[company_id] = {
            "hits": 0,
            "misses": 0,
            "last_cleared_at": None,
            "last_warmup_at": None,
        }
    return _B2C_CACHE_STATS[company_id]


def _b2c_cache_get(
    company_id: int, cache_key: str, settings: Optional[CompanySettings]
) -> Optional[Any]:
    cfg = _get_b2c_cache_settings(settings)
    stats = _ensure_company_cache_stats(company_id)
    if not cfg["enabled"]:
        return None
    bucket = _B2C_STORE_CACHE.get(company_id)
    if not bucket or cache_key not in bucket:
        stats["misses"] = stats.get("misses", 0) + 1
        return None
    entry = bucket[cache_key]
    if _time.time() > float(entry.get("expires_at", 0)):
        bucket.pop(cache_key, None)
        stats["misses"] = stats.get("misses", 0) + 1
        return None
    stats["hits"] = stats.get("hits", 0) + 1
    entry["hits"] = int(entry.get("hits", 0)) + 1
    return entry.get("data")


def _b2c_cache_set(
    company_id: int,
    cache_key: str,
    data: Any,
    settings: Optional[CompanySettings],
    label: str = "",
) -> None:
    cfg = _get_b2c_cache_settings(settings)
    if not cfg["enabled"]:
        return
    if company_id not in _B2C_STORE_CACHE:
        _B2C_STORE_CACHE[company_id] = {}
    bucket = _B2C_STORE_CACHE[company_id]
    # Limit max keys per company to 250 to protect server RAM
    if len(bucket) >= 250 and cache_key not in bucket:
        oldest_key = min(bucket.keys(), key=lambda k: bucket[k].get("expires_at", 0))
        bucket.pop(oldest_key, None)
    now_ts = _time.time()
    bucket[cache_key] = {
        "data": data,
        "label": label or cache_key,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": now_ts + max(60, cfg["ttl_seconds"]),
        "hits": 0,
    }


def _b2c_cache_clear(company_id: int) -> int:
    bucket = _B2C_STORE_CACHE.pop(company_id, {})
    removed = len(bucket)
    stats = _ensure_company_cache_stats(company_id)
    stats["last_cleared_at"] = datetime.now(timezone.utc).isoformat()
    return removed


def _apply_b2c_promotions_to_items(
    items: List[Dict[str, Any]], promotions: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Aplica regras de preço promocional B2C (De/Por) com validade por Categoria, Editora, Produtos (SKU/ISBN) ou Todo o Catálogo,
    e garante que `allow_purchase=True` nos itens da vitrine aberta B2C.
    """
    if not items:
        return []

    today_str = date.today().isoformat()
    active_rules: List[Dict[str, Any]] = []
    for p in (promotions or []):
        if not isinstance(p, dict) or p.get("active") is False:
            continue
        vf = (p.get("valid_from") or "").strip()
        vu = (p.get("valid_until") or "").strip()
        if vf and today_str < vf:
            continue
        if vu and today_str > vu:
            continue
        val = float(p.get("discount_value") or 0)
        if val <= 0:
            continue
        active_rules.append(p)

    result = []
    for raw_item in items:
        item = dict(raw_item)
        # Na loja aberta B2C, habilitar o botão Comprar para todos os itens exibidos
        item["allow_purchase"] = True

        base_price = float(item.get("base_price") or 0)
        if base_price <= 0 or not active_rules:
            result.append(item)
            continue

        existing_promo = float(item.get("promotional_price") or 0)
        best_price = existing_promo if (0 < existing_promo < base_price) else base_price
        best_rule: Optional[Dict[str, Any]] = None

        item_sku = str(item.get("sku") or "").strip().upper()
        item_isbn = str(item.get("ean_gtin") or "").strip().upper()
        item_brand = str(item.get("brand") or "").strip().upper()
        cat_obj = item.get("category")
        item_cat = (
            str(cat_obj.get("name") if isinstance(cat_obj, dict) else (cat_obj or "")).strip().upper()
        )

        for rule in active_rules:
            t_type = str(rule.get("target_type") or "ALL").upper()
            t_val = str(rule.get("target_value") or "").strip().upper()
            p_codes = [
                str(c).strip().upper()
                for c in (rule.get("product_codes") or [])
                if str(c).strip()
            ]
            if t_val and t_type == "PRODUCTS":
                p_codes.extend([c.strip().upper() for c in re.split(r"[,;\s\n]+", t_val) if c.strip()])

            matched = False
            if t_type == "ALL":
                matched = True
            elif t_type == "CATEGORY" and t_val:
                if t_val in item_cat or (item_cat and item_cat in t_val):
                    matched = True
            elif t_type == "BRAND" and t_val:
                if t_val in item_brand or (item_brand and item_brand in t_val):
                    matched = True
            elif t_type == "PRODUCTS" and p_codes:
                if (item_sku and item_sku in p_codes) or (item_isbn and item_isbn in p_codes):
                    matched = True

            if matched:
                d_type = str(rule.get("discount_type") or "PERCENTAGE").upper()
                d_val = float(rule.get("discount_value") or 0)
                if d_type == "PERCENTAGE":
                    cand_price = round(base_price * (1.0 - min(d_val, 95.0) / 100.0), 2)
                else:
                    cand_price = round(max(0.50, base_price - d_val), 2)

                if 0 < cand_price < best_price:
                    best_price = cand_price
                    best_rule = rule

        if best_price < base_price:
            item["promotional_price"] = best_price
            item["discount_percent"] = max(1, int(round(((base_price - best_price) / base_price) * 100)))
            if best_rule:
                item["promotion_name"] = best_rule.get("name") or "Oferta Especial"
                item["promotion_valid_until"] = best_rule.get("valid_until") or None
        result.append(item)

    return result


def _format_cnpj_display(doc: Optional[str]) -> str:
    digits = re.sub(r"\D", "", str(doc or ""))
    if len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    return str(doc or "")


def _build_b2c_appearance_config(company: Company, settings: Optional[CompanySettings], db: Session) -> Dict[str, Any]:
    raw_cfg = getattr(settings, "b2c_showcases_config", None) if settings else None
    if not isinstance(raw_cfg, dict):
        raw_cfg = {}

    default_slug = (
        (company.custom_domain or "").split(".")[0].strip().lower()
        if company.custom_domain and "." not in (company.custom_domain or "")
        else _slugify_store_name(company.name, company.id)
    )

    raw_branding = raw_cfg.get("branding") if isinstance(raw_cfg.get("branding"), dict) else {}
    branding = {
        "store_slug": raw_branding.get("store_slug") or default_slug,
        "primary_color": raw_branding.get("primary_color") or "#4f46e5",
        "secondary_color": raw_branding.get("secondary_color") or "#0f172a",
        "logo_url": raw_branding.get("logo_url") or company.logo or "",
        "hero_badge_text": (raw_branding.get("hero_badge_text") or "Destaques e Lançamentos").replace("&", "e"),
        "hero_title": raw_branding.get("hero_title") or f"Bem-vindo à {company.name}",
        "hero_subtitle": raw_branding.get("hero_subtitle") or "Explore nosso catálogo completo com entrega rápida e segura para todo o Brasil.",
        "hero_banner_url": raw_branding.get("hero_banner_url") or company.login_background_url or "",
        "show_voucher_simulator": False,
    }

    banners = raw_cfg.get("banners") if isinstance(raw_cfg.get("banners"), list) else []
    promotions = raw_cfg.get("promotions") if isinstance(raw_cfg.get("promotions"), list) else []
    raw_showcases = raw_cfg.get("showcases") if isinstance(raw_cfg.get("showcases"), list) else []
    showcases = []
    for sc in raw_showcases:
        if isinstance(sc, dict):
            sc_copy = dict(sc)
            sc_items = sc_copy.get("items") if isinstance(sc_copy.get("items"), list) else []
            sc_copy["items"] = _apply_b2c_promotions_to_items(sc_items, promotions)
            showcases.append(sc_copy)

    categories = raw_cfg.get("categories") if isinstance(raw_cfg.get("categories"), list) else []

    # Fallback: if no B2C categories configured yet, pull from Seller's NavigationMenuItem
    if not categories:
        try:
            from app.models.marketing_navigation import NavigationMenuItem
            nav_items = (
                db.query(NavigationMenuItem)
                .filter(NavigationMenuItem.company_id == company.id, NavigationMenuItem.is_active == True)
                .order_by(NavigationMenuItem.position.asc())
                .all()
            )
            for nav in nav_items:
                item_type_str = nav.item_type.value if hasattr(nav.item_type, "value") else str(nav.item_type)
                categories.append({
                    "id": f"nav-{nav.id}",
                    "label": nav.label,
                    "code": nav.external_id,
                    "filter_type": "NOM_EDITORA" if item_type_str == "BRAND" else "COD_GENERO",
                    "active": True,
                })
        except Exception:
            pass

    # Build Footer & Contact Info (Mandatory E-commerce Legal Details: CNPJ, Address, Contact)
    raw_footer = raw_cfg.get("footer_info") if isinstance(raw_cfg.get("footer_info"), dict) else {}
    addr_parts = []
    if getattr(company, "street", None):
        st = f"{company.street}, {company.number or 'S/N'}"
        if getattr(company, "complement", None):
            st += f" - {company.complement}"
        addr_parts.append(st)
    if getattr(company, "neighborhood", None):
        addr_parts.append(company.neighborhood)
    if getattr(company, "city", None) and getattr(company, "state", None):
        addr_parts.append(f"{company.city}/{company.state}")
    if getattr(company, "zip_code", None):
        addr_parts.append(f"CEP {company.zip_code}")
    default_address = " • ".join(addr_parts)

    footer_info = {
        "legal_name": raw_footer.get("legal_name") or getattr(company, "razao_social", None) or company.name,
        "cnpj": raw_footer.get("cnpj") or _format_cnpj_display(company.document),
        "address_line": raw_footer.get("address_line") or default_address or "Endereço cadastrado na sede da empresa",
        "zip_code": raw_footer.get("zip_code") or getattr(company, "zip_code", None) or "",
        "city_state": raw_footer.get("city_state") or (f"{company.city}/{company.state}" if getattr(company, "city", None) and getattr(company, "state", None) else ""),
        "contact_email": raw_footer.get("contact_email") or "",
        "contact_phone": raw_footer.get("contact_phone") or "",
        "whatsapp": raw_footer.get("whatsapp") or "",
        "business_hours": raw_footer.get("business_hours") or "Segunda a Sexta, das 09h às 18h",
        "about_text": raw_footer.get("about_text") or f"Loja oficial {company.name}. Catálogo editorial completo com entrega rápida e segura para todo o Brasil.",
    }

    return {
        "branding": branding,
        "banners": banners,
        "showcases": showcases,
        "categories": categories,
        "promotions": promotions,
        "footer_info": footer_info,
    }


@router.get("/appearance")
def get_b2c_appearance(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    company = db.query(Company).filter(Company.id == cid).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    cfg = _build_b2c_appearance_config(company, settings, db)
    return {
        "company_id": company.id,
        "company_name": company.name,
        "company_logo": company.logo,
        "b2c_custom_domain": getattr(company, "b2c_custom_domain", None),
        "uses_horus": bool(settings.horus_enabled) if settings else False,
        "tray_enabled": bool(getattr(settings, "tray_enabled", False)) if settings else False,
        **cfg,
    }


@router.put("/appearance")
def update_b2c_appearance(
    data: B2CAppearanceUpdateRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    company = db.query(Company).filter(Company.id == cid).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    if not settings:
        settings = CompanySettings(company_id=cid)
        db.add(settings)

    current_cfg = _build_b2c_appearance_config(company, settings, db)

    if data.branding is not None:
        merged_branding = {**current_cfg["branding"], **data.branding}
        if merged_branding.get("store_slug"):
            merged_branding["store_slug"] = _slugify_store_name(merged_branding["store_slug"], company.id)
        current_cfg["branding"] = merged_branding
        # Sync logo to company.logo when updated or cleared
        if "logo_url" in data.branding:
            company.logo = merged_branding.get("logo_url") or None

    if data.banners is not None:
        current_cfg["banners"] = data.banners
    if data.showcases is not None:
        current_cfg["showcases"] = data.showcases
    if data.categories is not None:
        current_cfg["categories"] = data.categories
    if data.promotions is not None:
        current_cfg["promotions"] = data.promotions
    if data.footer_info is not None:
        current_cfg["footer_info"] = {**current_cfg.get("footer_info", {}), **data.footer_info}

    if data.b2c_custom_domain is not None:
        clean_dom = data.b2c_custom_domain.strip().lower()
        clean_dom = re.sub(r"^https?://", "", clean_dom).rstrip("/")
        company.b2c_custom_domain = clean_dom or None

    # Preserve existing cache_config and contact_messages inside b2c_showcases_config
    existing_raw = getattr(settings, "b2c_showcases_config", None)
    if isinstance(existing_raw, dict):
        if "cache_config" in existing_raw:
            current_cfg["cache_config"] = existing_raw["cache_config"]
        if "contact_messages" in existing_raw:
            current_cfg["contact_messages"] = existing_raw["contact_messages"]

    from sqlalchemy.orm.attributes import flag_modified
    settings.b2c_showcases_config = current_cfg
    flag_modified(settings, "b2c_showcases_config")
    db.commit()

    # Automatically clear B2C cache for this seller so changes appear immediately
    _b2c_cache_clear(cid)

    return {
        "message": "Configurações da Loja B2C salvas e cache atualizado com sucesso!",
        **_build_b2c_appearance_config(company, settings, db),
    }


class B2CCacheConfigUpdateRequest(BaseModel):
    enabled: bool = True
    ttl_seconds: int = 1800


@router.get("/cache/status")
def get_b2c_cache_status(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    cfg = _get_b2c_cache_settings(settings)
    stats = _ensure_company_cache_stats(cid)

    now_ts = _time.time()
    bucket = _B2C_STORE_CACHE.get(cid, {})
    # Prune expired entries first
    expired_keys = [k for k, v in bucket.items() if now_ts > float(v.get("expires_at", 0))]
    for k in expired_keys:
        bucket.pop(k, None)

    entries_summary = []
    approx_bytes = 0
    for k, v in bucket.items():
        try:
            approx_bytes += len(_json.dumps(v.get("data"), default=str))
        except Exception:
            approx_bytes += 2048
        rem_sec = max(0, int(float(v.get("expires_at", 0)) - now_ts))
        entries_summary.append({
            "key": k,
            "label": v.get("label") or k,
            "hits": int(v.get("hits", 0)),
            "created_at": v.get("created_at"),
            "expires_in_seconds": rem_sec,
        })

    hits = int(stats.get("hits", 0))
    misses = int(stats.get("misses", 0))
    total_req = hits + misses
    hit_rate = round((hits / total_req) * 100, 1) if total_req > 0 else 0.0

    return {
        "company_id": cid,
        "enabled": cfg["enabled"],
        "ttl_seconds": cfg["ttl_seconds"],
        "cached_entries_count": len(bucket),
        "cache_hits": hits,
        "cache_misses": misses,
        "hit_rate_percent": hit_rate,
        "estimated_size_kb": round(approx_bytes / 1024.0, 2),
        "last_cleared_at": stats.get("last_cleared_at"),
        "last_warmup_at": stats.get("last_warmup_at"),
        "entries": entries_summary[:30],
    }


@router.put("/cache/config")
def update_b2c_cache_config(
    data: B2CCacheConfigUpdateRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    if not settings:
        settings = CompanySettings(company_id=cid)
        db.add(settings)

    raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
    raw_cfg["cache_config"] = {
        "enabled": bool(data.enabled),
        "ttl_seconds": max(60, min(86400 * 7, int(data.ttl_seconds or 1800))),
    }
    from sqlalchemy.orm.attributes import flag_modified
    settings.b2c_showcases_config = raw_cfg
    flag_modified(settings, "b2c_showcases_config")
    db.commit()

    if not data.enabled:
        _b2c_cache_clear(cid)

    return {
        "message": (
            "Cache de alta performance ativado e configurado!"
            if data.enabled
            else "Cache desativado e limpo para esta loja."
        ),
        **get_b2c_cache_status(company_id=cid, db=db, current_user=current_user),
    }


@router.post("/cache/clear")
def clear_seller_b2c_cache(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    removed = _b2c_cache_clear(cid)
    return {
        "message": f"Cache da loja limpo com sucesso! ({removed} página(s)/consulta(s) renovada(s)).",
        "removed_entries": removed,
        **get_b2c_cache_status(company_id=cid, db=db, current_user=current_user),
    }


@router.post("/cache/warmup")
async def warmup_seller_b2c_cache(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    _b2c_cache_clear(cid)
    # 1. Warm up Store Info & Showcases
    get_public_b2c_storefront_info(company_id=cid, db=db)
    # 2. Warm up Initial Catalog Page (Page 1)
    await get_public_b2c_catalog(
        company_id=cid,
        q="",
        filter="default",
        only_promo=False,
        skip=0,
        limit=24,
        db=db,
        current_user=None,
    )
    stats = _ensure_company_cache_stats(cid)
    stats["last_warmup_at"] = datetime.now(timezone.utc).isoformat()
    return {
        "message": "Cache da vitrine e página inicial pré-aquecido com sucesso para atender picos de acesso!",
        **get_b2c_cache_status(company_id=cid, db=db, current_user=current_user),
    }


@router.get("/appearance/available-categories")
async def get_b2c_available_categories(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca categorias e editoras disponíveis no Horus ERP, na Tray (se ativa) e no banco local do Seller
    para facilitar a montagem do menu de filtros da Loja B2C com 1 clique.
    """
    cid = _resolve_seller_company_id(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()

    categories: List[Dict[str, Any]] = []
    brands: List[Dict[str, Any]] = []
    tray_categories: List[Dict[str, Any]] = []

    if settings and settings.horus_enabled:
        try:
            from app.integrators.horus_products import HorusProducts
            client = HorusProducts(db=db, company_id=cid)
            id_doc = "0"
            if settings.horus_company and settings.horus_branch:
                id_doc = f"{settings.horus_company}{settings.horus_branch}"

            horus_generos = await client.arvore_generos(id_doc=id_doc)
            if isinstance(horus_generos, list) and len(horus_generos) > 0 and not horus_generos[0].get("Falha"):
                for gen in horus_generos:
                    cat_id = gen.get("COD_SECAO") or gen.get("COD_GENERO") or gen.get("ID_GENERO") or gen.get("ID")
                    cat_nome = gen.get("DESCRICAO") or gen.get("NOM_SECAO") or gen.get("NOM_GENERO") or gen.get("NOME")
                    if cat_id and cat_nome:
                        categories.append({
                            "code": str(cat_nome).strip(),
                            "raw_id": str(cat_id).strip(),
                            "label": str(cat_nome).strip().title(),
                            "filter_type": "COD_GENERO",
                            "source": "HORUS_ERP",
                        })

            horus_editoras = await client.busca_editoras(id_doc=id_doc)
            if isinstance(horus_editoras, list) and len(horus_editoras) > 0 and not horus_editoras[0].get("Falha"):
                for ed in horus_editoras[:150]:
                    ed_nome = ed.get("NOM_FANTASIA") or ed.get("NOM_EDITORA") or ed.get("NOME")
                    if ed_nome:
                        brands.append({
                            "code": str(ed_nome).strip(),
                            "label": str(ed_nome).strip().title(),
                            "filter_type": "NOM_EDITORA",
                            "source": "HORUS_ERP",
                        })
        except Exception as e:
            logger.warning(f"[B2C Categories] Aviso ao consultar gêneros/editoras no Horus: {e}")

    if settings and getattr(settings, "tray_enabled", False):
        try:
            import httpx
            tray_client = TrayClient(db, cid)
            token = await tray_client.get_valid_token()
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as http_cli:
                r_cat = await http_cli.get(
                    f"{tray_client.api_address}/categories/tree",
                    params={"access_token": token},
                )
                res = r_cat.json() if r_cat.status_code == 200 else {}
            raw_cats = res.get("Category") if isinstance(res, dict) else []
            if isinstance(raw_cats, list):
                for item in raw_cats:
                    cat_obj = item.get("Category", item) if isinstance(item, dict) else {}
                    c_name = cat_obj.get("name")
                    if c_name:
                        tray_categories.append({
                            "code": str(c_name).strip(),
                            "label": str(c_name).strip(),
                            "filter_type": "COD_GENERO",
                            "source": "TRAY",
                        })
        except Exception as e:
            logger.warning(f"[B2C Categories] Aviso ao consultar categorias na Tray: {e}")

    if not categories:
        try:
            from app.models.catalog_support import Category, Brand
            local_cats = db.query(Category).filter(Category.company_id == cid).all()
            for c in local_cats:
                categories.append({
                    "code": c.name,
                    "label": c.name,
                    "filter_type": "COD_GENERO",
                    "source": "CRONUZ",
                })
            local_brands = db.query(Brand).filter(Brand.company_id == cid).all()
            for b in local_brands:
                brands.append({
                    "code": b.name,
                    "label": b.name,
                    "filter_type": "NOM_EDITORA",
                    "source": "CRONUZ",
                })
        except Exception:
            pass

    return {
        "categories": categories,
        "brands": brands,
        "tray_categories": tray_categories,
    }


@router.get("/appearance/search-products")
async def search_b2c_products_for_showcase(
    q: str = Query("", description="Busca por Título, ISBN, Autor ou Editora"),
    limit: int = Query(16, ge=1, le=50),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca rápida de produtos (Horus ERP respeitando OFFSET/LIMIT e SD_* ou Catálogo Local)
    para que o Seller adicione livros nas Vitrines e Destaques da Home B2C com 1 clique.
    """
    cid = _resolve_seller_company_id(current_user, company_id)
    res = await get_public_b2c_catalog(
        company_id=cid,
        q=q,
        filter="default",
        skip=0,
        limit=limit,
        db=db,
        current_user=current_user,
    )
    return res



@router.get("/coupons/batches")
def list_coupon_batches(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    batches = (
        db.query(B2CCouponBatch)
        .filter(B2CCouponBatch.company_id == cid)
        .order_by(B2CCouponBatch.created_at.desc())
        .all()
    )

    result = []
    for b in batches:
        coupons = b.coupons or []
        total_c = len(coupons)
        used_c = sum(1 for c in coupons if c.status in ("PARTIALLY_USED", "EXHAUSTED"))
        total_val = sum(float(c.initial_value or 0) for c in coupons if c.coupon_mode != "RESIDUAL")
        consumed_val = sum(float(c.used_amount or 0) for c in coupons)
        result.append(
            {
                "id": b.id,
                "name": b.name,
                "partner_company_name": b.partner_company_name,
                "partner_document": b.partner_document,
                "batch_mode": b.batch_mode,
                "shared_code": b.shared_code,
                "coupon_value": float(b.coupon_value or 0),
                "discount_type": b.discount_type,
                "allows_freight_discount": b.allows_freight_discount,
                "allow_residual_balance": b.allow_residual_balance,
                "min_order_value": float(b.min_order_value or 0),
                "max_uses_total": b.max_uses_total,
                "valid_from": b.valid_from.isoformat() if b.valid_from else None,
                "valid_until": b.valid_until.isoformat() if b.valid_until else None,
                "active": b.active,
                "notes": b.notes,
                "coupons_count": total_c,
                "coupons_used_count": used_c,
                "total_batch_value": round(total_val, 2),
                "consumed_batch_value": round(consumed_val, 2),
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
        )
    return result


@router.post("/coupons/batches")
def create_coupon_batch(
    data: CouponBatchCreateRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)

    shared_code_clean: Optional[str] = None
    if data.batch_mode == "SHARED_CPF_LIMIT":
        shared_code_clean = re.sub(
            r"[^A-Z0-9\-_]",
            "",
            (data.shared_code or data.code_prefix or "EMPRESA").upper().strip(),
        )
        if not shared_code_clean:
            raise HTTPException(status_code=400, detail="Informe o código compartilhado do lote corporativo.")

        existing = (
            db.query(B2CCouponBatch)
            .filter(
                B2CCouponBatch.company_id == cid,
                B2CCouponBatch.shared_code == shared_code_clean,
                B2CCouponBatch.active == True,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail=f"Já existe um lote ativo com o código {shared_code_clean}.")

    eligible_cpfs = []
    if data.employees:
        for emp in data.employees:
            eligible_cpfs.append(
                {
                    "name": emp.name,
                    "cpf": _clean_digits(emp.cpf),
                    "email": emp.email,
                }
            )

    batch = B2CCouponBatch(
        company_id=cid,
        name=data.name.strip(),
        partner_company_name=data.partner_company_name,
        partner_document=_clean_digits(data.partner_document) if data.partner_document else None,
        batch_mode=data.batch_mode,
        shared_code=shared_code_clean,
        coupon_value=Decimal(str(round(data.coupon_value, 2))),
        discount_type=data.discount_type,
        allows_freight_discount=data.allows_freight_discount,
        allow_residual_balance=data.allow_residual_balance,
        min_order_value=Decimal(str(round(data.min_order_value or 0.0, 2))),
        max_uses_total=len(eligible_cpfs) if eligible_cpfs else data.quantity,
        valid_from=data.valid_from,
        valid_until=data.valid_until,
        eligible_cpfs_json=eligible_cpfs if eligible_cpfs else None,
        notes=data.notes,
        active=True,
    )
    db.add(batch)
    db.flush()

    created_coupons = []
    prefix = data.code_prefix or data.partner_company_name or "VOUCHER"

    if data.batch_mode == "INDIVIDUAL_CODES":
        if eligible_cpfs:
            for emp in eligible_cpfs:
                code = _generate_unique_code(prefix)
                c = B2CCoupon(
                    company_id=cid,
                    batch_id=batch.id,
                    code=code,
                    coupon_mode="INDIVIDUAL",
                    discount_type=data.discount_type,
                    initial_value=Decimal(str(round(data.coupon_value, 2))),
                    current_balance=Decimal(str(round(data.coupon_value, 2))),
                    used_amount=Decimal("0.00"),
                    allows_freight_discount=data.allows_freight_discount,
                    allow_residual_balance=data.allow_residual_balance,
                    min_order_value=Decimal(str(round(data.min_order_value or 0.0, 2))),
                    assigned_name=emp.get("name"),
                    assigned_cpf=emp.get("cpf") or None,
                    assigned_email=emp.get("email"),
                    status="AVAILABLE",
                    valid_from=data.valid_from,
                    valid_until=data.valid_until,
                )
                db.add(c)
                created_coupons.append(c)
        else:
            for _ in range(data.quantity):
                code = _generate_unique_code(prefix)
                c = B2CCoupon(
                    company_id=cid,
                    batch_id=batch.id,
                    code=code,
                    coupon_mode="INDIVIDUAL",
                    discount_type=data.discount_type,
                    initial_value=Decimal(str(round(data.coupon_value, 2))),
                    current_balance=Decimal(str(round(data.coupon_value, 2))),
                    used_amount=Decimal("0.00"),
                    allows_freight_discount=data.allows_freight_discount,
                    allow_residual_balance=data.allow_residual_balance,
                    min_order_value=Decimal(str(round(data.min_order_value or 0.0, 2))),
                    status="AVAILABLE",
                    valid_from=data.valid_from,
                    valid_until=data.valid_until,
                )
                db.add(c)
                created_coupons.append(c)
    else:
        # SHARED_CPF_LIMIT: If employees list provided, pre-create CPF_WALLET coupons for each employee
        for emp in eligible_cpfs:
            if not emp.get("cpf"):
                continue
            c = B2CCoupon(
                company_id=cid,
                batch_id=batch.id,
                code=shared_code_clean,
                coupon_mode="CPF_WALLET",
                discount_type=data.discount_type,
                initial_value=Decimal(str(round(data.coupon_value, 2))),
                current_balance=Decimal(str(round(data.coupon_value, 2))),
                used_amount=Decimal("0.00"),
                allows_freight_discount=data.allows_freight_discount,
                allow_residual_balance=data.allow_residual_balance,
                min_order_value=Decimal(str(round(data.min_order_value or 0.0, 2))),
                assigned_name=emp.get("name"),
                assigned_cpf=emp.get("cpf"),
                assigned_email=emp.get("email"),
                status="AVAILABLE",
                valid_from=data.valid_from,
                valid_until=data.valid_until,
            )
            db.add(c)
            created_coupons.append(c)

    db.commit()
    return {
        "message": "Lote de cupons corporativos criado com sucesso!",
        "batch_id": batch.id,
        "batch_mode": batch.batch_mode,
        "shared_code": batch.shared_code,
        "generated_coupons_count": len(created_coupons),
    }


@router.get("/coupons")
def list_b2c_coupons(
    batch_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    q = db.query(B2CCoupon).filter(B2CCoupon.company_id == cid)

    if batch_id:
        q = q.filter(B2CCoupon.batch_id == batch_id)
    if status:
        q = q.filter(B2CCoupon.status == status)
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                B2CCoupon.code.ilike(term),
                B2CCoupon.assigned_name.ilike(term),
                B2CCoupon.assigned_cpf.ilike(term),
                B2CCoupon.assigned_email.ilike(term),
                B2CCoupon.generated_child_code.ilike(term),
            )
        )

    coupons = q.order_by(B2CCoupon.created_at.desc()).limit(500).all()
    return [
        {
            "id": c.id,
            "batch_id": c.batch_id,
            "batch_name": c.batch.name if c.batch else None,
            "partner_company_name": c.batch.partner_company_name if c.batch else None,
            "code": c.code,
            "coupon_mode": c.coupon_mode,
            "discount_type": c.discount_type,
            "initial_value": float(c.initial_value or 0),
            "current_balance": float(c.current_balance or 0),
            "used_amount": float(c.used_amount or 0),
            "allows_freight_discount": c.allows_freight_discount,
            "allow_residual_balance": c.allow_residual_balance,
            "min_order_value": float(c.min_order_value or 0),
            "assigned_name": c.assigned_name,
            "assigned_cpf": c.assigned_cpf,
            "assigned_email": c.assigned_email,
            "parent_coupon_id": c.parent_coupon_id,
            "generated_child_code": c.generated_child_code,
            "status": c.status,
            "valid_from": c.valid_from.isoformat() if c.valid_from else None,
            "valid_until": c.valid_until.isoformat() if c.valid_until else None,
            "used_at": c.used_at.isoformat() if c.used_at else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in coupons
    ]


@router.post("/coupons")
def create_single_b2c_coupon(
    data: SingleCouponCreateRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    code = (
        re.sub(r"[^A-Z0-9\-_]", "", data.code.upper().strip())
        if data.code
        else _generate_unique_code("CUPOM")
    )

    existing = (
        db.query(B2CCoupon)
        .filter(B2CCoupon.company_id == cid, B2CCoupon.code == code, B2CCoupon.status != "CANCELLED")
        .first()
    )
    existing_batch = (
        db.query(B2CCouponBatch)
        .filter(B2CCouponBatch.company_id == cid, B2CCouponBatch.shared_code == code, B2CCouponBatch.active == True)
        .first()
    )
    if existing or existing_batch:
        raise HTTPException(status_code=400, detail=f"Já existe um cupom ativo com o código {code}.")

    max_uses = max(1, int(data.max_uses or 1))
    if max_uses > 1:
        batch = B2CCouponBatch(
            company_id=cid,
            name=data.assigned_name.strip() if data.assigned_name else f"Cupom Múltiplos Usos ({code})",
            batch_mode="SHARED_CPF_LIMIT",
            shared_code=code,
            coupon_value=Decimal(str(round(data.initial_value, 2))),
            discount_type=data.discount_type,
            allows_freight_discount=data.allows_freight_discount,
            allow_residual_balance=data.allow_residual_balance,
            min_order_value=Decimal(str(round(data.min_order_value or 0.0, 2))),
            max_uses_total=max_uses,
            valid_from=data.valid_from,
            valid_until=data.valid_until,
            active=True,
        )
        db.add(batch)
        db.commit()
        db.refresh(batch)
        return {
            "message": f"Cupom {code} criado para até {max_uses} utilizações!",
            "batch_id": batch.id,
            "code": code,
            "max_uses": max_uses,
        }

    coupon = B2CCoupon(
        company_id=cid,
        code=code,
        coupon_mode="INDIVIDUAL",
        discount_type=data.discount_type,
        initial_value=Decimal(str(round(data.initial_value, 2))),
        current_balance=Decimal(str(round(data.initial_value, 2))),
        used_amount=Decimal("0.00"),
        allows_freight_discount=data.allows_freight_discount,
        allow_residual_balance=data.allow_residual_balance,
        min_order_value=Decimal(str(round(data.min_order_value or 0.0, 2))),
        assigned_name=data.assigned_name,
        assigned_cpf=_clean_digits(data.assigned_cpf) if data.assigned_cpf else None,
        assigned_email=data.assigned_email,
        status="AVAILABLE",
        valid_from=data.valid_from,
        valid_until=data.valid_until,
    )
    db.add(coupon)
    db.commit()
    db.refresh(coupon)
    return {"message": f"Cupom {coupon.code} criado com sucesso!", "id": coupon.id, "code": coupon.code}


@router.patch("/coupons/{coupon_id}/cancel")
def cancel_b2c_coupon(
    coupon_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    coupon = db.query(B2CCoupon).filter(B2CCoupon.id == coupon_id, B2CCoupon.company_id == cid).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Cupom não encontrado.")
    coupon.status = "CANCELLED"
    db.commit()
    return {"message": f"Cupom {coupon.code} cancelado."}


@router.get("/coupons/redemptions")
def list_coupon_redemptions(
    batch_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    q = db.query(B2CCouponRedemption).filter(B2CCouponRedemption.company_id == cid)

    if batch_id:
        q = q.filter(B2CCouponRedemption.batch_id == batch_id)
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                B2CCouponRedemption.coupon_code.ilike(term),
                B2CCouponRedemption.customer_name.ilike(term),
                B2CCouponRedemption.customer_cpf.ilike(term),
                B2CCouponRedemption.customer_email.ilike(term),
                B2CCouponRedemption.residual_coupon_code.ilike(term),
            )
        )

    rows = q.order_by(B2CCouponRedemption.created_at.desc()).limit(500).all()
    return [
        {
            "id": r.id,
            "coupon_id": r.coupon_id,
            "batch_id": r.batch_id,
            "batch_name": r.batch.name if r.batch else None,
            "partner_company_name": r.batch.partner_company_name if r.batch else None,
            "order_id": r.order_id,
            "coupon_code": r.coupon_code,
            "customer_name": r.customer_name,
            "customer_cpf": r.customer_cpf,
            "customer_email": r.customer_email,
            "order_subtotal": float(r.order_subtotal or 0),
            "order_freight": float(r.order_freight or 0),
            "discount_applied": float(r.discount_applied or 0),
            "previous_balance": float(r.previous_balance or 0),
            "remaining_balance": float(r.remaining_balance or 0),
            "residual_coupon_code": r.residual_coupon_code,
            "difference_paid": float(r.difference_paid or 0),
            "used_full_balance": float(r.remaining_balance or 0) <= 0.009,
            "checkout_mode": r.checkout_mode,
            "tray_cart_url": r.tray_cart_url,
            "tray_coupon_code": r.tray_coupon_code,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/orders")
def list_b2c_orders(
    search: Optional[str] = Query(None),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    q = db.query(Order).filter(Order.company_id == cid, Order.origin == "b2c_storefront")
    orders = q.order_by(Order.created_at.desc()).limit(300).all()

    redemptions_by_order: Dict[int, B2CCouponRedemption] = {}
    order_ids = [o.id for o in orders]
    if order_ids:
        reds = (
            db.query(B2CCouponRedemption)
            .filter(B2CCouponRedemption.company_id == cid, B2CCouponRedemption.order_id.in_(order_ids))
            .all()
        )
        for r in reds:
            if r.order_id:
                redemptions_by_order[r.order_id] = r

    results = []
    for o in orders:
        cust = o.customer
        red = redemptions_by_order.get(o.id)
        cust_name = (red.customer_name if red else None) or (cust.name if cust else "Cliente B2C")
        cust_cpf = (red.customer_cpf if red else None) or (getattr(cust, "document", "") if cust else "")
        cust_email = (red.customer_email if red else None) or (cust.email if cust else "")
        coupon_code = (red.coupon_code if red else None) or (
            o.customer_order_ref if o.customer_order_ref and o.customer_order_ref != "B2C_DIRECT" else None
        )
        residual_code = red.residual_coupon_code if red else None

        if search:
            term = search.strip().lower()
            haystack = f"{o.id} {cust_name} {cust_cpf} {cust_email} {coupon_code or ''} {residual_code or ''} {o.external_id or ''}".lower()
            if term not in haystack:
                continue

        items_list = [
            {
                "id": it.id,
                "sku": it.sku,
                "ean_isbn": it.ean_isbn,
                "name": it.name,
                "brand": it.brand,
                "quantity": it.quantity,
                "unit_price": float(it.unit_price or 0),
                "total_price": float(it.total_price or 0),
            }
            for it in (o.items or [])
        ]

        results.append(
            {
                "id": o.id,
                "status": o.status,
                "checkout_mode": o.payment_condition or (red.checkout_mode if red else "NATIVE_GATEWAY"),
                "external_id": o.external_id,
                "customer_name": cust_name,
                "customer_cpf": cust_cpf,
                "customer_email": cust_email,
                "subtotal": float(o.subtotal or 0),
                "freight": float(red.order_freight or 0) if red else 0.0,
                "discount_applied": float(o.discount or 0),
                "difference_paid": float(o.total or 0),
                "coupon_code": coupon_code,
                "previous_balance": float(red.previous_balance or 0) if red else 0.0,
                "remaining_balance": float(red.remaining_balance or 0) if red else 0.0,
                "residual_coupon_code": residual_code,
                "tray_cart_url": red.tray_cart_url if red else None,
                "tray_coupon_code": red.tray_coupon_code if red else None,
                "redemption_status": red.status if red else None,
                "items_count": sum(i["quantity"] for i in items_list),
                "items": items_list,
                "created_at": o.created_at.isoformat() if o.created_at else None,
            }
        )

    return results


@router.get("/lgpd/consents")
def list_lgpd_consents(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    rows = (
        db.query(B2CLgpdConsent)
        .filter(B2CLgpdConsent.company_id == cid)
        .order_by(B2CLgpdConsent.accepted_at.desc())
        .limit(500)
        .all()
    )
    return [
        {
            "id": r.id,
            "customer_id": r.customer_id,
            "customer_name": r.customer_name,
            "customer_cpf": r.customer_cpf,
            "customer_email": r.customer_email,
            "ip_address": r.ip_address,
            "user_agent": r.user_agent,
            "terms_version": r.terms_version,
            "marketing_opt_in": r.marketing_opt_in,
            "accepted_at": r.accepted_at.isoformat() if r.accepted_at else None,
        }
        for r in rows
    ]


# ══════════════════════════════════════════════════════════════════════════════
# 3. PUBLIC B2C STOREFRONT ENDPOINTS (CATALOG, FREIGHT, COUPON, CHECKOUT)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/public/info")
def get_public_b2c_storefront_info(
    company_id: int = Query(..., description="ID do Seller"),
    db: Session = Depends(get_db),
):
    company = db.query(Company).filter(Company.id == company_id, Company.active == True).first()
    if not company:
        raise HTTPException(status_code=404, detail="Loja não encontrada.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company.id).first()
    cached = _b2c_cache_get(company.id, "store_info", settings)
    if cached is not None:
        return cached

    appearance = _build_b2c_appearance_config(company, settings, db)

    default_lgpd = (
        f"Ao prosseguir com seu cadastro e pedido na loja {company.name}, você concorda com o tratamento "
        f"dos seus dados pessoais (Nome, CPF, E-mail, Telefone e Endereço de Entrega) exclusivamente para fins "
        f"de faturamento fiscal, entrega logística, auditoria de uso de benefício corporativo e cumprimento de "
        f"obrigações legais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD)."
    )

    payload = {
        "company_id": company.id,
        "name": company.name,
        "document": company.document,
        "logo": appearance["branding"].get("logo_url") or company.logo,
        "favicon_url": company.favicon_url,
        "seo_title": company.seo_title or company.name,
        "seo_description": company.seo_description or f"Loja Oficial {company.name}",
        "cover_image_base_url": settings.cover_image_base_url if settings else None,
        "uses_horus": bool(settings.horus_enabled) if settings else False,
        "b2c_checkout_mode": getattr(settings, "b2c_checkout_mode", "NATIVE_GATEWAY") if settings else "NATIVE_GATEWAY",
        "tray_enabled": bool(getattr(settings, "tray_enabled", False)) if settings else False,
        "tray_store_url": getattr(settings, "tray_store_url", None) if settings else None,
        "b2c_default_freight_value": float(getattr(settings, "b2c_default_freight_value", 0) or 0) if settings else 0.0,
        "b2c_free_shipping_min_value": float(getattr(settings, "b2c_free_shipping_min_value", 0) or 0) if settings else 0.0,
        "b2c_lgpd_terms_text": (getattr(settings, "b2c_lgpd_terms_text", None) if settings else None) or default_lgpd,
        "payment_gateway_active": getattr(settings, "payment_gateway_active", "EFI") if settings else "EFI",
        "appearance": appearance,
    }
    _b2c_cache_set(company.id, "store_info", payload, settings, label="Dados da Loja, Vitrines & Banners")
    return payload


@router.get("/public/resolve-slug")
def resolve_public_b2c_store_slug(
    slug: str = Query(..., description="Slug amigável, domínio ou ID da loja B2C"),
    db: Session = Depends(get_db),
):
    clean = slug.strip().lower()
    if not clean:
        raise HTTPException(status_code=404, detail="Loja não encontrada.")

    # 1. If numeric ID
    if clean.isdigit():
        comp = db.query(Company).filter(Company.id == int(clean), Company.active == True).first()
        if comp:
            return get_public_b2c_storefront_info(company_id=comp.id, db=db)

    # 2. Match by b2c_custom_domain, custom_domain, or domain
    comp = (
        db.query(Company)
        .filter(
            Company.active == True,
            or_(
                func.lower(Company.b2c_custom_domain) == clean,
                func.lower(Company.custom_domain) == clean,
                func.lower(Company.domain) == clean,
                func.lower(Company.custom_domain).like(f"{clean}.%"),
            ),
        )
        .first()
    )
    if comp:
        return get_public_b2c_storefront_info(company_id=comp.id, db=db)

    # 3. Match by store_slug inside b2c_showcases_config or slugified company name
    active_companies = db.query(Company).filter(Company.active == True).all()
    for c in active_companies:
        s = db.query(CompanySettings).filter(CompanySettings.company_id == c.id).first()
        cfg = _build_b2c_appearance_config(c, s, db)
        cfg_slug = (cfg.get("branding", {}).get("store_slug") or "").strip().lower()
        name_slug = _slugify_store_name(c.name, c.id)
        if clean in (cfg_slug, name_slug):
            return get_public_b2c_storefront_info(company_id=c.id, db=db)

    raise HTTPException(status_code=404, detail="Loja não encontrada para esta URL amigável.")



@router.get("/public/catalog")
async def get_public_b2c_catalog(
    company_id: int = Query(..., description="ID do Seller"),
    q: str = Query("", description="Termo de busca (Título, Autor, ISBN ou Editora)"),
    filter: str = Query("default", description="default, NOM_AUTOR, NOM_EDITORA, COD_GENERO"),
    only_promo: bool = Query(False, description="Filtrar apenas itens em promoção B2C"),
    skip: int = Query(0, ge=0),
    limit: int = Query(24, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional),
):
    """
    Catálogo aberto B2C integrado ao Horus ERP (respeitando OFFSET/LIMIT `horus_legacy_pagination`,
    `SD_*` e `AC_*` quando `horus_hide_zero_balance=True`) ou catálogo local quando Horus está desativado,
    com camada de Cache gerenciada pelo Seller para suportar alto volume de acessos.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()

    search_term = q.strip() if q else ""
    cache_key = f"catalog:{search_term.lower()}:{filter}:{int(only_promo)}:{skip}:{limit}"
    cached_catalog = _b2c_cache_get(company_id, cache_key, settings)
    if cached_catalog is not None:
        return cached_catalog

    promotions = []
    if company and settings:
        raw_cfg = getattr(settings, "b2c_showcases_config", None)
        if isinstance(raw_cfg, dict) and isinstance(raw_cfg.get("promotions"), list):
            promotions = raw_cfg.get("promotions", [])

    if settings and settings.horus_enabled:
        # Se a busca inicial estiver vazia, usamos "A" para trazer vitrine inicial do acervo Horus com saldo
        effective_term = search_term if len(search_term) >= 1 else "A"
        items = await _fetch_from_horus_storefront(
            db=db,
            company_id=company_id,
            current_user=current_user,
            term=effective_term,
            search_type="SEARCH",
            skip=skip,
            limit=limit,
            settings=settings,
            search_filter=filter,
        )
        items = _apply_b2c_promotions_to_items(items, promotions)
        if only_promo:
            items = [
                it for it in items
                if it.get("promotional_price") is not None
                and float(it.get("promotional_price") or 0) < float(it.get("base_price") or 0)
            ]
        current_page = (skip // limit) + 1
        estimated_pages = current_page if len(items) < limit else max(5, current_page + 3)
        res_payload = {
            "items": items,
            "total": skip + len(items),
            "page": current_page,
            "pages": estimated_pages,
            "source": "HORUS_ERP",
        }
        if len(items) > 0:
            label_str = f"Catálogo Pág {current_page} ({search_term or 'Vitrine Inicial'})"
            _b2c_cache_set(company_id, cache_key, res_payload, settings, label=label_str)
        return res_payload

    # Fallback: Catálogo Local PostgreSQL
    query = db.query(Product).filter(
        Product.company_id == company_id,
        Product.status == "ACTIVE",
    )
    if search_term:
        like_term = f"%{search_term}%"
        query = query.filter(
            or_(
                Product.name.ilike(like_term),
                Product.ean_gtin.ilike(like_term),
                Product.sku.ilike(like_term),
                Product.brand.ilike(like_term),
                Product.short_description.ilike(like_term),
            )
        )

    if settings and getattr(settings, "horus_hide_zero_balance", False):
        query = query.filter(Product.stock_quantity > 0)

    total = query.count()
    products = query.order_by(Product.id.desc()).offset(skip).limit(limit).all()
    allow_backorder = settings.allow_backorder if settings else False

    mapped = []
    for p in products:
        allow, label = calculate_product_availability(
            p.stock_quantity,
            None,
            getattr(p, "is_pre_sale", False),
            getattr(p, "is_out_of_print", False),
            allow_backorder,
        )
        mapped.append(
            {
                "id": p.id,
                "company_id": p.company_id,
                "sku": p.sku,
                "ean_gtin": p.ean_gtin or "",
                "name": p.name,
                "author": getattr(p, "author", None) or getattr(p, "model", None) or "",
                "base_price": float(p.base_price or p.price or 0.0),
                "promotional_price": float(p.promotional_price) if getattr(p, "promotional_price", None) else None,
                "stock_quantity": p.stock_quantity or 0,
                "status": p.status,
                "short_description": p.short_description or "",
                "long_description": p.long_description or p.short_description or "",
                "brand": p.brand or "",
                "category": (
                    {"id": p.category.id, "name": p.category.name}
                    if getattr(p, "category", None)
                    else {"id": 0, "name": "Geral"}
                ),
                "allow_purchase": True,
                "stock_status_label": label,
                "cover_url": getattr(p, "image_url", None) or getattr(p, "cover_url", None),
            }
        )

    mapped = _apply_b2c_promotions_to_items(mapped, promotions)
    if only_promo:
        mapped = [
            it for it in mapped
            if it.get("promotional_price") is not None
            and float(it.get("promotional_price") or 0) < float(it.get("base_price") or 0)
        ]

    current_page = (skip // limit) + 1
    res_payload = {
        "items": mapped,
        "total": total,
        "page": current_page,
        "pages": max(1, (total + limit - 1) // limit),
        "source": "LOCAL_DB",
    }
    if len(mapped) > 0:
        label_str = f"Catálogo Pág {current_page} ({search_term or 'Vitrine Inicial'})"
        _b2c_cache_set(company_id, cache_key, res_payload, settings, label=label_str)
    return res_payload


@router.post("/public/contact")
def submit_b2c_contact_message(
    data: B2CContactMessageRequest,
    db: Session = Depends(get_db),
):
    company = db.query(Company).filter(Company.id == data.company_id, Company.active == True).first()
    if not company:
        raise HTTPException(status_code=404, detail="Loja não encontrada.")
    if not data.name.strip() or not data.email.strip() or not data.message.strip():
        raise HTTPException(status_code=400, detail="Preencha nome, e-mail e mensagem.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company.id).first()
    if settings:
        current_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
        msgs = current_cfg.get("contact_messages", [])
        if not isinstance(msgs, list):
            msgs = []
        msgs.insert(0, {
            "id": uuid.uuid4().hex[:10],
            "name": data.name.strip(),
            "email": data.email.strip(),
            "phone": (data.phone or "").strip(),
            "subject": (data.subject or "Atendimento B2C").strip(),
            "message": data.message.strip(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        current_cfg["contact_messages"] = msgs[:100]
        settings.b2c_showcases_config = current_cfg
        flag_modified(settings, "b2c_showcases_config")
        db.commit()

    return {
        "status": "OK",
        "message": "Mensagem enviada com sucesso! Nosso atendimento retornará em breve pelo seu e-mail ou WhatsApp.",
    }


@router.post("/public/freight/calculate")
def calculate_b2c_freight(
    data: FreightCalculateRequest,
    db: Session = Depends(get_db),
):
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == data.company_id).first()
    default_freight = float(getattr(settings, "b2c_default_freight_value", 0) or 0) if settings else 0.0
    free_min = float(getattr(settings, "b2c_free_shipping_min_value", 0) or 0) if settings else 0.0

    is_free = free_min > 0 and data.subtotal >= free_min
    pac_price = 0.0 if is_free else (default_freight if default_freight > 0 else 15.90)
    sedex_price = round(pac_price + 14.00, 2) if pac_price > 0 else 19.90

    options = [
        {
            "id": "STANDARD",
            "name": "Frete Grátis Promocional" if is_free else "Entrega Econômica (PAC / Impresso)",
            "price": round(pac_price, 2),
            "delivery_days": 6,
        },
        {
            "id": "EXPRESS",
            "name": "Entrega Expressa (SEDEX)",
            "price": round(sedex_price, 2),
            "delivery_days": 2,
        },
    ]
    return {"options": options}


def _find_or_prepare_coupon(
    db: Session,
    company_id: int,
    raw_code: str,
    customer_cpf: Optional[str],
    create_wallet_if_shared: bool = False,
    customer_name: Optional[str] = None,
    customer_email: Optional[str] = None,
) -> B2CCoupon:
    code = re.sub(r"[^A-Z0-9\-_]", "", (raw_code or "").upper().strip())
    cpf_digits = _clean_digits(customer_cpf)
    today = date.today()

    if not code:
        raise HTTPException(status_code=400, detail="Informe o código do cupom.")

    # 1. Check if this is an existing individual or CPF wallet coupon
    q = db.query(B2CCoupon).filter(
        B2CCoupon.company_id == company_id,
        B2CCoupon.code == code,
    )
    coupons = q.all()

    # If multiple CPF_WALLET coupons share the same code, match by assigned_cpf
    target_coupon: Optional[B2CCoupon] = None
    if coupons:
        for c in coupons:
            if c.coupon_mode == "CPF_WALLET":
                if cpf_digits and _clean_digits(c.assigned_cpf) == cpf_digits:
                    target_coupon = c
                    break
            else:
                target_coupon = c
                break

    # 2. If not found in B2CCoupon, check if it's a SHARED_CPF_LIMIT batch code
    if not target_coupon:
        batch = (
            db.query(B2CCouponBatch)
            .filter(
                B2CCouponBatch.company_id == company_id,
                B2CCouponBatch.shared_code == code,
                B2CCouponBatch.active == True,
            )
            .first()
        )
        if batch:
            # Check if batch restricts to an eligible CPF list
            if batch.eligible_cpfs_json and isinstance(batch.eligible_cpfs_json, list):
                allowed_cpfs = {_clean_digits(x.get("cpf")) for x in batch.eligible_cpfs_json if x.get("cpf")}
                if allowed_cpfs:
                    if not cpf_digits:
                        raise HTTPException(
                            status_code=400,
                            detail="Este cupom possui lista restrita de CPFs. Informe seu CPF abaixo do cupom para validar.",
                        )
                    if cpf_digits not in allowed_cpfs:
                        raise HTTPException(
                            status_code=403,
                            detail="Seu CPF não consta na lista de beneficiários elegíveis para este cupom.",
                        )
            elif create_wallet_if_shared and not cpf_digits:
                raise HTTPException(
                    status_code=400,
                    detail="Informe seu CPF para finalizar a compra com este cupom.",
                )

            # Check max uses on batch
            issued_count = db.query(func.count(B2CCoupon.id)).filter(B2CCoupon.batch_id == batch.id).scalar() or 0
            if issued_count >= (batch.max_uses_total or 999999):
                raise HTTPException(status_code=400, detail="O limite máximo de utilizações deste cupom já foi atingido.")

            target_coupon = B2CCoupon(
                company_id=company_id,
                batch_id=batch.id,
                code=code,
                coupon_mode="CPF_WALLET",
                discount_type=batch.discount_type,
                initial_value=batch.coupon_value,
                current_balance=batch.coupon_value,
                used_amount=Decimal("0.00"),
                allows_freight_discount=batch.allows_freight_discount,
                allow_residual_balance=batch.allow_residual_balance,
                min_order_value=batch.min_order_value,
                assigned_name=customer_name,
                assigned_cpf=cpf_digits or None,
                assigned_email=customer_email,
                status="AVAILABLE",
                valid_from=batch.valid_from,
                valid_until=batch.valid_until,
            )
            if create_wallet_if_shared:
                db.add(target_coupon)
                db.flush()

    if not target_coupon:
        raise HTTPException(status_code=404, detail="Cupom inválido ou não encontrado.")

    # Validate status & expiration
    if target_coupon.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Este cupom foi cancelado.")
    if target_coupon.status == "EXHAUSTED" or float(target_coupon.current_balance or 0) <= 0:
        child_hint = (
            f" Utilize seu cupom de saldo residual: {target_coupon.generated_child_code}"
            if target_coupon.generated_child_code
            else ""
        )
        raise HTTPException(status_code=400, detail=f"O saldo deste cupom já foi integralmente utilizado.{child_hint}")

    if target_coupon.valid_from and today < target_coupon.valid_from:
        raise HTTPException(status_code=400, detail="Este cupom ainda não está dentro do período de vigência.")
    if target_coupon.valid_until and today > target_coupon.valid_until:
        raise HTTPException(status_code=400, detail="Este cupom está expirado.")

    # Validate CPF lock if coupon is assigned to a specific CPF
    if target_coupon.assigned_cpf and cpf_digits:
        if _clean_digits(target_coupon.assigned_cpf) != cpf_digits:
            raise HTTPException(
                status_code=403,
                detail="Este cupom pertence a outro CPF e é intransferível.",
            )

    return target_coupon


@router.post("/public/coupon/validate")
def validate_b2c_coupon(
    data: CouponValidateRequest,
    db: Session = Depends(get_db),
):
    coupon = _find_or_prepare_coupon(
        db=db,
        company_id=data.company_id,
        raw_code=data.code,
        customer_cpf=data.customer_cpf,
        create_wallet_if_shared=False,
    )

    min_order = float(coupon.min_order_value or 0)
    if min_order > 0 and data.subtotal < min_order:
        raise HTTPException(
            status_code=400,
            detail=f"Este cupom exige um valor mínimo de R$ {min_order:.2f} em produtos.",
        )

    balance = float(coupon.current_balance or 0)
    # When allows_freight_discount is True, the coupon grants Free Shipping (freight = 0.00)
    effective_freight = 0.0 if coupon.allows_freight_discount else round(max(0.0, float(data.freight or 0.0)), 2)
    eligible_base = round(float(data.subtotal or 0.0), 2)
    total_cart = round(eligible_base + effective_freight, 2)

    if coupon.discount_type == "PERCENTAGE":
        discount_applied = round(eligible_base * (balance / 100.0), 2)
        remaining_balance = 0.0
    else:
        discount_applied = round(min(balance, eligible_base), 2)
        remaining_balance = round(max(0.0, balance - discount_applied), 2)

    difference_to_pay = round(max(0.0, total_cart - discount_applied), 2)
    fully_covered = difference_to_pay <= 0.009
    will_generate_residual = bool(
        coupon.discount_type == "FIXED_BRL"
        and coupon.allow_residual_balance
        and remaining_balance > 0.009
    )

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == data.company_id).first()
    configured_mode = getattr(settings, "b2c_checkout_mode", "NATIVE_GATEWAY") if settings else "NATIVE_GATEWAY"

    return {
        "valid": True,
        "code": coupon.code,
        "coupon_mode": coupon.coupon_mode,
        "discount_type": coupon.discount_type,
        "allows_freight_discount": coupon.allows_freight_discount,
        "free_shipping_granted": bool(coupon.allows_freight_discount),
        "allow_residual_balance": coupon.allow_residual_balance,
        "coupon_balance": round(balance, 2),
        "discount_applied": discount_applied,
        "remaining_coupon_balance": remaining_balance,
        "will_generate_residual_coupon": will_generate_residual,
        "subtotal": round(data.subtotal, 2),
        "freight": effective_freight,
        "total_cart": total_cart,
        "difference_to_pay": difference_to_pay,
        "fully_covered": fully_covered,
        "effective_checkout_mode": "FREE_VOUCHER" if fully_covered else configured_mode,
    }


@router.post("/public/checkout")
async def process_b2c_checkout(
    data: B2CCheckoutRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if not data.lgpd_accepted:
        raise HTTPException(
            status_code=400,
            detail="É obrigatório aceitar os Termos de Uso e Consentimento LGPD para finalizar o pedido.",
        )

    if not data.items:
        raise HTTPException(status_code=400, detail="O carrinho está vazio.")

    cpf_digits = _clean_digits(data.customer_cpf)
    if len(cpf_digits) < 11:
        raise HTTPException(status_code=400, detail="Informe um CPF válido.")

    company = db.query(Company).filter(Company.id == data.company_id, Company.active == True).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company.id).first()

    # 1. Find or create B2C Customer
    customer = (
        db.query(Customer)
        .filter(Customer.company_id == company.id, Customer.document == cpf_digits)
        .first()
    )
    if not customer:
        customer = Customer(
            company_id=company.id,
            name=data.customer_name.strip(),
            corporate_name=data.customer_name.strip(),
            document=cpf_digits,
            email=data.customer_email.strip().lower(),
            phone=data.customer_phone,
            customer_type="PF",
            crm_status="ACTIVE",
            city=data.city,
            state=data.state,
            password_hash=(
                security.get_password_hash(data.customer_password)
                if data.customer_password
                else None
            ),
        )
        db.add(customer)
        db.flush()
    else:
        customer.name = data.customer_name.strip()
        customer.email = data.customer_email.strip().lower()
        if data.customer_phone:
            customer.phone = data.customer_phone
        customer.city = data.city
        customer.state = data.state

    # Ensure shipping address
    addr = db.query(Address).filter(Address.customer_id == customer.id).first()
    if not addr:
        addr = Address(
            customer_id=customer.id,
            street=data.street,
            number=data.number,
            complement=data.complement,
            neighborhood=data.neighborhood,
            city=data.city,
            state=data.state[:2].upper(),
            zip_code=_clean_digits(data.zip_code),
            type="MAIN",
        )
        db.add(addr)
    else:
        addr.street = data.street
        addr.number = data.number
        addr.complement = data.complement
        addr.neighborhood = data.neighborhood
        addr.city = data.city
        addr.state = data.state[:2].upper()
        addr.zip_code = _clean_digits(data.zip_code)

    # 2. Record LGPD Consent Audit Log
    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    user_agent = request.headers.get("user-agent", "")[:500]
    lgpd_record = B2CLgpdConsent(
        company_id=company.id,
        customer_id=customer.id,
        customer_name=customer.name,
        customer_cpf=cpf_digits,
        customer_email=customer.email,
        ip_address=client_ip,
        user_agent=user_agent,
        terms_version=data.terms_version or "v1.0",
        marketing_opt_in=data.marketing_opt_in,
    )
    db.add(lgpd_record)

    # 3. Calculate Cart Subtotal & Validate Coupon (if provided)
    subtotal = round(sum(float(i.unit_price) * int(i.quantity) for i in data.items), 2)
    freight = round(max(0.0, float(data.freight_value or 0.0)), 2)

    coupon: Optional[B2CCoupon] = None
    discount_applied = 0.0
    previous_balance = 0.0
    remaining_balance = 0.0
    residual_coupon_code: Optional[str] = None

    if data.coupon_code and data.coupon_code.strip():
        coupon = _find_or_prepare_coupon(
            db=db,
            company_id=company.id,
            raw_code=data.coupon_code,
            customer_cpf=cpf_digits,
            create_wallet_if_shared=True,
            customer_name=customer.name,
            customer_email=customer.email,
        )
        if coupon.allows_freight_discount:
            freight = 0.0
        previous_balance = float(coupon.current_balance or 0)
        eligible_base = subtotal

        if coupon.discount_type == "PERCENTAGE":
            discount_applied = round(eligible_base * (previous_balance / 100.0), 2)
            remaining_balance = 0.0
        else:
            discount_applied = round(min(previous_balance, eligible_base), 2)
            remaining_balance = round(max(0.0, previous_balance - discount_applied), 2)

        # Update coupon balance & status
        coupon.used_amount = Decimal(str(round(float(coupon.used_amount or 0) + discount_applied, 2)))
        coupon.used_at = datetime.now(timezone.utc)
        if not coupon.assigned_cpf:
            coupon.assigned_cpf = cpf_digits
        if not coupon.assigned_name:
            coupon.assigned_name = customer.name
        if not coupon.assigned_email:
            coupon.assigned_email = customer.email

        # Generate a new child coupon with the residual balance if configured!
        if (
            coupon.discount_type == "FIXED_BRL"
            and coupon.allow_residual_balance
            and remaining_balance > 0.009
        ):
            residual_coupon_code = _generate_unique_code("SALDO")
            child_coupon = B2CCoupon(
                company_id=company.id,
                batch_id=coupon.batch_id,
                code=residual_coupon_code,
                coupon_mode="RESIDUAL",
                discount_type="FIXED_BRL",
                initial_value=Decimal(str(remaining_balance)),
                current_balance=Decimal(str(remaining_balance)),
                used_amount=Decimal("0.00"),
                allows_freight_discount=coupon.allows_freight_discount,
                allow_residual_balance=True,
                min_order_value=Decimal("0.00"),
                assigned_name=customer.name,
                assigned_cpf=cpf_digits,
                assigned_email=customer.email,
                parent_coupon_id=coupon.id,
                status="AVAILABLE",
                valid_from=coupon.valid_from,
                valid_until=coupon.valid_until,
            )
            db.add(child_coupon)
            coupon.current_balance = Decimal("0.00")
            coupon.status = "EXHAUSTED"
            coupon.generated_child_code = residual_coupon_code
        else:
            coupon.current_balance = Decimal(str(remaining_balance))
            coupon.status = "EXHAUSTED" if remaining_balance <= 0.009 else "PARTIALLY_USED"

    total_before_discount = round(subtotal + freight, 2)
    difference_to_pay = round(max(0.0, total_before_discount - discount_applied), 2)
    fully_covered = difference_to_pay <= 0.009

    # 4. Create Order in Cronuz B2B/B2C
    configured_mode = getattr(settings, "b2c_checkout_mode", "NATIVE_GATEWAY") if settings else "NATIVE_GATEWAY"
    tray_enabled = bool(getattr(settings, "tray_enabled", False)) if settings else False

    effective_mode = "FREE_VOUCHER" if fully_covered else (
        "TRAY_REDIRECT" if (configured_mode == "TRAY_REDIRECT" and tray_enabled) else "NATIVE_GATEWAY"
    )

    order = Order(
        company_id=company.id,
        customer_id=customer.id,
        status="PROCESSING" if fully_covered else "NEW",
        type_order="V",
        origin="b2c_storefront",
        customer_order_ref=coupon.code if coupon else "B2C_DIRECT",
        subtotal=subtotal,
        discount=discount_applied,
        total=difference_to_pay,
        payment_condition=effective_mode,
        confirmed_at=datetime.utcnow() if fully_covered else None,
    )
    db.add(order)
    db.flush()

    for item in data.items:
        line_total = round(float(item.unit_price) * int(item.quantity), 2)
        oi = OrderItem(
            order_id=order.id,
            product_id=item.product_id if (item.product_id and item.product_id > 0) else None,
            ean_isbn=item.ean_gtin or item.sku,
            sku=item.sku,
            name=item.name,
            brand=item.brand,
            quantity=item.quantity,
            quantity_requested=item.quantity,
            quantity_fulfilled=item.quantity if fully_covered else 0,
            unit_price=float(item.unit_price),
            total_price=line_total,
            price_gross=Decimal(str(round(float(item.unit_price), 2))),
        )
        db.add(oi)

    # 5. If TRAY_REDIRECT and difference_to_pay > 0: Sync Customer, Coupon & Cart in Tray
    tray_cart_url: Optional[str] = None
    tray_session_id: Optional[str] = None
    tray_coupon_code: Optional[str] = None
    tray_sync_warning: Optional[str] = None

    if effective_mode == "TRAY_REDIRECT":
        tray_client = TrayClient(db, company.id)
        try:
            tray_customer_id = await tray_client.ensure_customer_in_tray(
                {
                    "name": customer.name,
                    "email": customer.email,
                    "cpf": cpf_digits,
                    "phone": customer.phone,
                    "zip_code": data.zip_code,
                    "street": data.street,
                    "number": data.number,
                    "complement": data.complement,
                    "neighborhood": data.neighborhood,
                    "city": data.city,
                    "state": data.state,
                }
            )

            if discount_applied > 0:
                tray_coupon_res = await tray_client.create_coupon_in_tray(
                    code=f"CRZ{order.id}V{(coupon.code if coupon else '')[:6]}",
                    value=discount_applied,
                    description=f"Abatimento Voucher Cronuz Pedido #{order.id}",
                    discount_type="$",
                    customer_tray_id=tray_customer_id,
                    shipping_discount=bool(coupon and coupon.allows_freight_discount),
                )
                tray_coupon_code = tray_coupon_res.get("code")
                if coupon and tray_coupon_res.get("tray_coupon_id"):
                    coupon.tray_coupon_id = tray_coupon_res.get("tray_coupon_id")

            shipping_info = {
                "id": "1",
                "name": data.freight_service_name or "Entrega Padrão",
                "value": f"{freight:.2f}",
                "zip_code": _clean_digits(data.zip_code),
                "min_period": 2,
                "max_period": 7,
            }

            cart_res = await tray_client.create_cart_in_tray(
                items=[i.model_dump() for i in data.items],
                shipping_info=shipping_info,
                customer_email=customer.email,
                customer_tray_id=tray_customer_id,
                coupon_code=tray_coupon_code,
            )
            tray_cart_url = cart_res.get("cart_url")
            tray_session_id = cart_res.get("session_id")
            order.external_id = f"TRAY-{tray_session_id}"
        except Exception as e:
            logger.error(f"[B2C Checkout] Falha na comunicação com Tray: {e}")
            tray_sync_warning = str(e)
            if tray_client.store_url:
                tray_cart_url = tray_client.store_url

    # 6. Record Coupon Redemption Audit Entry
    if coupon:
        redemption = B2CCouponRedemption(
            company_id=company.id,
            coupon_id=coupon.id,
            batch_id=coupon.batch_id,
            order_id=order.id,
            customer_id=customer.id,
            coupon_code=coupon.code,
            customer_name=customer.name,
            customer_cpf=cpf_digits,
            customer_email=customer.email,
            order_subtotal=Decimal(str(subtotal)),
            order_freight=Decimal(str(freight)),
            discount_applied=Decimal(str(discount_applied)),
            previous_balance=Decimal(str(previous_balance)),
            remaining_balance=Decimal(str(remaining_balance)),
            residual_coupon_code=residual_coupon_code,
            difference_paid=Decimal(str(difference_to_pay)),
            checkout_mode=effective_mode,
            tray_cart_session_id=tray_session_id,
            tray_cart_url=tray_cart_url,
            tray_coupon_code=tray_coupon_code,
            status="COMPLETED" if fully_covered else (
                "REDIRECTED_TO_TRAY" if effective_mode == "TRAY_REDIRECT" else "PENDING_PAYMENT"
            ),
        )
        db.add(redemption)

    db.commit()
    db.refresh(order)

    # Generate PIX Copy/Paste payload if NATIVE_GATEWAY and difference_to_pay > 0
    pix_code = None
    if effective_mode == "NATIVE_GATEWAY" and difference_to_pay > 0:
        pix_code = (
            f"00020126580014BR.GOV.BCB.PIX0136cronuz-b2c-order-{order.id}"
            f"520400005303986540{difference_to_pay:.2f}5802BR5913{company.name[:13]}6009SAOPAULO62070503***6304ABCD"
        )

    return {
        "order_id": order.id,
        "status": order.status,
        "subtotal": subtotal,
        "freight": freight,
        "discount_applied": discount_applied,
        "difference_to_pay": difference_to_pay,
        "fully_covered": fully_covered,
        "checkout_mode": effective_mode,
        "residual_coupon_code": residual_coupon_code,
        "remaining_coupon_balance": remaining_balance,
        "tray_cart_url": tray_cart_url,
        "tray_coupon_code": tray_coupon_code,
        "tray_sync_warning": tray_sync_warning,
        "pix_code": pix_code,
        "message": (
            "Pedido 100% coberto pelo seu cupom e finalizado com sucesso!"
            if fully_covered
            else (
                "Carrinho e cupom preparados na loja Tray! Redirecionando para pagamento da diferença..."
                if effective_mode == "TRAY_REDIRECT"
                else "Pedido registrado! Realize o pagamento da diferença para concluir."
            )
        ),
    }
