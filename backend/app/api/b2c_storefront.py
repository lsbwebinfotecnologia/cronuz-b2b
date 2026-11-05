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
    payment_gateway_active: Optional[str] = None  # EFI or VINDI
    vindi_api_key: Optional[str] = None
    vindi_sandbox: Optional[bool] = None
    efi_client_id: Optional[str] = None
    efi_client_secret: Optional[str] = None
    efi_payee_code: Optional[str] = None
    efi_sandbox: Optional[bool] = None
    origin_zip_code: Optional[str] = None
    correios_user: Optional[str] = None
    correios_password: Optional[str] = None
    freight_config: Optional[Dict[str, Any]] = None
    horus_sync_config: Optional[Dict[str, Any]] = None
    tray_enabled: Optional[bool] = None
    tray_store_url: Optional[str] = None
    tray_auth_code: Optional[str] = None


class B2CHorusSyncRequest(BaseModel):
    cod_tpo_caract: Optional[str] = None
    cod_caract: Optional[str] = None
    characteristic_type_name: Optional[str] = None
    characteristic_value: Optional[str] = None
    search_term: Optional[str] = None
    auto_collect_bookinfo_covers: bool = False
    max_items: int = Field(default=250, ge=1, le=2000)


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


class B2CAuthCheckIdentityRequest(BaseModel):
    company_id: int
    identifier: str  # E-mail ou CPF


class B2CAuthLoginRequest(BaseModel):
    company_id: int
    identifier: str  # E-mail ou CPF
    password: str


class B2CAuthRegisterRequest(BaseModel):
    company_id: int
    name: str
    cpf: str
    email: str
    phone: Optional[str] = None
    password: str
    zip_code: Optional[str] = None
    street: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None


class B2CAuthForgotPasswordRequest(BaseModel):
    company_id: int
    identifier: str  # E-mail ou CPF


class B2CAuthResetPasswordRequest(BaseModel):
    company_id: int
    identifier: str
    recovery_code: str
    new_password: str


class B2COrderUpdateRequest(BaseModel):
    status: Optional[str] = None  # WAITING_PAYMENT, PAID, SEPARATION, FINALIZED, DELIVERED, CANCELLED
    invoice_number: Optional[str] = None
    invoice_key: Optional[str] = None
    tracking_code: Optional[str] = None
    carrier_name: Optional[str] = None
    tracking_url: Optional[str] = None
    notify_customer: bool = True


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
    total_weight_kg: Optional[float] = None


class B2CCartItemInput(BaseModel):
    product_id: Optional[int] = None
    sku: str
    ean_gtin: Optional[str] = None
    name: str
    author: Optional[str] = None
    brand: Optional[str] = None
    unit_price: float
    quantity: int = Field(default=1, ge=1)
    weight_kg: Optional[float] = None


class B2CCheckoutRequest(BaseModel):
    company_id: int
    customer_name: Optional[str] = ""
    customer_cpf: str
    customer_email: Optional[str] = ""
    customer_phone: Optional[str] = None
    customer_password: Optional[str] = None
    zip_code: Optional[str] = ""
    street: Optional[str] = ""
    number: Optional[str] = ""
    complement: Optional[str] = None
    neighborhood: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    items: List[B2CCartItemInput]
    freight_value: float = 0.0
    freight_service_name: Optional[str] = "Entrega Padrão"
    coupon_code: Optional[str] = None
    payment_method: Optional[str] = "PIX"  # PIX, CREDIT_CARD, PAYMENT_LINK, TRAY, VOUCHER_100
    card_holder_name: Optional[str] = None
    card_number: Optional[str] = None
    card_expiration: Optional[str] = None
    card_cvv: Optional[str] = None
    card_installments: Optional[int] = 1
    finger_print: Optional[str] = None
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
    shared_batches = (
        db.query(B2CCouponBatch)
        .filter(
            B2CCouponBatch.company_id == cid,
            B2CCouponBatch.batch_mode == "SHARED_CPF_LIMIT",
        )
        .all()
    )

    total_coupons = len(coupons) + len(shared_batches)
    available_coupons = sum(1 for c in coupons if c.status == "AVAILABLE") + sum(
        1 for b in shared_batches if b.active
    )
    partially_used = sum(1 for c in coupons if c.status == "PARTIALLY_USED")
    exhausted = sum(1 for c in coupons if c.status == "EXHAUSTED")
    residual_generated = sum(1 for c in coupons if c.coupon_mode == "RESIDUAL")

    # Exclude child residual coupons from initial_value sum to avoid double counting the original budget
    total_issued_value = sum(
        float(c.initial_value or 0) for c in coupons if c.coupon_mode != "RESIDUAL" and c.status != "CANCELLED"
    ) + sum(
        float(b.coupon_value or 0) * max(0, int(b.max_uses_total or 1) - len(b.coupons or []))
        for b in shared_batches
        if b.active and b.discount_type == "FIXED_BRL"
    )
    total_used_value = sum(float(c.used_amount or 0) for c in coupons if c.status != "CANCELLED")
    total_remaining_balance = sum(
        float(c.current_balance or 0) for c in coupons if c.status in ("AVAILABLE", "PARTIALLY_USED")
    ) + sum(
        float(b.coupon_value or 0) * max(0, int(b.max_uses_total or 1) - len(b.coupons or []))
        for b in shared_batches
        if b.active and b.discount_type == "FIXED_BRL"
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
    raw_cfg = getattr(settings, "b2c_showcases_config", None) if settings else None
    raw_freight = (
        raw_cfg.get("freight_config")
        if isinstance(raw_cfg, dict) and isinstance(raw_cfg.get("freight_config"), dict)
        else {}
    )
    freight_config = {
        "default_book_weight_kg": float(raw_freight.get("default_book_weight_kg", 0.35) or 0.35),
        "correios_enabled": bool(raw_freight.get("correios_enabled", True)),
        "carrier_table": raw_freight.get("carrier_table") if isinstance(raw_freight.get("carrier_table"), list) else [],
    }
    raw_sync_cfg = (
        raw_cfg.get("horus_sync_config")
        if isinstance(raw_cfg, dict) and isinstance(raw_cfg.get("horus_sync_config"), dict)
        else {}
    )
    horus_sync_config = {
        "cod_tpo_caract": str(raw_sync_cfg.get("cod_tpo_caract") or ""),
        "cod_caract": str(raw_sync_cfg.get("cod_caract") or ""),
        "characteristic_type_name": str(raw_sync_cfg.get("characteristic_type_name") or ""),
        "characteristic_value": str(raw_sync_cfg.get("characteristic_value") or ""),
        "search_term": str(raw_sync_cfg.get("search_term") or ""),
        "auto_collect_bookinfo_covers": bool(raw_sync_cfg.get("auto_collect_bookinfo_covers", False)),
        "last_sync_at": raw_sync_cfg.get("last_sync_at"),
        "last_synced_count": int(raw_sync_cfg.get("last_synced_count") or 0),
    }

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
            "payment_gateway_active": getattr(settings, "payment_gateway_active", "EFI") or "EFI" if settings else "EFI",
            "vindi_api_key": getattr(settings, "vindi_api_key", None) or "" if settings else "",
            "vindi_sandbox": (
                bool((settings.b2c_showcases_config or {}).get("vindi_config", {}).get("sandbox", True))
                if settings and isinstance(settings.b2c_showcases_config, dict)
                and isinstance(settings.b2c_showcases_config.get("vindi_config"), dict)
                else True
            ),
            "efi_sandbox": bool(getattr(settings, "efi_sandbox", True)) if settings else True,
            "efi_client_id": getattr(settings, "efi_client_id", None) or "" if settings else "",
            "efi_client_secret": getattr(settings, "efi_client_secret", None) or "" if settings else "",
            "efi_payee_code": getattr(settings, "efi_payee_code", None) or "" if settings else "",
            "origin_zip_code": getattr(settings, "origin_zip_code", None) or "" if settings else "",
            "correios_user": getattr(settings, "correios_user", None) or "" if settings else "",
            "correios_password": getattr(settings, "correios_password", None) or "" if settings else "",
            "horus_enabled": bool(getattr(settings, "horus_enabled", False)) if settings else False,
            "freight_config": freight_config,
            "horus_sync_config": horus_sync_config,
            "homologated_gateways": [
                {"id": "EFI", "name": "Efí (Gerencianet)", "status": "HOMOLOGATED", "methods": ["PIX", "CREDIT_CARD"]},
                {"id": "VINDI", "name": "Vindi Pagamentos", "status": "HOMOLOGATED", "methods": ["PIX", "CREDIT_CARD"]},
                {"id": "CIELO", "name": "Cielo API 3.0", "status": "IN_HOMOLOGATION", "methods": ["CREDIT_CARD", "PIX"]},
                {"id": "REDE", "name": "Rede (Itaú)", "status": "IN_HOMOLOGATION", "methods": ["CREDIT_CARD"]},
                {"id": "ASAAS", "name": "Asaas Pagamentos", "status": "IN_HOMOLOGATION", "methods": ["PIX", "CREDIT_CARD", "BOLETO"]},
            ],
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

    if data.payment_gateway_active is not None:
        gw = data.payment_gateway_active.strip().upper()
        if gw not in ("EFI", "VINDI"):
            raise HTTPException(
                status_code=400,
                detail="Apenas os gateways homologados (Efí e Vindi) podem ser ativados no checkout B2C.",
            )
        settings.payment_gateway_active = gw
    if data.vindi_api_key is not None:
        settings.vindi_api_key = data.vindi_api_key.strip() or None
    if data.efi_sandbox is not None:
        settings.efi_sandbox = bool(data.efi_sandbox)
    if data.efi_client_id is not None:
        settings.efi_client_id = data.efi_client_id.strip() or None
    if data.efi_client_secret is not None:
        settings.efi_client_secret = data.efi_client_secret.strip() or None
    if data.efi_payee_code is not None:
        settings.efi_payee_code = data.efi_payee_code.strip() or None
    if data.origin_zip_code is not None:
        settings.origin_zip_code = _clean_digits(data.origin_zip_code)[:8] or None
    if data.correios_user is not None:
        settings.correios_user = data.correios_user.strip() or None
    if data.correios_password is not None:
        settings.correios_password = data.correios_password.strip() or None

    from sqlalchemy.orm.attributes import flag_modified

    if data.freight_config is not None and isinstance(data.freight_config, dict):
        raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
        raw_cfg["freight_config"] = {
            "default_book_weight_kg": float(data.freight_config.get("default_book_weight_kg", 0.35) or 0.35),
            "correios_enabled": bool(data.freight_config.get("correios_enabled", True)),
            "carrier_table": (
                data.freight_config.get("carrier_table")
                if isinstance(data.freight_config.get("carrier_table"), list)
                else []
            ),
        }
        settings.b2c_showcases_config = raw_cfg
        flag_modified(settings, "b2c_showcases_config")

    if data.vindi_sandbox is not None:
        raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
        prev_vcfg = raw_cfg.get("vindi_config") if isinstance(raw_cfg.get("vindi_config"), dict) else {}
        raw_cfg["vindi_config"] = {**prev_vcfg, "sandbox": bool(data.vindi_sandbox)}
        settings.b2c_showcases_config = raw_cfg
        flag_modified(settings, "b2c_showcases_config")

    if data.horus_sync_config is not None and isinstance(data.horus_sync_config, dict):
        raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
        prev_sync = raw_cfg.get("horus_sync_config") if isinstance(raw_cfg.get("horus_sync_config"), dict) else {}
        raw_cfg["horus_sync_config"] = {
            **prev_sync,
            "cod_tpo_caract": str(data.horus_sync_config.get("cod_tpo_caract") or "").strip(),
            "cod_caract": str(data.horus_sync_config.get("cod_caract") or "").strip(),
            "characteristic_type_name": str(data.horus_sync_config.get("characteristic_type_name") or "").strip(),
            "characteristic_value": str(data.horus_sync_config.get("characteristic_value") or "").strip(),
            "search_term": str(data.horus_sync_config.get("search_term") or "").strip(),
            "auto_collect_bookinfo_covers": bool(data.horus_sync_config.get("auto_collect_bookinfo_covers", False)),
        }
        settings.b2c_showcases_config = raw_cfg
        flag_modified(settings, "b2c_showcases_config")

    db.commit()
    _b2c_cache_clear(cid)
    return {"message": "Configurações B2C atualizadas com sucesso!"}


class VindiOAuthExchangeRequest(BaseModel):
    consumer_key: str
    consumer_secret: str
    code: str
    sandbox: bool = True


@router.post("/vindi/generate-access-token")
async def generate_vindi_oauth_access_token(
    data: VindiOAuthExchangeRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Troca o `code` de autorização + `consumer_key` + `consumer_secret` por um `access_token`
    e `refresh_token` na API de Autorização da Vindi Commerce:
    POST /api/authorizations/access_token
    Ref: https://developers.vindi.com.br/reference/gerar-access-token
    """
    import httpx

    cid = _resolve_seller_company_id(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    base_api = (
        "https://api.intermediador.sandbox.yapay.com.br"
        if data.sandbox
        else "https://api.intermediador.yapay.com.br"
    )
    oauth_url = f"{base_api}/api/authorizations/access_token"
    payload = {
        "consumer_key": data.consumer_key.strip(),
        "consumer_secret": data.consumer_secret.strip(),
        "code": data.code.strip(),
        "type_response": "J",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(oauth_url, json=payload)
        body = r.json() if r.text else {}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Falha ao comunicar com a Vindi Commerce ({oauth_url}): {e}")

    auth_node = (body.get("data_response") or {}).get("authorization") or {}
    access_token = auth_node.get("access_token")
    if r.status_code not in (200, 201) or not access_token:
        raise HTTPException(
            status_code=400,
            detail=f"Vindi recusou a geração do Access Token (HTTP {r.status_code}): {r.text[:400]}",
        )

    if settings:
        raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
        prev_vcfg = raw_cfg.get("vindi_config") if isinstance(raw_cfg.get("vindi_config"), dict) else {}
        raw_cfg["vindi_config"] = {
            **prev_vcfg,
            "consumer_key": data.consumer_key.strip(),
            "consumer_secret": data.consumer_secret.strip(),
            "access_token": access_token,
            "refresh_token": auth_node.get("refresh_token"),
            "access_token_expiration": auth_node.get("access_token_expiration"),
        }
        settings.b2c_showcases_config = raw_cfg
        flag_modified(settings, "b2c_showcases_config")
        db.commit()

    return {
        "success": True,
        "access_token": access_token,
        "refresh_token": auth_node.get("refresh_token"),
        "access_token_expiration": auth_node.get("access_token_expiration"),
        "message": "Access Token OAuth Vindi Commerce gerado e salvo com sucesso!",
    }


class VindiHomologationTestRequest(BaseModel):
    amount: float = 1.00
    payment_method: str = "PIX"  # PIX, CREDIT_CARD or PAYMENT_LINK
    vindi_api_key: Optional[str] = None
    sandbox: Optional[bool] = None
    postal_code_seller: Optional[str] = None
    reseller_token: Optional[str] = None
    access_token: Optional[str] = None
    finger_print: Optional[str] = None
    customer_name: str = "CLIENTE TESTE HOMOLOGACAO"
    customer_cpf: str = "11144477735"
    customer_email: str = "homologacao@cronuzb2b.com.br"
    customer_phone: str = "11999999999"
    card_holder_name: Optional[str] = None
    card_number: Optional[str] = None
    card_expiration: Optional[str] = None
    card_cvv: Optional[str] = None
    installments: int = 1


@router.post("/vindi/test-transaction")
async def test_vindi_homologation_transaction(
    data: VindiHomologationTestRequest,
    request: Request,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Dispara uma cobrança de teste (padrão R$ 1,00) na Vindi com a chave informada/salva
    e devolve o diagnóstico técnico completo (HTTP status, endpoint chamado, códigos de erro
    da Vindi, solução recomendada e preview JSON).
    """
    from app.integrators.vindi_checkout import VindiCheckoutClient, VindiCheckoutError, read_vindi_sandbox_flag

    cid = _resolve_seller_company_id(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    effective_key = (data.vindi_api_key or "").strip() or (getattr(settings, "vindi_api_key", None) or "").strip()
    sandbox = read_vindi_sandbox_flag(settings) if data.sandbox is None else bool(data.sandbox)

    vindi = VindiCheckoutClient(db, cid, api_key=effective_key, sandbox=sandbox)
    if data.postal_code_seller:
        vindi.vindi_config["postal_code_seller"] = _clean_digits(data.postal_code_seller) or "01001000"
    if data.reseller_token is not None:
        vindi.vindi_config["reseller_token"] = data.reseller_token.strip()
    if data.access_token is not None:
        vindi.vindi_config["access_token"] = data.access_token.strip()

    method = (data.payment_method or "PIX").strip().upper()
    amount = round(max(0.01, float(data.amount or 1.00)), 2)
    test_order_id = int(datetime.utcnow().strftime("%y%m%d%H%M%S"))

    customer_payload = {
        "name": (data.customer_name or "CLIENTE TESTE HOMOLOGACAO").upper(),
        "cpf": _clean_digits(data.customer_cpf),
        "email": (data.customer_email or "homologacao@cronuzb2b.com.br").strip().lower(),
        "phone": _clean_digits(data.customer_phone) or "11999999999",
    }
    address_payload = {
        "zip_code": "01001000",
        "street": "PRACA DA SE",
        "number": "100",
        "neighborhood": "SE",
        "city": "SAO PAULO",
        "state": "SP",
    }
    fwd_ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    client_ip = fwd_ip or (request.client.host if request.client else None)
    base_url = str(request.base_url).rstrip("/")

    try:
        if method == "PAYMENT_LINK":
            res = await vindi.create_payment_link(
                order_id=test_order_id,
                amount=amount,
                customer=customer_payload,
                address=address_payload,
                api_base_url=base_url,
            )
            test_redirect_url = (
                f"{base_url}/b2c/public/vindi-checkout-test?"
                f"company_id={cid}&amount={amount:.2f}&sandbox={'1' if sandbox else '0'}"
                if vindi.credential_type == "VINDI_PAGAMENTOS"
                else res.get("payment_url")
            )
            return {
                "success": True,
                "simulated": False,
                "sandbox": sandbox,
                "credential_type": vindi.credential_type,
                "amount": amount,
                "payment_method": "PAYMENT_LINK",
                "mode": res.get("mode"),
                "transaction_id": res.get("transaction_id"),
                "token_transaction": res.get("token_transaction"),
                "url_car": res.get("url_car"),
                "status": res.get("status"),
                "gateway_status": res.get("gateway_status"),
                "paid": False,
                "payment_url": (
                    res.get("payment_url")
                    if res.get("mode") == "VINDI_COBRANCA_V3"
                    else test_redirect_url
                ),
                "pix_code": res.get("pix_code"),
                "pix_qr_code_url": res.get("pix_qr_code_url"),
                "diagnostics": res.get("diagnostics") or {},
                "message": (
                    f"Link de Pagamento Vindi validado e gerado na API ({'Sandbox' if sandbox else 'Produção'})! "
                    f"Token da Transação: {res.get('transaction_id')}"
                ),
            }

        res = await vindi.create_b2c_charge(
            order_id=test_order_id,
            amount=amount,
            payment_method=method,
            customer=customer_payload,
            address=address_payload,
            customer_ip=client_ip,
            finger_print=data.finger_print,
            api_base_url=base_url,
            allow_simulation=True,
            card_data=(
                {
                    "holder_name": (data.card_holder_name or data.customer_name).upper(),
                    "card_number": data.card_number,
                    "card_expiration": data.card_expiration,
                    "card_cvv": data.card_cvv,
                    "installments": max(1, int(data.installments or 1)),
                }
                if method == "CREDIT_CARD"
                else None
            ),
        )
    except VindiCheckoutError as ve:
        return {
            "success": False,
            "simulated": False,
            "sandbox": sandbox,
            "credential_type": vindi.credential_type,
            "amount": amount,
            "payment_method": method,
            "diagnostics": ve.diagnostics or {},
            "message": f"Falha na Vindi: {ve.message}",
        }

    simulated = bool(res.get("simulated"))
    return {
        "success": not simulated,
        "simulated": simulated,
        "sandbox": sandbox,
        "credential_type": vindi.credential_type,
        "amount": amount,
        "payment_method": method,
        "mode": res.get("mode"),
        "transaction_id": res.get("transaction_id"),
        "token_transaction": res.get("token_transaction"),
        "status": res.get("status"),
        "gateway_status": res.get("gateway_status"),
        "paid": bool(res.get("paid")),
        "payment_url": res.get("payment_url"),
        "pix_code": res.get("pix_code"),
        "pix_qr_code_url": res.get("pix_qr_code_url"),
        "diagnostics": res.get("diagnostics") or {},
        "message": (
            "SIMULADO: nenhuma chave Vindi configurada, a Vindi NÃO foi chamada."
            if simulated
            else f"Vindi respondeu com sucesso: cobrança de R$ {amount:.2f} ({method}) criada — ID {res.get('transaction_id')} "
            f"| situação na Vindi: {res.get('gateway_status')}"
        ),
    }


@router.get("/products/sync-config")
def get_b2c_horus_sync_config(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    company = db.query(Company).filter(Company.id == cid).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    raw_cfg = getattr(settings, "b2c_showcases_config", None) if settings else None
    raw_sync = (
        raw_cfg.get("horus_sync_config")
        if isinstance(raw_cfg, dict) and isinstance(raw_cfg.get("horus_sync_config"), dict)
        else {}
    )
    local_count = db.query(func.count(Product.id)).filter(Product.company_id == cid).scalar() or 0
    return {
        "company_id": cid,
        "horus_enabled": bool(getattr(settings, "horus_enabled", False)) if settings else False,
        "b2c_active": bool(
            (getattr(company, "module_b2c_storefront", False) if company else False)
            or (getattr(settings, "b2c_storefront_open", False) if settings else False)
        ),
        "local_products_count": local_count,
        "cod_tpo_caract": str(raw_sync.get("cod_tpo_caract") or ""),
        "cod_caract": str(raw_sync.get("cod_caract") or ""),
        "characteristic_type_name": str(raw_sync.get("characteristic_type_name") or ""),
        "characteristic_value": str(raw_sync.get("characteristic_value") or ""),
        "search_term": str(raw_sync.get("search_term") or ""),
        "auto_collect_bookinfo_covers": bool(raw_sync.get("auto_collect_bookinfo_covers", False)),
        "last_sync_at": raw_sync.get("last_sync_at"),
        "last_synced_count": int(raw_sync.get("last_synced_count") or 0),
    }


@router.put("/products/sync-config")
def update_b2c_horus_sync_config(
    data: B2CHorusSyncRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.orm.attributes import flag_modified
    cid = _resolve_seller_company_id(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    if not settings:
        settings = CompanySettings(company_id=cid)
        db.add(settings)
    raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
    prev_sync = raw_cfg.get("horus_sync_config") if isinstance(raw_cfg.get("horus_sync_config"), dict) else {}
    raw_cfg["horus_sync_config"] = {
        **prev_sync,
        "cod_tpo_caract": str(data.cod_tpo_caract or "").strip(),
        "cod_caract": str(data.cod_caract or "").strip(),
        "characteristic_type_name": str(data.characteristic_type_name or "").strip(),
        "characteristic_value": str(data.characteristic_value or "").strip(),
        "search_term": str(data.search_term or "").strip(),
        "auto_collect_bookinfo_covers": bool(data.auto_collect_bookinfo_covers),
    }
    settings.b2c_showcases_config = raw_cfg
    flag_modified(settings, "b2c_showcases_config")
    db.commit()
    return {
        "message": "Configuração de sincronização Horus → Cronuz salva com sucesso!",
        **get_b2c_horus_sync_config(company_id=cid, db=db, current_user=current_user),
    }


@router.get("/products/horus-characteristics")
async def list_horus_characteristics(
    cod_tpo_caract: Optional[str] = Query(None, description="Filtrar por Código do Tipo de Característica"),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Consulta no Horus ERP as características cadastradas (`Busca_Caracteristicas`),
    respeitando a configuração de OFFSET/LIMIT (`horus_legacy_pagination`) do seller.
    """
    cid = _resolve_seller_company_id(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    if not settings or not settings.horus_enabled:
        return {"items": [], "warning": "Integração Horus ERP não está habilitada para este seller."}

    from app.integrators.horus_products import HorusProducts
    client = HorusProducts(db, cid)
    params: Dict[str, Any] = {}
    if cod_tpo_caract and str(cod_tpo_caract).strip().isdigit():
        params["COD_TPO_CARACT"] = int(str(cod_tpo_caract).strip())
    if not getattr(settings, "horus_legacy_pagination", False):
        params["OFFSET"] = 0
        params["LIMIT"] = 1000

    try:
        resp = await client.get("Busca_Caracteristicas", params=params)
        await client.close()
        raw_list = []
        if isinstance(resp, list):
            raw_list = resp
        elif isinstance(resp, dict):
            raw_list = resp.get("item", resp.get("itens", resp.get("Caracteristicas", [])))
            if isinstance(raw_list, dict):
                raw_list = [raw_list]

        items = []
        for row in raw_list:
            if not isinstance(row, dict) or "Falha" in row or "FALHA" in row:
                continue
            tpo_code = str(row.get("COD_TPO_CARACT") or row.get("COD_TPO_CARACT_EXTRA") or "").strip()
            caract_code = str(row.get("COD_CARACT") or row.get("COD_CARACT_EXTRA") or "").strip()
            tpo_desc = str(row.get("DESC_TPO_CARACT") or row.get("NOM_TPO_CARACT") or f"Tipo {tpo_code}").strip()
            caract_desc = str(row.get("DESC_CARACT") or row.get("NOM_CARACT") or row.get("DESCRICAO") or "").strip()
            if tpo_code or caract_code or caract_desc:
                items.append({
                    "cod_tpo_caract": tpo_code,
                    "cod_caract": caract_code,
                    "characteristic_type_name": tpo_desc,
                    "characteristic_value": caract_desc,
                })
        return {"items": items}
    except Exception as e:
        try:
            await client.close()
        except Exception:
            pass
        return {"items": [], "warning": f"Não foi possível listar características do Horus: {str(e)}"}


@router.post("/products/sync-horus")
async def sync_horus_products_to_cronuz(
    data: B2CHorusSyncRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sincroniza os produtos do Horus ERP para a tabela `prd_product` do Cronuz (sem criar tabelas redundantes),
    filtrando pelo Código/Tipo de Característica (`COD_TPO_CARACT_EXTRA`) e Característica (`COD_CARACT_EXTRA`)
    configurados no seller, respeitando OFFSET/LIMIT (`horus_legacy_pagination`) e `SD_*`.
    Importa Nome, SKU, ISBN, Descrição/Sinopse, Preço, Saldo Disponível, Peso, Dimensões e Características,
    e opcionalmente coleta as capas na Bookinfo salvando com o nome do ISBN em `uploads/covers/<company_id>/`.
    """
    from sqlalchemy.orm.attributes import flag_modified
    from app.integrators.horus_products import HorusProducts
    from app.core.utils import parse_horus_price
    from app.models.catalog_support import Category, Brand, Characteristic, ProductCharacteristic
    from app.api.upload import STATIC_DIR, collect_bookinfo_cover_for_company

    cid = _resolve_seller_company_id(current_user, company_id)
    company = db.query(Company).filter(Company.id == cid).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    if not settings or not settings.horus_enabled:
        raise HTTPException(
            status_code=400,
            detail="A integração com o Horus ERP não está ativa para esta empresa.",
        )

    cod_tpo_str = str(data.cod_tpo_caract or "").strip()
    cod_caract_str = str(data.cod_caract or "").strip()
    char_type_name = str(data.characteristic_type_name or "").strip()
    char_val_name = str(data.characteristic_value or "").strip()
    search_term = str(data.search_term or "").strip()
    max_items = min(max(1, int(data.max_items or 250)), 2000)

    # Salvar configuração no seller
    raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
    prev_sync = raw_cfg.get("horus_sync_config") if isinstance(raw_cfg.get("horus_sync_config"), dict) else {}
    raw_freight = raw_cfg.get("freight_config") if isinstance(raw_cfg.get("freight_config"), dict) else {}
    default_weight = float(raw_freight.get("default_book_weight_kg", 0.35) or 0.35)

    cod_tpo_int = int(cod_tpo_str) if cod_tpo_str.isdigit() else None
    cod_caract_int = int(cod_caract_str) if cod_caract_str.isdigit() else None

    horus_client = HorusProducts(db, cid)
    id_doc = re.sub(r"\D", "", (company.document or "")) if company else ""
    if not id_doc and settings.horus_company and settings.horus_branch:
        id_doc = f"{settings.horus_company}{settings.horus_branch}"

    id_guid = (getattr(settings, "horus_default_b2b_guid", None) or "").strip()
    if not id_guid:
        cust_with_guid = (
            db.query(Customer)
            .filter(Customer.company_id == cid, Customer.id_guid.isnot(None), Customer.id_guid != "")
            .first()
        )
        if cust_with_guid:
            id_guid = (cust_with_guid.id_guid or "").strip()

    extra_kwargs: Dict[str, Any] = {}
    if cod_tpo_int is not None:
        extra_kwargs["COD_TPO_CARACT_EXTRA"] = cod_tpo_int
    if cod_caract_int is not None:
        extra_kwargs["COD_CARACT_EXTRA"] = cod_caract_int

    horus_items: List[Dict[str, Any]] = []
    batch_size = min(100, max_items)
    legacy_pag = bool(getattr(settings, "horus_legacy_pagination", False))

    try:
        offset = 0
        while len(horus_items) < max_items:
            current_limit = min(batch_size, max_items - len(horus_items))
            raw_resp = None

            # 1) Tentar Busca_AcervoB2B se houver ID_GUID configurado (traz SALDO_DISPONIVEL real e suporta COD_TPO_CARACT_EXTRA)
            if id_guid:
                try:
                    raw_resp = await horus_client.busca_acervo_b2b(
                        id_doc=id_doc,
                        id_guid=id_guid,
                        term=search_term if search_term else (None if (cod_tpo_int and cod_caract_int) else "A"),
                        is_showcase=bool(cod_tpo_int and cod_caract_int),
                        cod_tpo_caract_extra=cod_tpo_int,
                        cod_caract_extra=cod_caract_int,
                        offset=offset,
                        limit=current_limit,
                        **extra_kwargs,
                    )
                except Exception as e_b2b:
                    logger.warning(f"[B2C Horus Sync] Busca_AcervoB2B falhou ({e_b2b}), tentando Busca_Acervo padrão...")
                    raw_resp = None

            # 2) Fallback para Busca_Acervo padrão caso não haja ID_GUID ou Busca_AcervoB2B retorne falha
            is_failure = (
                isinstance(raw_resp, list)
                and len(raw_resp) > 0
                and isinstance(raw_resp[0], dict)
                and ("Falha" in raw_resp[0] or "FALHA" in raw_resp[0])
            )
            if raw_resp is None or is_failure:
                std_term = search_term if search_term else (None if (cod_tpo_int and cod_caract_int) else "A")
                raw_resp = await horus_client.busca_acervo_padrao(
                    id_doc=id_doc,
                    term=std_term,
                    offset=offset,
                    limit=current_limit,
                    **extra_kwargs,
                )

            page_list = []
            if isinstance(raw_resp, list):
                page_list = raw_resp
            elif isinstance(raw_resp, dict):
                page_list = raw_resp.get("item", raw_resp.get("itens", raw_resp.get("Acervo", [])))
                if isinstance(page_list, dict):
                    page_list = [page_list]

            valid_page = [
                r for r in page_list
                if isinstance(r, dict) and not ("Falha" in r or "FALHA" in r) and (r.get("COD_ITEM") or r.get("NOM_ITEM"))
            ]
            if not valid_page:
                break

            horus_items.extend(valid_page)
            if legacy_pag or len(valid_page) < current_limit:
                break
            offset += current_limit
    finally:
        try:
            await horus_client.close()
        except Exception:
            pass

    if not horus_items:
        raise HTTPException(
            status_code=404,
            detail="Nenhum produto retornado pelo Horus ERP para os filtros/características informados. Verifique o Código Tipo de Característica / Código da Característica ou o termo de busca.",
        )

    # Preparar característica no Cronuz (prd_characteristic) se configurada
    eff_char_type = char_type_name or (f"Característica Horus Tipo {cod_tpo_str}" if cod_tpo_str else "Origem Catálogo")
    eff_char_val = char_val_name or (f"Código {cod_caract_str}" if cod_caract_str else "Horus B2C")

    char_obj = (
        db.query(Characteristic)
        .filter(Characteristic.company_id == cid, func.lower(Characteristic.name) == eff_char_type.lower())
        .first()
    )
    if not char_obj:
        char_obj = Characteristic(
            company_id=cid,
            name=eff_char_type,
            options=eff_char_val,
        )
        db.add(char_obj)
        db.flush()

    # Mapear categorias, marcas e produtos locais já existentes para evitar queries N+1 e redundâncias
    existing_cats = {
        c.name.strip().upper(): c
        for c in db.query(Category).filter(Category.company_id == cid).all()
        if c.name
    }
    existing_brands = {
        b.name.strip().upper(): b
        for b in db.query(Brand).filter(Brand.company_id == cid).all()
        if b.name
    }
    local_products = db.query(Product).filter(Product.company_id == cid).all()
    by_cod: Dict[int, Product] = {}
    by_sku: Dict[str, Product] = {}
    by_ean: Dict[str, Product] = {}
    for lp in local_products:
        if lp.horus_cod_item:
            by_cod[int(lp.horus_cod_item)] = lp
        if lp.sku:
            by_sku[lp.sku.strip().upper()] = lp
        if lp.ean_gtin:
            by_ean[lp.ean_gtin.strip()] = lp

    created_count = 0
    updated_count = 0
    covers_collected = 0
    company_cover_dir = STATIC_DIR / str(cid)

    # Se a Tray estiver ativa no Seller, podemos consultar o ID do produto na Tray (por reference = COD_ITEM do Horus ou ean = ISBN)
    tray_client_sync: Optional[TrayClient] = None
    tray_token_sync: Optional[str] = None
    if getattr(settings, "tray_enabled", False):
        try:
            tray_client_sync = TrayClient(db, cid)
            tray_token_sync = await tray_client_sync.get_valid_token()
        except Exception:
            tray_client_sync = None
            tray_token_sync = None

    tray_linked_count = 0

    for h_item in horus_items:
        raw_cod = h_item.get("COD_ITEM")
        cod_item = int(raw_cod) if str(raw_cod or "").strip().isdigit() else 0
        isbn = str(
            h_item.get("BARRAS_ISBN")
            or h_item.get("COD_BARRA_ITEM")
            or h_item.get("COD_ISBN_ITEM")
            or h_item.get("ISBN")
            or ""
        ).strip()
        sku = str(cod_item if cod_item > 0 else (isbn or uuid.uuid4().hex[:8])).strip()
        name = str(h_item.get("NOM_ITEM") or h_item.get("DESCRICAO") or "").strip()
        if not name:
            continue

        synopsis = str(
            h_item.get("DESC_SINOPSE")
            or h_item.get("SINOPSE")
            or h_item.get("OBS_ITEM")
            or ""
        ).strip()
        author = str(h_item.get("NOM_AUTOR") or h_item.get("AUTOR") or "").strip()
        publisher = str(h_item.get("NOM_EDITORA") or h_item.get("NOM_FANTASIA") or "").strip()
        genre = str(
            h_item.get("GENERO_NIVEL_1")
            or h_item.get("DSC_GENERO")
            or h_item.get("NOM_GENERO")
            or ""
        ).strip()

        vlr_capa = parse_horus_price(
            str(h_item.get("VLR_CAPA") or h_item.get("PRECO") or h_item.get("VLR_PRECO") or "0")
        )
        vlr_liq = parse_horus_price(
            str(h_item.get("VLR_LIQ_CLI") or h_item.get("VLR_LIQ_DESCONTO_PDV") or "0")
        )
        base_price = vlr_capa if vlr_capa > 0 else vlr_liq
        promo_price = vlr_liq if (0 < vlr_liq < base_price) else None

        try:
            stock_qty = max(
                0,
                int(float(str(h_item.get("SALDO_DISPONIVEL", h_item.get("SALDO", 0)) or 0).replace(",", "."))),
            )
        except Exception:
            stock_qty = 0

        # Peso e Dimensões do Horus
        raw_peso = parse_horus_price(
            str(
                h_item.get("PESO")
                or h_item.get("PESO_ITEM")
                or h_item.get("PESO_BRUTO")
                or h_item.get("PESO_LIQ")
                or "0"
            )
        )
        if raw_peso > 15:
            weight_kg = round(raw_peso / 1000.0, 3)
        elif raw_peso > 0:
            weight_kg = round(raw_peso, 3)
        else:
            weight_kg = default_weight

        width_cm = (
            parse_horus_price(
                str(h_item.get("LARGURA") or h_item.get("LARGURA_ITEM") or h_item.get("VLR_LARGURA") or "0")
            )
            or None
        )
        height_cm = (
            parse_horus_price(
                str(h_item.get("ALTURA") or h_item.get("ALTURA_ITEM") or h_item.get("VLR_ALTURA") or "0")
            )
            or None
        )
        length_cm = (
            parse_horus_price(
                str(
                    h_item.get("COMPRIMENTO")
                    or h_item.get("COMPRIMENTO_ITEM")
                    or h_item.get("PROFUNDIDADE")
                    or h_item.get("ESPESSURA")
                    or "0"
                )
            )
            or None
        )

        # Categoria e Marca
        cat_id = None
        if genre:
            g_key = genre.upper()
            if g_key not in existing_cats:
                new_cat = Category(company_id=cid, name=genre[:150])
                db.add(new_cat)
                db.flush()
                existing_cats[g_key] = new_cat
            cat_id = existing_cats[g_key].id

        brand_id = None
        if publisher:
            b_key = publisher.upper()
            if b_key not in existing_brands:
                new_brand = Brand(company_id=cid, name=publisher[:100])
                db.add(new_brand)
                db.flush()
                existing_brands[b_key] = new_brand
            brand_id = existing_brands[b_key].id

        # Resolver produto existente sem duplicar
        prod = None
        if cod_item and cod_item in by_cod:
            prod = by_cod[cod_item]
        elif sku.upper() in by_sku:
            prod = by_sku[sku.upper()]
        elif isbn and isbn in by_ean:
            prod = by_ean[isbn]

        # Verificar se já existe capa salva em disco com o ISBN (<ISBN>.jpg ou <ISBN>.png)
        clean_isbn_file = re.sub(r"[^a-zA-Z0-9_\-]", "", isbn)
        local_cover_url = None
        if clean_isbn_file:
            if (company_cover_dir / f"{clean_isbn_file}.jpg").exists():
                local_cover_url = f"/uploads/covers/{cid}/{clean_isbn_file}.jpg"
            elif (company_cover_dir / f"{clean_isbn_file}.png").exists():
                local_cover_url = f"/uploads/covers/{cid}/{clean_isbn_file}.png"

        if not prod:
            prod = Product(
                company_id=cid,
                sku=sku,
                name=name[:255],
                short_description=synopsis[:400] if synopsis else None,
                long_description=synopsis if synopsis else None,
                base_price=base_price,
                promotional_price=promo_price,
                weight_kg=weight_kg,
                width_cm=width_cm,
                height_cm=height_cm,
                length_cm=length_cm,
                brand=publisher[:100] if publisher else None,
                model=author[:100] if author else None,
                ean_gtin=isbn[:50] if isbn else None,
                category_id=cat_id,
                brand_id=brand_id,
                status="ACTIVE",
                stock_quantity=stock_qty,
                allow_purchase=stock_qty > 0,
                stock_status_label="DISPONÍVEL" if stock_qty > 0 else "SEM ESTOQUE",
                cover_url=local_cover_url,
                horus_cod_item=cod_item if cod_item > 0 else None,
                subject=genre[:150] if genre else None,
            )
            db.add(prod)
            db.flush()
            created_count += 1
            if cod_item:
                by_cod[cod_item] = prod
            by_sku[sku.upper()] = prod
            if isbn:
                by_ean[isbn] = prod
        else:
            prod.name = name[:255]
            if synopsis:
                prod.short_description = synopsis[:400]
                prod.long_description = synopsis
            if base_price > 0:
                prod.base_price = base_price
            if promo_price is not None:
                prod.promotional_price = promo_price
            prod.stock_quantity = stock_qty
            prod.allow_purchase = stock_qty > 0
            prod.stock_status_label = "DISPONÍVEL" if stock_qty > 0 else "SEM ESTOQUE"
            if weight_kg and (not prod.weight_kg or prod.weight_kg <= 0):
                prod.weight_kg = weight_kg
            if width_cm:
                prod.width_cm = width_cm
            if height_cm:
                prod.height_cm = height_cm
            if length_cm:
                prod.length_cm = length_cm
            if publisher:
                prod.brand = publisher[:100]
                prod.brand_id = brand_id
            if author:
                prod.model = author[:100]
            if isbn:
                prod.ean_gtin = isbn[:50]
            if cat_id:
                prod.category_id = cat_id
            if genre:
                prod.subject = genre[:150]
            if cod_item > 0:
                prod.horus_cod_item = cod_item
            if local_cover_url and not prod.cover_url:
                prod.cover_url = local_cover_url
            updated_count += 1

        # Vincular a característica configurada ao produto (sem duplicar)
        existing_pc = (
            db.query(ProductCharacteristic)
            .filter(
                ProductCharacteristic.product_id == prod.id,
                ProductCharacteristic.characteristic_id == char_obj.id,
            )
            .first()
        )
        item_char_val = str(
            h_item.get("DESC_CARACT")
            or h_item.get("NOM_CARACT")
            or eff_char_val
        ).strip()[:150]
        if not existing_pc:
            db.add(
                ProductCharacteristic(
                    product_id=prod.id,
                    characteristic_id=char_obj.id,
                    value=item_char_val,
                )
            )
        else:
            existing_pc.value = item_char_val

        # Coleta opcional na Bookinfo quando não há capa local (limitado a 25 por lote síncrono para alta performance)
        if data.auto_collect_bookinfo_covers and not prod.cover_url and isbn and covers_collected < 25:
            try:
                await collect_bookinfo_cover_for_company(
                    db=db,
                    company_id=cid,
                    isbn=isbn,
                    product_id=prod.id,
                )
                covers_collected += 1
            except Exception:
                pass

        # Vincular automaticamente o ID do produto na Tray (usando reference = COD_ITEM do Horus ou ean = ISBN)
        if tray_client_sync and tray_token_sync and not (prod.publisher_code and str(prod.publisher_code).isdigit()):
            try:
                resolved_tid = await tray_client_sync.ensure_product_in_tray(
                    {
                        "product_id": prod.id,
                        "horus_cod_item": prod.horus_cod_item or cod_item,
                        "sku": prod.sku,
                        "ean_gtin": prod.ean_gtin or isbn,
                        "name": prod.name,
                        "unit_price": prod.base_price,
                    }
                )
                if resolved_tid and str(resolved_tid).isdigit():
                    prod.publisher_code = str(resolved_tid)
                    tray_linked_count += 1
            except Exception:
                pass

    now_iso = datetime.now(timezone.utc).isoformat()
    raw_cfg["horus_sync_config"] = {
        **prev_sync,
        "cod_tpo_caract": cod_tpo_str,
        "cod_caract": cod_caract_str,
        "characteristic_type_name": eff_char_type,
        "characteristic_value": eff_char_val,
        "search_term": search_term,
        "auto_collect_bookinfo_covers": bool(data.auto_collect_bookinfo_covers),
        "last_sync_at": now_iso,
        "last_synced_count": created_count + updated_count,
    }
    settings.b2c_showcases_config = raw_cfg
    flag_modified(settings, "b2c_showcases_config")
    db.commit()
    _b2c_cache_clear(cid)

    return {
        "message": (
            f"Sincronização Horus → Cronuz concluída com sucesso! "
            f"{created_count} novo(s) produto(s) cadastrado(s), {updated_count} atualizado(s)"
            + (f" e {tray_linked_count} vinculado(s) com ID da Tray." if tray_linked_count > 0 else ".")
        ),
        "created_count": created_count,
        "updated_count": updated_count,
        "tray_linked_count": tray_linked_count,
        "total_processed": created_count + updated_count,
        "covers_collected": covers_collected,
        "last_sync_at": now_iso,
    }


class B2CTrayProductSyncRequest(BaseModel):
    import_missing_from_tray: bool = True
    limit: int = 50


@router.post("/products/sync-tray")
async def sync_or_link_products_with_tray(
    data: B2CTrayProductSyncRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Vincula os produtos da tabela `prd_product` do Cronuz com o `id` correspondente na Tray
    (consultando `GET /web_api/products` por `reference` = Código do Horus e por `ean` = ISBN),
    e opcionalmente importa produtos ativos da Tray para `prd_product` guardando o código
    do Horus (`reference` -> `horus_cod_item` / `sku`), `ean` (`ean_gtin`) e o `id` da Tray (`publisher_code`).
    """
    import httpx
    from app.models.catalog_support import Category, Brand

    cid = _resolve_seller_company_id(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    if not settings or not getattr(settings, "tray_enabled", False):
        raise HTTPException(
            status_code=400,
            detail="A integração com a Tray não está ativa nas configurações desta empresa.",
        )

    tray_client = TrayClient(db, cid)
    try:
        token = await tray_client.get_valid_token()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Falha ao obter token OAuth da Tray: {e}")

    local_products = db.query(Product).filter(Product.company_id == cid).all()
    by_cod: Dict[int, Product] = {}
    by_sku: Dict[str, Product] = {}
    by_ean: Dict[str, Product] = {}
    for lp in local_products:
        if lp.horus_cod_item:
            by_cod[int(lp.horus_cod_item)] = lp
        if lp.sku:
            by_sku[lp.sku.strip().upper()] = lp
        if lp.ean_gtin:
            by_ean[lp.ean_gtin.strip()] = lp

    linked_count = 0
    imported_count = 0

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        # 1. Para cada produto já existente em prd_product sem vínculo Tray, buscar por reference (Horus) ou ean (ISBN)
        for lp in local_products:
            if lp.publisher_code and str(lp.publisher_code).strip().isdigit():
                continue
            ref_val = str(lp.horus_cod_item or lp.sku or "").strip()
            ean_val = str(lp.ean_gtin or "").strip()
            found_tid = None

            if ref_val:
                r_ref = await client.get(
                    f"{tray_client.api_address}/products",
                    params={"access_token": token, "reference": ref_val},
                )
                if r_ref.status_code == 200:
                    prods = (r_ref.json() or {}).get("Products") or []
                    if prods:
                        found_tid = (prods[0].get("Product") or {}).get("id")

            if not found_tid and ean_val:
                r_ean = await client.get(
                    f"{tray_client.api_address}/products",
                    params={"access_token": token, "ean": ean_val},
                )
                if r_ean.status_code == 200:
                    prods = (r_ean.json() or {}).get("Products") or []
                    if prods:
                        found_tid = (prods[0].get("Product") or {}).get("id")

            if found_tid and str(found_tid).isdigit():
                lp.publisher_code = str(found_tid)
                linked_count += 1

        # 2. Se solicitado, sincronizar/importar lote de produtos ativos da Tray (trazendo id Tray, reference Horus e ean)
        if data.import_missing_from_tray:
            max_limit = max(1, min(100, int(data.limit or 50)))
            r_list = await client.get(
                f"{tray_client.api_address}/products",
                params={"access_token": token, "available": 1, "limit": min(50, max_limit)},
            )
            if r_list.status_code == 200:
                raw_prods = (r_list.json() or {}).get("Products") or []
                for wrapper in raw_prods[:max_limit]:
                    tp = wrapper.get("Product") if isinstance(wrapper, dict) else {}
                    if not isinstance(tp, dict):
                        continue
                    tid = str(tp.get("id") or "").strip()
                    ref = str(tp.get("reference") or "").strip()
                    ean = str(tp.get("ean") or "").strip()
                    name = str(tp.get("name") or "").strip()
                    if not tid or not name:
                        continue

                    try:
                        stock_qty = max(0, int(float(tp.get("stock") or 0)))
                    except Exception:
                        stock_qty = 0

                    cod_int = int(ref) if ref.isdigit() else 0
                    sku_val = ref or ean or f"TRAY-{tid}"

                    prod = None
                    if cod_int and cod_int in by_cod:
                        prod = by_cod[cod_int]
                    elif sku_val.upper() in by_sku:
                        prod = by_sku[sku_val.upper()]
                    elif ean and ean in by_ean:
                        prod = by_ean[ean]

                    try:
                        base_price = float(tp.get("price") or 0.0)
                    except Exception:
                        base_price = 0.0
                    try:
                        promo_raw = float(tp.get("promotional_price") or 0.0)
                        promo_price = promo_raw if (0 < promo_raw < base_price) else None
                    except Exception:
                        promo_price = None

                    try:
                        w_raw = float(tp.get("weight") or 0.0)
                        weight_kg = round(w_raw / 1000.0, 3) if w_raw > 15 else (round(w_raw, 3) if w_raw > 0 else 0.35)
                    except Exception:
                        weight_kg = 0.35

                    width_cm = float(tp.get("width") or 0) or None
                    height_cm = float(tp.get("height") or 0) or None
                    length_cm = float(tp.get("length") or 0) or None
                    brand_str = str(tp.get("brand") or "").strip()

                    props = tp.get("Properties") if isinstance(tp.get("Properties"), dict) else {}
                    autor_list = props.get("Autor") if isinstance(props.get("Autor"), list) else []
                    author_str = str(autor_list[0] if autor_list else (tp.get("model") or "")).strip()

                    imgs = tp.get("ProductImage") if isinstance(tp.get("ProductImage"), list) else []
                    tray_img_url = None
                    if imgs and isinstance(imgs[0], dict):
                        tray_img_url = imgs[0].get("https") or imgs[0].get("http")

                    brand_id = None
                    if brand_str:
                        b_obj = db.query(Brand).filter(Brand.company_id == cid, Brand.name.ilike(brand_str[:100])).first()
                        if not b_obj:
                            b_obj = Brand(company_id=cid, name=brand_str[:100])
                            db.add(b_obj)
                            db.flush()
                        brand_id = b_obj.id

                    if not prod:
                        prod = Product(
                            company_id=cid,
                            sku=sku_val[:100],
                            name=name[:255],
                            base_price=base_price,
                            promotional_price=promo_price,
                            weight_kg=weight_kg,
                            width_cm=width_cm,
                            height_cm=height_cm,
                            length_cm=length_cm,
                            brand=brand_str[:100] if brand_str else None,
                            brand_id=brand_id,
                            model=author_str[:100] if author_str else None,
                            ean_gtin=ean[:50] if ean else None,
                            status="ACTIVE",
                            stock_quantity=stock_qty,
                            allow_purchase=stock_qty > 0,
                            stock_status_label="DISPONÍVEL" if stock_qty > 0 else "SEM ESTOQUE",
                            cover_url=tray_img_url,
                            horus_cod_item=cod_int if cod_int > 0 else None,
                            publisher_code=tid,
                        )
                        db.add(prod)
                        db.flush()
                        imported_count += 1
                        if cod_int:
                            by_cod[cod_int] = prod
                        by_sku[sku_val.upper()] = prod
                        if ean:
                            by_ean[ean] = prod
                    else:
                        prod.publisher_code = tid
                        if cod_int > 0 and not prod.horus_cod_item:
                            prod.horus_cod_item = cod_int
                        if ean and not prod.ean_gtin:
                            prod.ean_gtin = ean[:50]
                        if tray_img_url and not prod.cover_url:
                            prod.cover_url = tray_img_url
                        linked_count += 1

    db.commit()
    _b2c_cache_clear(cid)

    return {
        "message": (
            f"Sincronização Tray concluída! {linked_count} produto(s) vinculado(s) com ID da Tray "
            f"e {imported_count} importado(s) com Código Horus (reference) + EAN."
        ),
        "linked_count": linked_count,
        "imported_count": imported_count,
    }



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
        # Na loja aberta B2C, habilitar Comprar se houver saldo > 0, ou Avise-me caso saldo <= 0
        item["allow_purchase"] = int(item.get("stock_quantity") or 0) > 0

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

    # Map real-time stock_quantity from local Product table so showcases reflect real stock
    local_stock_map: Dict[str, int] = {}
    try:
        local_prods = (
            db.query(Product.id, Product.sku, Product.ean_gtin, Product.stock_quantity)
            .filter(Product.company_id == company.id)
            .all()
        )
        for lp in local_prods:
            st_val = max(0, int(lp.stock_quantity or 0))
            if lp.id:
                local_stock_map[f"id:{lp.id}"] = st_val
            if lp.sku:
                local_stock_map[f"sku:{str(lp.sku).strip()}"] = st_val
            if lp.ean_gtin:
                local_stock_map[f"ean:{str(lp.ean_gtin).strip()}"] = st_val
    except Exception:
        pass

    showcases = []
    for sc in raw_showcases:
        if isinstance(sc, dict):
            sc_copy = dict(sc)
            sc_items = sc_copy.get("items") if isinstance(sc_copy.get("items"), list) else []
            enriched_items = []
            for raw_it in sc_items:
                if not isinstance(raw_it, dict):
                    continue
                it_copy = dict(raw_it)
                pid = it_copy.get("id") or it_copy.get("product_id")
                sku_k = str(it_copy.get("sku") or "").strip()
                ean_k = str(it_copy.get("ean_gtin") or "").strip()
                real_stock = None
                if pid and f"id:{pid}" in local_stock_map:
                    real_stock = local_stock_map[f"id:{pid}"]
                elif sku_k and f"sku:{sku_k}" in local_stock_map:
                    real_stock = local_stock_map[f"sku:{sku_k}"]
                elif ean_k and f"ean:{ean_k}" in local_stock_map:
                    real_stock = local_stock_map[f"ean:{ean_k}"]
                if real_stock is not None:
                    it_copy["stock_quantity"] = real_stock
                    it_copy["allow_purchase"] = real_stock > 0
                enriched_items.append(it_copy)
            sc_copy["items"] = _apply_b2c_promotions_to_items(enriched_items, promotions)
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

    # Preserve existing cache_config, contact_messages, freight_config, order_metadata, stock_notifications and horus_sync_config
    existing_raw = getattr(settings, "b2c_showcases_config", None)
    if isinstance(existing_raw, dict):
        for preserved_key in ("cache_config", "contact_messages", "freight_config", "order_metadata", "stock_notifications", "horus_sync_config"):
            if preserved_key in existing_raw:
                current_cfg[preserved_key] = existing_raw[preserved_key]

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
    results = []

    # Include SHARED_CPF_LIMIT batches as master multi-use coupons in the main list
    batch_q = db.query(B2CCouponBatch).filter(
        B2CCouponBatch.company_id == cid,
        B2CCouponBatch.batch_mode == "SHARED_CPF_LIMIT",
    )
    if batch_id:
        batch_q = batch_q.filter(B2CCouponBatch.id == batch_id)
    if search:
        term = f"%{search.strip()}%"
        batch_q = batch_q.filter(
            or_(
                B2CCouponBatch.shared_code.ilike(term),
                B2CCouponBatch.name.ilike(term),
                B2CCouponBatch.partner_company_name.ilike(term),
            )
        )
    shared_batches = batch_q.order_by(B2CCouponBatch.created_at.desc()).all()
    for b in shared_batches:
        b_coupons = [c for c in (b.coupons or []) if c.coupon_mode != "RESIDUAL"]
        used_c = len(b_coupons)
        max_u = int(b.max_uses_total or 1)
        consumed_val = sum(float(c.used_amount or 0) for c in b_coupons)
        b_status = (
            "CANCELLED"
            if not b.active
            else ("EXHAUSTED" if used_c >= max_u else ("PARTIALLY_USED" if used_c > 0 else "AVAILABLE"))
        )
        if status and b_status != status:
            continue
        results.append(
            {
                "id": -b.id,
                "batch_id": b.id,
                "batch_name": b.name,
                "partner_company_name": b.partner_company_name,
                "code": b.shared_code or "",
                "coupon_mode": "MULTI_USE",
                "discount_type": b.discount_type,
                "initial_value": float(b.coupon_value or 0),
                "current_balance": float(b.coupon_value or 0),
                "used_amount": round(consumed_val, 2),
                "max_uses": max_u,
                "uses_count": used_c,
                "allows_freight_discount": b.allows_freight_discount,
                "allow_residual_balance": b.allow_residual_balance,
                "min_order_value": float(b.min_order_value or 0),
                "assigned_name": f"Até {max_u} usos ({used_c}/{max_u} utilizados)",
                "assigned_cpf": None,
                "assigned_email": None,
                "parent_coupon_id": None,
                "generated_child_code": None,
                "status": b_status,
                "valid_from": b.valid_from.isoformat() if b.valid_from else None,
                "valid_until": b.valid_until.isoformat() if b.valid_until else None,
                "used_at": None,
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
        )

    for c in coupons:
        # Avoid duplicating individual usage rows of a general MULTI_USE coupon unless it's a RESIDUAL coupon
        if c.coupon_mode == "CPF_WALLET" and c.batch and not c.batch.eligible_cpfs_json:
            continue
        results.append(
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
                "max_uses": 1,
                "uses_count": 1 if c.status in ("PARTIALLY_USED", "EXHAUSTED") else 0,
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
        )
    return results


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
    if coupon_id < 0:
        batch = db.query(B2CCouponBatch).filter(B2CCouponBatch.id == abs(coupon_id), B2CCouponBatch.company_id == cid).first()
        if not batch:
            raise HTTPException(status_code=404, detail="Cupom não encontrado.")
        batch.active = False
        db.commit()
        return {"message": f"Cupom {batch.shared_code} cancelado."}

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


B2C_STATUS_LABELS: Dict[str, str] = {
    "WAITING_PAYMENT": "Aguardando Pagamento",
    "PAID": "Pago",
    "SEPARATION": "Em Separação",
    "FINALIZED": "Finalizado",
    "DELIVERED": "Entregue",
    "CANCELLED": "Cancelado",
}


def _normalize_b2c_order_status(raw_status: Optional[str]) -> str:
    st = str(raw_status or "WAITING_PAYMENT").strip().upper()
    legacy_map = {
        "NEW": "WAITING_PAYMENT",
        "PENDING": "WAITING_PAYMENT",
        "PROCESSING": "PAID",
        "INVOICED": "FINALIZED",
        "SENT": "DELIVERED",
        "SHIPPED": "DELIVERED",
        "CANCELED": "CANCELLED",
    }
    norm = legacy_map.get(st, st)
    return norm if norm in B2C_STATUS_LABELS else "WAITING_PAYMENT"


def _parse_order_meta(order: Order) -> Dict[str, Any]:
    for col_name in ("invoice_xml", "partner_reference"):
        raw_ref = getattr(order, col_name, None)
        if raw_ref and str(raw_ref).strip().startswith("{"):
            try:
                parsed = _json.loads(raw_ref)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass
    return {}


def _save_order_meta(order: Order, meta: Dict[str, Any]) -> None:
    try:
        dumped = _json.dumps(meta, ensure_ascii=False)
        order.invoice_xml = dumped
        order.partner_reference = str(meta.get("payment_gateway") or "B2C")[:95]
    except Exception:
        pass


@router.get("/orders")
def list_b2c_orders(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
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
        norm_status = _normalize_b2c_order_status(o.status)
        if status and status.strip().upper() != "ALL" and norm_status != status.strip().upper():
            continue

        cust_name = (red.customer_name if red else None) or (cust.name if cust else "Cliente B2C")
        cust_cpf = (red.customer_cpf if red else None) or (getattr(cust, "document", "") if cust else "")
        cust_email = (red.customer_email if red else None) or (cust.email if cust else "")
        cust_phone = getattr(cust, "phone", None) or ""
        coupon_code = (red.coupon_code if red else None) or (
            o.customer_order_ref if o.customer_order_ref and o.customer_order_ref != "B2C_DIRECT" else None
        )
        residual_code = red.residual_coupon_code if red else None

        addr = None
        if cust and getattr(cust, "addresses", None):
            addr = cust.addresses[0]

        meta = _parse_order_meta(o)
        carrier_name = meta.get("carrier_name") or ""
        tracking_url = meta.get("tracking_url") or ""
        freight_val = float(red.order_freight or 0) if red else float(meta.get("freight_value") or 0.0)
        freight_service_name = meta.get("freight_service_name") or "Entrega Padrão"
        payment_gateway = meta.get("payment_gateway") or ""
        payment_method = meta.get("payment_method") or o.payment_condition or "PIX"

        if search:
            term = search.strip().lower()
            haystack = (
                f"{o.id} {cust_name} {cust_cpf} {cust_email} {coupon_code or ''} "
                f"{residual_code or ''} {o.external_id or ''} {o.tracking_code or ''} {o.invoice_number or ''}"
            ).lower()
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

        meta_ship = meta.get("shipping_address") if isinstance(meta.get("shipping_address"), dict) else {}
        results.append(
            {
                "id": o.id,
                "status": norm_status,
                "status_label": B2C_STATUS_LABELS.get(norm_status, norm_status),
                "raw_status": o.status,
                "checkout_mode": o.payment_condition or (red.checkout_mode if red else "NATIVE_GATEWAY"),
                "payment_gateway": payment_gateway,
                "payment_method": payment_method,
                "external_id": o.external_id,
                "vindi_token_transaction": meta.get("vindi_token_transaction"),
                "vindi_transaction_id": meta.get("vindi_transaction_id"),
                "vindi_status_name": meta.get("vindi_status_name"),
                "vindi_payment_url": meta.get("vindi_payment_url") or meta.get("vindi_pix_url"),
                "payment_history": meta.get("payment_history") if isinstance(meta.get("payment_history"), list) else [],
                "customer_name": cust_name,
                "customer_cpf": cust_cpf,
                "customer_email": cust_email,
                "customer_phone": cust_phone,
                "shipping_address": {
                    "street": (getattr(addr, "street", "") if addr else "") or meta_ship.get("street") or "",
                    "number": (getattr(addr, "number", "") if addr else "") or meta_ship.get("number") or "",
                    "complement": (getattr(addr, "complement", "") if addr else "") or meta_ship.get("complement") or "",
                    "neighborhood": (getattr(addr, "neighborhood", "") if addr else "") or meta_ship.get("neighborhood") or "",
                    "city": (getattr(addr, "city", "") if addr else "") or meta_ship.get("city") or (getattr(cust, "city", "") if cust else ""),
                    "state": (getattr(addr, "state", "") if addr else "") or meta_ship.get("state") or (getattr(cust, "state", "") if cust else ""),
                    "zip_code": (getattr(addr, "zip_code", "") if addr else "") or meta_ship.get("zip_code") or "",
                },
                "subtotal": float(o.subtotal or 0),
                "freight": round(freight_val, 2),
                "freight_service_name": freight_service_name,
                "discount_applied": float(o.discount or 0),
                "difference_paid": float(o.total or 0),
                "coupon_code": coupon_code,
                "previous_balance": float(red.previous_balance or 0) if red else 0.0,
                "remaining_balance": float(red.remaining_balance or 0) if red else 0.0,
                "residual_coupon_code": residual_code,
                "invoice_number": o.invoice_number or "",
                "invoice_key": o.invoice_key or "",
                "tracking_code": o.tracking_code or "",
                "carrier_name": carrier_name,
                "tracking_url": tracking_url,
                "tray_cart_url": red.tray_cart_url if red else None,
                "tray_coupon_code": red.tray_coupon_code if red else None,
                "redemption_status": red.status if red else None,
                "items_count": sum(i["quantity"] for i in items_list),
                "items": items_list,
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "confirmed_at": o.confirmed_at.isoformat() if o.confirmed_at else None,
            }
        )

    return results


@router.patch("/orders/{order_id}")
def update_b2c_order(
    order_id: int,
    data: B2COrderUpdateRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.company_id == cid, Order.origin == "b2c_storefront")
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido B2C não encontrado.")

    meta = _parse_order_meta(order)
    status_changed = False

    if data.status is not None:
        new_st = _normalize_b2c_order_status(data.status)
        if new_st != _normalize_b2c_order_status(order.status):
            status_changed = True
        order.status = new_st
        if new_st == "PAID" and not order.confirmed_at:
            order.confirmed_at = datetime.utcnow()
            red = (
                db.query(B2CCouponRedemption)
                .filter(B2CCouponRedemption.company_id == cid, B2CCouponRedemption.order_id == order.id)
                .first()
            )
            if red and red.status == "PENDING_PAYMENT":
                red.status = "COMPLETED"

    if data.invoice_number is not None:
        order.invoice_number = data.invoice_number.strip() or None
    if data.invoice_key is not None:
        order.invoice_key = _clean_digits(data.invoice_key)[:44] or None
    if data.tracking_code is not None:
        order.tracking_code = data.tracking_code.strip().upper() or None
    if data.carrier_name is not None:
        meta["carrier_name"] = data.carrier_name.strip()
    if data.tracking_url is not None:
        meta["tracking_url"] = data.tracking_url.strip()

    _save_order_meta(order, meta)
    db.commit()
    db.refresh(order)
    _b2c_cache_clear(cid)

    # Optionally send transactional email notification using Seller's SMTP if configured
    if status_changed or data.tracking_code:
        try:
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
            company = db.query(Company).filter(Company.id == cid).first()
            cust = order.customer
            if settings and settings.smtp_host and cust and cust.email:
                from app.core.email import send_smtp_email
                st_label = B2C_STATUS_LABELS.get(_normalize_b2c_order_status(order.status), order.status)
                tracking_html = (
                    f"<p><strong>Código de Rastreio:</strong> {order.tracking_code}</p>"
                    if order.tracking_code
                    else ""
                )
                nfe_html = (
                    f"<p><strong>Nota Fiscal:</strong> {order.invoice_number}</p>"
                    if order.invoice_number
                    else ""
                )
                send_smtp_email(
                    host=settings.smtp_host,
                    port=settings.smtp_port or 587,
                    username=settings.smtp_username or "",
                    password=settings.smtp_password or "",
                    from_email=settings.smtp_from_email or settings.smtp_username or "noreply@cronuz.com.br",
                    to_email=cust.email,
                    subject=f"Atualização do Pedido #{order.id}: {st_label} - {company.name if company else 'Loja'}",
                    html_content=(
                        f"<div style='font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                        f"<h2 style='color:#0f172a;margin-top:0;'>Olá, {cust.name}!</h2>"
                        f"<p style='color:#475569;'>O status do seu pedido <strong>#{order.id}</strong> na loja <strong>{company.name if company else ''}</strong> foi atualizado para:</p>"
                        f"<div style='background:#f8fafc;padding:14px 18px;border-radius:8px;font-weight:bold;color:#4f46e5;font-size:16px;margin:16px 0;'>{st_label}</div>"
                        f"{tracking_html}{nfe_html}"
                        f"<p style='color:#64748b;font-size:12px;margin-top:24px;'>Você também pode acompanhar todos os detalhes em Minha Conta → Meus Pedidos na loja.</p>"
                        f"</div>"
                    ),
                    use_ssl=bool(settings.smtp_use_ssl),
                )
        except Exception as e:
            logger.warning(f"[B2C Order Email] Não foi possível disparar e-mail do pedido #{order.id}: {e}")

    return {
        "message": f"Pedido #{order.id} atualizado com sucesso!",
        "id": order.id,
        "status": _normalize_b2c_order_status(order.status),
        "status_label": B2C_STATUS_LABELS.get(_normalize_b2c_order_status(order.status), order.status),
        "invoice_number": order.invoice_number or "",
        "invoice_key": order.invoice_key or "",
        "tracking_code": order.tracking_code or "",
        "carrier_name": meta.get("carrier_name") or "",
        "tracking_url": meta.get("tracking_url") or "",
    }


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

    from app.payments.registry import default_channel_modes, routes_map
    all_routes = routes_map(db, company.id)
    b2c_routes = all_routes.get("B2C_STOREFRONT") or {}
    ch_modes = default_channel_modes(settings, all_routes)
    b2c_ch_mode = ch_modes.get("B2C_STOREFRONT") or {"mode": "PER_METHOD"}

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
        "b2c_channel_mode": b2c_ch_mode.get("mode", "PER_METHOD"),
        "b2c_method_providers": b2c_routes,
        "tray_enabled": bool(getattr(settings, "tray_enabled", False)) if settings else False,
        "tray_store_url": getattr(settings, "tray_store_url", None) if settings else None,
        "b2c_default_freight_value": float(getattr(settings, "b2c_default_freight_value", 0) or 0) if settings else 0.0,
        "b2c_free_shipping_min_value": float(getattr(settings, "b2c_free_shipping_min_value", 0) or 0) if settings else 0.0,
        "b2c_lgpd_terms_text": (getattr(settings, "b2c_lgpd_terms_text", None) if settings else None) or default_lgpd,
        "payment_gateway_active": getattr(settings, "payment_gateway_active", "EFI") if settings else "EFI",
        "vindi_integration_mode": (
            "PAYMENT_LINK"
            if b2c_ch_mode.get("mode") == "PAYMENT_LINK"
            else (
                str((settings.b2c_showcases_config or {}).get("vindi_config", {}).get("integration_mode") or "TRANSPARENT").upper()
                if settings and isinstance(settings.b2c_showcases_config, dict)
                and isinstance(settings.b2c_showcases_config.get("vindi_config"), dict)
                else "TRANSPARENT"
            )
        ),
        "vindi_express_cpf_only": bool(b2c_ch_mode.get("express_cpf_only", True)),
        "vindi_sandbox": (
            bool((settings.b2c_showcases_config or {}).get("vindi_config", {}).get("sandbox", True))
            if settings and isinstance(settings.b2c_showcases_config, dict)
            and isinstance(settings.b2c_showcases_config.get("vindi_config"), dict)
            else True
        ),
        "vindi_max_installments": (
            int((settings.b2c_showcases_config or {}).get("vindi_config", {}).get("max_installments") or 6)
            if settings and isinstance(settings.b2c_showcases_config, dict)
            and isinstance(settings.b2c_showcases_config.get("vindi_config"), dict)
            else 6
        ),
        "payment_gateway_ready": bool(
            settings
            and (
                (getattr(settings, "payment_gateway_active", "EFI") == "VINDI" and len((settings.vindi_api_key or "").strip()) >= 8)
                or getattr(settings, "payment_gateway_active", "EFI") != "VINDI"
            )
        ),
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

    local_active_count = (
        db.query(func.count(Product.id))
        .filter(Product.company_id == company_id, Product.status == "ACTIVE")
        .scalar()
        or 0
    )

    # Se o seller ainda não sincronizou produtos para a tabela prd_product e tem Horus ativo, usa fallback Horus
    if local_active_count == 0 and settings and settings.horus_enabled:
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

    # Catálogo Local do Cronuz (prd_product sincronizado do Horus ou cadastrado manualmente)
    from sqlalchemy.orm import joinedload
    from app.models.catalog_support import Category
    query = (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.brand_rel), joinedload(Product.characteristics))
        .filter(
            Product.company_id == company_id,
            Product.status == "ACTIVE",
        )
    )
    if search_term:
        like_term = f"%{search_term}%"
        if filter == "NOM_EDITORA":
            query = query.filter(Product.brand.ilike(like_term))
        elif filter == "NOM_AUTOR":
            query = query.filter(Product.model.ilike(like_term))
        elif filter == "COD_GENERO":
            query = query.outerjoin(Category, Product.category_id == Category.id).filter(
                or_(Category.name.ilike(like_term), Product.subject.ilike(like_term))
            )
        else:
            query = query.filter(
                or_(
                    Product.name.ilike(like_term),
                    Product.ean_gtin.ilike(like_term),
                    Product.sku.ilike(like_term),
                    Product.brand.ilike(like_term),
                    Product.model.ilike(like_term),
                    Product.subject.ilike(like_term),
                    Product.short_description.ilike(like_term),
                )
            )

    total = query.count()
    products = (
        query.order_by((Product.stock_quantity > 0).desc(), Product.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    allow_backorder = settings.allow_backorder if settings else False

    mapped = []
    for p in products:
        real_qty = max(0, int(p.stock_quantity or 0))
        allow, label = calculate_product_availability(
            real_qty,
            None,
            getattr(p, "is_pre_sale", False),
            getattr(p, "is_out_of_print", False),
            allow_backorder,
        )
        chars_list = []
        for pc in (getattr(p, "characteristics", None) or []):
            c_name = pc.characteristic.name if getattr(pc, "characteristic", None) else "Característica"
            chars_list.append({"name": c_name, "value": pc.value})

        mapped.append(
            {
                "id": p.id,
                "company_id": p.company_id,
                "sku": p.sku,
                "ean_gtin": p.ean_gtin or "",
                "name": p.name,
                "author": getattr(p, "author", None) or getattr(p, "model", None) or "",
                "base_price": float(p.base_price or 0.0),
                "promotional_price": float(p.promotional_price) if getattr(p, "promotional_price", None) else None,
                "stock_quantity": real_qty,
                "weight_kg": float(p.weight_kg) if p.weight_kg else None,
                "width_cm": float(p.width_cm) if p.width_cm else None,
                "height_cm": float(p.height_cm) if p.height_cm else None,
                "length_cm": float(p.length_cm) if p.length_cm else None,
                "characteristics": chars_list,
                "status": p.status,
                "short_description": p.short_description or "",
                "long_description": p.long_description or p.short_description or "",
                "brand": (p.brand_rel.name if getattr(p, "brand_rel", None) else None) or p.brand or "",
                "category": (
                    {"id": p.category.id, "name": p.category.name}
                    if getattr(p, "category", None)
                    else {"id": 0, "name": p.subject or "Geral"}
                ),
                "allow_purchase": real_qty > 0,
                "stock_status_label": "Em Estoque" if real_qty > 0 else "Avise-me quando chegar",
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


class B2CStockNotifyRequest(BaseModel):
    company_id: int
    email: str
    name: Optional[str] = None
    product_id: Optional[int] = None
    sku: str
    ean_gtin: Optional[str] = None
    product_name: str


@router.post("/public/stock-notify")
def register_b2c_stock_notify(
    data: B2CStockNotifyRequest,
    db: Session = Depends(get_db),
):
    """
    Registra solicitação 'Avise-me' quando o produto está sem estoque.
    Associa ao cliente (ou e-mail) com a bandeira 'AVISE-ME' na tela B2C -> Clientes.
    """
    email_clean = (data.email or "").strip().lower()
    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=400, detail="Informe um e-mail válido para ser avisado.")

    company = db.query(Company).filter(Company.id == data.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Loja não encontrada.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company.id).first()
    if not settings:
        settings = CompanySettings(company_id=company.id)
        db.add(settings)
        db.flush()

    current_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
    notifications = current_cfg.get("stock_notifications", [])
    if not isinstance(notifications, list):
        notifications = []

    # Check if customer already exists in crm_customer by email
    existing_cust = (
        db.query(Customer)
        .filter(Customer.company_id == company.id, func.lower(Customer.email) == email_clean)
        .first()
    )

    cust_name = (data.name or "").strip().upper() or (existing_cust.name if existing_cust else email_clean.split("@")[0].upper())
    sku_clean = (data.sku or "").strip().upper()

    # Avoid duplicate pending alert for same email + sku
    already_exists = any(
        isinstance(n, dict)
        and str(n.get("email") or "").lower() == email_clean
        and str(n.get("sku") or "").upper() == sku_clean
        and n.get("status") == "PENDING"
        for n in notifications
    )
    if not already_exists:
        notifications.insert(
            0,
            {
                "id": uuid.uuid4().hex[:10],
                "email": email_clean,
                "customer_name": cust_name,
                "customer_id": existing_cust.id if existing_cust else None,
                "product_id": data.product_id,
                "sku": sku_clean,
                "ean_gtin": (data.ean_gtin or "").strip(),
                "product_name": (data.product_name or "Produto").strip(),
                "status": "PENDING",
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        current_cfg["stock_notifications"] = notifications[:500]
        settings.b2c_showcases_config = current_cfg
        flag_modified(settings, "b2c_showcases_config")
        db.commit()

    return {
        "status": "OK",
        "message": f"Pronto! Assim que '{data.product_name}' voltar ao estoque, avisaremos você em {email_clean}.",
    }


@router.get("/customers")
def list_b2c_customers_and_alerts(
    search: Optional[str] = Query(None),
    only_stock_alerts: bool = Query(False),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Lista todos os clientes da Loja B2C + Solicitações com bandeira 'Avise-me' (produtos sem estoque).
    """
    cid = _resolve_seller_company_id(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    raw_cfg = getattr(settings, "b2c_showcases_config", None) if settings else None
    notifications = (
        raw_cfg.get("stock_notifications", [])
        if isinstance(raw_cfg, dict) and isinstance(raw_cfg.get("stock_notifications"), list)
        else []
    )

    # Current stock lookup for alerted products
    stock_by_sku: Dict[str, int] = {}
    try:
        prods = db.query(Product.sku, Product.ean_gtin, Product.stock_quantity).filter(Product.company_id == cid).all()
        for p in prods:
            st = max(0, int(p.stock_quantity or 0))
            if p.sku:
                stock_by_sku[str(p.sku).strip().upper()] = st
            if p.ean_gtin:
                stock_by_sku[str(p.ean_gtin).strip().upper()] = st
    except Exception:
        pass

    alerts_by_email: Dict[str, List[Dict[str, Any]]] = {}
    enriched_notifications: List[Dict[str, Any]] = []
    for n in notifications:
        if not isinstance(n, dict):
            continue
        em = str(n.get("email") or "").strip().lower()
        sku_k = str(n.get("sku") or "").strip().upper()
        ean_k = str(n.get("ean_gtin") or "").strip().upper()
        curr_stock = stock_by_sku.get(sku_k, stock_by_sku.get(ean_k, 0))
        n_copy = {**n, "current_stock": curr_stock}
        enriched_notifications.append(n_copy)
        if em:
            alerts_by_email.setdefault(em, []).append(n_copy)

    # B2C Orders summary per customer
    b2c_orders = db.query(Order).filter(Order.company_id == cid, Order.origin == "b2c_storefront").all()
    orders_by_cust: Dict[int, List[Order]] = {}
    for o in b2c_orders:
        if o.customer_id:
            orders_by_cust.setdefault(o.customer_id, []).append(o)

    # Customers who bought in B2C or have password_hash or match stock alerts
    all_customers = db.query(Customer).filter(Customer.company_id == cid).order_by(Customer.id.desc()).limit(500).all()
    seen_emails = set()
    customer_rows: List[Dict[str, Any]] = []

    for c in all_customers:
        em = (c.email or "").strip().lower()
        c_orders = orders_by_cust.get(c.id, [])
        c_alerts = alerts_by_email.get(em, []) if em else []
        is_b2c = bool(c.password_hash or len(c_orders) > 0 or len(c_alerts) > 0)
        if not is_b2c:
            continue
        if em:
            seen_emails.add(em)

        pending_alerts = [a for a in c_alerts if a.get("status") == "PENDING"]
        if only_stock_alerts and len(pending_alerts) == 0:
            continue

        row = {
            "id": f"cust-{c.id}",
            "customer_id": c.id,
            "name": c.name,
            "cpf": getattr(c, "document", "") or "",
            "email": c.email or "",
            "phone": c.phone or "",
            "city": c.city or "",
            "state": c.state or "",
            "orders_count": len(c_orders),
            "total_spent": round(sum(float(o.total or 0) for o in c_orders), 2),
            "has_avise_me": len(pending_alerts) > 0,
            "stock_alerts": c_alerts,
            "created_at": c.created_at.isoformat() if getattr(c, "created_at", None) else None,
        }
        customer_rows.append(row)

    # Also include visitors who left their e-mail in "Avise-me" without registering a full account yet
    for em, al_list in alerts_by_email.items():
        if em in seen_emails:
            continue
        pending_alerts = [a for a in al_list if a.get("status") == "PENDING"]
        if only_stock_alerts and len(pending_alerts) == 0:
            continue
        first_al = al_list[0]
        customer_rows.append(
            {
                "id": f"lead-{em}",
                "customer_id": None,
                "name": first_al.get("customer_name") or em.split("@")[0].upper(),
                "cpf": "",
                "email": em,
                "phone": "",
                "city": "",
                "state": "",
                "orders_count": 0,
                "total_spent": 0.0,
                "has_avise_me": len(pending_alerts) > 0,
                "stock_alerts": al_list,
                "created_at": first_al.get("created_at"),
            }
        )

    if search:
        term = search.strip().lower()
        customer_rows = [
            r
            for r in customer_rows
            if term in (r.get("name") or "").lower()
            or term in (r.get("email") or "").lower()
            or term in (r.get("cpf") or "").lower()
            or any(
                term in str(a.get("product_name") or "").lower() or term in str(a.get("sku") or "").lower()
                for a in (r.get("stock_alerts") or [])
            )
        ]

    # Sort: customers with active "Avise-me" first, then most recent
    customer_rows.sort(key=lambda x: (1 if x.get("has_avise_me") else 0, x.get("orders_count") or 0), reverse=True)

    return {
        "customers": customer_rows,
        "stock_notifications": enriched_notifications,
        "pending_alerts_count": sum(1 for n in enriched_notifications if n.get("status") == "PENDING"),
    }


@router.patch("/customers/stock-notify/{notify_id}")
def update_b2c_stock_notify_status(
    notify_id: str,
    status: str = Query("NOTIFIED"),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cid = _resolve_seller_company_id(current_user, company_id)
    company = db.query(Company).filter(Company.id == cid).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    if not settings or not isinstance(settings.b2c_showcases_config, dict):
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")

    current_cfg = dict(settings.b2c_showcases_config)
    notifications = current_cfg.get("stock_notifications", [])
    target_alert = None
    for n in notifications:
        if isinstance(n, dict) and n.get("id") == notify_id:
            n["status"] = status.upper()
            n["updated_at"] = datetime.now(timezone.utc).isoformat()
            target_alert = n
            break

    if not target_alert:
        raise HTTPException(status_code=404, detail="Solicitação Avise-me não encontrada.")

    current_cfg["stock_notifications"] = notifications
    settings.b2c_showcases_config = current_cfg
    flag_modified(settings, "b2c_showcases_config")
    db.commit()

    # Optional automatic email notification if status == NOTIFIED
    if status.upper() == "NOTIFIED" and target_alert.get("email") and settings.smtp_host and settings.smtp_username and settings.smtp_password:
        try:
            from app.core.email import send_smtp_email
            store_name = company.name if company else "Nossa Loja"
            prod_title = target_alert.get("product_name") or "Produto"
            html_body = f"""
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px;">
                <h2 style="color: #0f172a; margin-top: 0;">Boas notícias! O item que você queria voltou ao estoque 🎉</h2>
                <p style="color: #475569; font-size: 14px;">Olá, <strong>{target_alert.get('customer_name') or 'Cliente'}</strong>!</p>
                <p style="color: #475569; font-size: 14px;">O livro <strong>{prod_title}</strong> (Cód: {target_alert.get('sku')}) já está disponível novamente em <strong>{store_name}</strong>.</p>
                <p style="color: #64748b; font-size: 12px; margin-top: 16px;">Acesse nossa loja virtual para garantir o seu exemplar antes que acabe!</p>
            </div>
            """
            send_smtp_email(
                smtp_host=settings.smtp_host,
                smtp_port=int(settings.smtp_port or 587),
                smtp_username=settings.smtp_username,
                smtp_password=settings.smtp_password,
                from_email=settings.smtp_from_email or settings.smtp_username,
                to_email=target_alert["email"],
                subject=f"[{store_name}] {prod_title} voltou ao estoque!",
                html_content=html_body,
            )
        except Exception as e:
            logger.warning(f"[B2C Stock Notify] Falha no disparo de e-mail Avise-me: {e}")

    return {"message": "Status do alerta Avise-me atualizado com sucesso!", "alert": target_alert}


def _uf_from_cep(cep_digits: str) -> str:
    if not cep_digits or len(cep_digits) < 2:
        return "SP"
    prefix = int(cep_digits[:2])
    if 1 <= prefix <= 19:
        return "SP"
    if 20 <= prefix <= 28:
        return "RJ"
    if prefix == 29:
        return "ES"
    if 30 <= prefix <= 39:
        return "MG"
    if 40 <= prefix <= 48:
        return "BA"
    if prefix == 49:
        return "SE"
    if 50 <= prefix <= 56:
        return "PE"
    if prefix == 57:
        return "AL"
    if prefix == 58:
        return "PB"
    if prefix == 59:
        return "RN"
    if 60 <= prefix <= 63:
        return "CE"
    if prefix == 64:
        return "PI"
    if prefix == 65:
        return "MA"
    if 66 <= prefix <= 68:
        return "PA"
    if prefix == 69:
        return "AM"
    if 70 <= prefix <= 73:
        return "DF"
    if 74 <= prefix <= 76:
        return "GO"
    if prefix == 77:
        return "TO"
    if prefix == 78:
        return "MT"
    if prefix == 79:
        return "MS"
    if 80 <= prefix <= 87:
        return "PR"
    if 88 <= prefix <= 89:
        return "SC"
    if 90 <= prefix <= 99:
        return "RS"
    return "SP"


@router.post("/public/freight/calculate")
def calculate_b2c_freight(
    data: FreightCalculateRequest,
    db: Session = Depends(get_db),
):
    dest_cep = _clean_digits(data.zip_code)
    if len(dest_cep) < 8:
        raise HTTPException(status_code=400, detail="Informe um CEP válido com 8 dígitos.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == data.company_id).first()
    default_freight = float(getattr(settings, "b2c_default_freight_value", 0) or 0) if settings else 0.0
    free_min = float(getattr(settings, "b2c_free_shipping_min_value", 0) or 0) if settings else 0.0
    origin_cep = _clean_digits(getattr(settings, "origin_zip_code", None) or "01001000")

    raw_cfg = getattr(settings, "b2c_showcases_config", None) if settings else None
    raw_freight = (
        raw_cfg.get("freight_config")
        if isinstance(raw_cfg, dict) and isinstance(raw_cfg.get("freight_config"), dict)
        else {}
    )
    default_book_weight = float(raw_freight.get("default_book_weight_kg", 0.35) or 0.35)
    correios_enabled = bool(raw_freight.get("correios_enabled", True))
    carrier_table = raw_freight.get("carrier_table") if isinstance(raw_freight.get("carrier_table"), list) else []

    total_weight_kg = round(
        float(data.total_weight_kg)
        if (data.total_weight_kg and data.total_weight_kg > 0)
        else max(0.20, int(data.items_count or 1) * default_book_weight),
        3,
    )

    is_free_by_min = free_min > 0 and data.subtotal >= free_min
    dest_uf = _uf_from_cep(dest_cep)
    origin_uf = _uf_from_cep(origin_cep)

    # Distance factor based on CEP prefix difference
    same_state = dest_uf == origin_uf
    same_region = dest_cep[:1] == origin_cep[:1]
    extra_kg = max(0.0, total_weight_kg - 0.5)

    options: List[Dict[str, Any]] = []

    # 1. Custom Carrier Table rules configured by Seller (matched by UF or CEP range + Weight range)
    dest_cep_num = int(dest_cep[:8])
    for idx, rule in enumerate(carrier_table):
        if not isinstance(rule, dict) or rule.get("active") is False:
            continue
        r_uf = str(rule.get("uf") or "ALL").strip().upper()
        if r_uf and r_uf not in ("ALL", "TODOS", "*") and r_uf != dest_uf:
            continue

        cep_start_str = _clean_digits(rule.get("cep_start") or "")
        cep_end_str = _clean_digits(rule.get("cep_end") or "")
        if len(cep_start_str) == 8 and len(cep_end_str) == 8:
            if not (int(cep_start_str) <= dest_cep_num <= int(cep_end_str)):
                continue

        w_min = float(rule.get("weight_min_kg") or 0.0)
        w_max = float(rule.get("weight_max_kg") or 999.0)
        if not (w_min <= total_weight_kg <= w_max):
            continue

        r_price = 0.0 if is_free_by_min else float(rule.get("price") or 0.0)
        r_days = max(1, int(rule.get("delivery_days") or 5))
        r_name = str(rule.get("name") or f"Transportadora ({dest_uf})").strip()
        options.append(
            {
                "id": f"CARRIER_{idx + 1}",
                "name": f"{r_name} - Frete Grátis" if is_free_by_min else f"{r_name} ({total_weight_kg:.2f} kg)",
                "price": round(r_price, 2),
                "delivery_days": r_days,
                "weight_kg": total_weight_kg,
            }
        )

    # 2. Direct Correios calculation (PAC & SEDEX by CEP distance + Weight in kg)
    if correios_enabled or not options:
        base_pac = default_freight if default_freight > 0 else (14.90 if same_state else (19.90 if same_region else 25.90))
        pac_calc = 0.0 if is_free_by_min else round(base_pac + (extra_kg * (3.20 if same_state else 5.50)), 2)
        pac_days = 4 if same_state else (6 if same_region else 9)

        base_sedex = (default_freight + 11.00) if default_freight > 0 else (21.90 if same_state else (31.90 if same_region else 42.90))
        sedex_calc = round(base_sedex + (extra_kg * (5.90 if same_state else 9.80)), 2)
        sedex_days = 1 if same_state else (2 if same_region else 4)

        options.append(
            {
                "id": "CORREIOS_PAC",
                "name": (
                    f"Frete Grátis Promocional (Correios PAC - {total_weight_kg:.2f} kg)"
                    if is_free_by_min
                    else f"Correios PAC ({total_weight_kg:.2f} kg)"
                ),
                "price": pac_calc,
                "delivery_days": pac_days,
                "weight_kg": total_weight_kg,
            }
        )
        options.append(
            {
                "id": "CORREIOS_SEDEX",
                "name": f"Correios SEDEX Expresso ({total_weight_kg:.2f} kg)",
                "price": sedex_calc,
                "delivery_days": sedex_days,
                "weight_kg": total_weight_kg,
            }
        )

    return {
        "options": options,
        "total_weight_kg": total_weight_kg,
        "destination_uf": dest_uf,
        "origin_zip_code": origin_cep,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 3B. PUBLIC B2C CUSTOMER AUTHENTICATION, PASSWORD RESET & MY ORDERS
# ══════════════════════════════════════════════════════════════════════════════

_B2C_PASSWORD_RESET_CODES: Dict[str, Dict[str, Any]] = {}


def _serialize_b2c_customer(customer: Customer) -> Dict[str, Any]:
    addr = customer.addresses[0] if getattr(customer, "addresses", None) else None
    return {
        "id": customer.id,
        "name": customer.name,
        "cpf": getattr(customer, "document", "") or "",
        "email": customer.email or "",
        "phone": customer.phone or "",
        "has_password": bool(customer.password_hash),
        "address": {
            "zip_code": getattr(addr, "zip_code", "") if addr else "",
            "street": getattr(addr, "street", "") if addr else "",
            "number": getattr(addr, "number", "") if addr else "",
            "complement": getattr(addr, "complement", "") if addr else "",
            "neighborhood": getattr(addr, "neighborhood", "") if addr else "",
            "city": (getattr(addr, "city", "") if addr else "") or (customer.city or ""),
            "state": (getattr(addr, "state", "") if addr else "") or (customer.state or ""),
        },
    }


def _find_b2c_customer_by_identifier(db: Session, company_id: int, identifier: str) -> Optional[Customer]:
    clean_id = (identifier or "").strip()
    if not clean_id:
        return None
    digits = _clean_digits(clean_id)
    if "@" in clean_id:
        return (
            db.query(Customer)
            .filter(Customer.company_id == company_id, func.lower(Customer.email) == clean_id.lower())
            .first()
        )
    if len(digits) >= 11:
        cust = (
            db.query(Customer)
            .filter(Customer.company_id == company_id, Customer.document == digits)
            .first()
        )
        if cust:
            return cust
    return (
        db.query(Customer)
        .filter(
            Customer.company_id == company_id,
            or_(
                func.lower(Customer.email) == clean_id.lower(),
                Customer.document == digits if digits else False,
            ),
        )
        .first()
    )


@router.post("/public/auth/check-identity")
def check_b2c_customer_identity(
    data: B2CAuthCheckIdentityRequest,
    db: Session = Depends(get_db),
):
    """
    Identificação Inteligente no Checkout (estilo grandes lojas virtuais):
    Verifica se o E-mail ou CPF já possui conta na loja do Seller.
    """
    cust = _find_b2c_customer_by_identifier(db, data.company_id, data.identifier)
    if not cust:
        digits = _clean_digits(data.identifier)
        return {
            "exists": False,
            "has_password": False,
            "prefill": {
                "email": data.identifier.strip().lower() if "@" in data.identifier else "",
                "cpf": digits if len(digits) == 11 else "",
            },
        }

    masked_email = ""
    if cust.email and "@" in cust.email:
        u_part, d_part = cust.email.split("@", 1)
        masked_email = f"{u_part[:2]}***@{d_part}"

    return {
        "exists": True,
        "has_password": bool(cust.password_hash),
        "customer_name": cust.name,
        "masked_email": masked_email,
        "customer": _serialize_b2c_customer(cust) if not cust.password_hash else None,
    }


@router.post("/public/auth/login")
def login_b2c_customer(
    data: B2CAuthLoginRequest,
    db: Session = Depends(get_db),
):
    cust = _find_b2c_customer_by_identifier(db, data.company_id, data.identifier)
    if not cust:
        raise HTTPException(status_code=404, detail="Cadastro não encontrado para este E-mail ou CPF.")

    if cust.password_hash:
        if not security.verify_password(data.password, cust.password_hash):
            raise HTTPException(status_code=401, detail="Senha incorreta. Tente novamente ou clique em 'Esqueci minha senha'.")
    else:
        # First password definition for legacy B2C customer without password_hash
        if len(data.password.strip()) < 6:
            raise HTTPException(status_code=400, detail="Crie uma senha com pelo menos 6 caracteres.")
        cust.password_hash = security.get_password_hash(data.password.strip())
        db.commit()

    token = security.create_access_token(
        subject=f"b2c_customer:{cust.id}",
        extra_claims={"role": "B2C_CUSTOMER", "company_id": data.company_id, "customer_id": cust.id},
    )
    return {
        "message": f"Bem-vindo de volta, {cust.name}!",
        "access_token": token,
        "customer": _serialize_b2c_customer(cust),
    }


@router.post("/public/auth/register")
def register_b2c_customer(
    data: B2CAuthRegisterRequest,
    db: Session = Depends(get_db),
):
    cpf_digits = _clean_digits(data.cpf)
    if len(cpf_digits) != 11:
        raise HTTPException(status_code=400, detail="Informe um CPF válido com 11 dígitos.")
    if len(data.password.strip()) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter no mínimo 6 caracteres.")

    email_clean = data.email.strip().lower()
    existing = (
        db.query(Customer)
        .filter(
            Customer.company_id == data.company_id,
            or_(Customer.document == cpf_digits, func.lower(Customer.email) == email_clean),
        )
        .first()
    )

    if existing and existing.password_hash:
        raise HTTPException(
            status_code=400,
            detail="Já existe uma conta cadastrada com este CPF ou E-mail. Faça login com sua senha ou recupere o acesso.",
        )

    if not existing:
        cust = Customer(
            company_id=data.company_id,
            name=data.name.strip(),
            corporate_name=data.name.strip(),
            document=cpf_digits,
            email=email_clean,
            phone=(data.phone or "").strip(),
            customer_type="PF",
            crm_status="ACTIVE",
            city=data.city or "",
            state=(data.state or "")[:2].upper(),
            password_hash=security.get_password_hash(data.password.strip()),
        )
        db.add(cust)
        db.flush()
    else:
        cust = existing
        cust.name = data.name.strip()
        cust.email = email_clean
        cust.phone = (data.phone or "").strip()
        if data.city:
            cust.city = data.city
        if data.state:
            cust.state = data.state[:2].upper()
        cust.password_hash = security.get_password_hash(data.password.strip())
        db.flush()

    if data.zip_code and data.street:
        addr = db.query(Address).filter(Address.customer_id == cust.id).first()
        if not addr:
            addr = Address(
                customer_id=cust.id,
                street=data.street,
                number=data.number or "S/N",
                complement=data.complement,
                neighborhood=data.neighborhood or "",
                city=data.city or "",
                state=(data.state or "SP")[:2].upper(),
                zip_code=_clean_digits(data.zip_code),
                type="MAIN",
            )
            db.add(addr)
        else:
            addr.street = data.street
            addr.number = data.number or "S/N"
            addr.complement = data.complement
            addr.neighborhood = data.neighborhood or ""
            addr.city = data.city or ""
            addr.state = (data.state or "SP")[:2].upper()
            addr.zip_code = _clean_digits(data.zip_code)

    db.commit()
    db.refresh(cust)

    token = security.create_access_token(
        subject=f"b2c_customer:{cust.id}",
        extra_claims={"role": "B2C_CUSTOMER", "company_id": data.company_id, "customer_id": cust.id},
    )
    return {
        "message": "Cadastro realizado com sucesso!",
        "access_token": token,
        "customer": _serialize_b2c_customer(cust),
    }


@router.post("/public/auth/forgot-password")
def forgot_b2c_customer_password(
    data: B2CAuthForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    cust = _find_b2c_customer_by_identifier(db, data.company_id, data.identifier)
    if not cust or not cust.email:
        raise HTTPException(status_code=404, detail="Nenhuma conta encontrada para este E-mail ou CPF.")

    recovery_code = "".join(secrets.choice(string.digits) for _ in range(6))
    key = f"{data.company_id}:{cust.id}"
    _B2C_PASSWORD_RESET_CODES[key] = {
        "code": recovery_code,
        "expires_at": _time.time() + 900,  # 15 minutes
        "email": cust.email,
    }

    company = db.query(Company).filter(Company.id == data.company_id).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == data.company_id).first()
    sent_via_smtp = False

    if settings and settings.smtp_host and settings.smtp_username and settings.smtp_password:
        try:
            from app.core.email import send_smtp_email
            sent_via_smtp = send_smtp_email(
                host=settings.smtp_host,
                port=settings.smtp_port or 587,
                username=settings.smtp_username,
                password=settings.smtp_password,
                from_email=settings.smtp_from_email or settings.smtp_username,
                to_email=cust.email,
                subject=f"Código de Recuperação de Senha - {company.name if company else 'Loja Virtual'}",
                html_content=(
                    f"<div style='font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                    f"<h2 style='color:#0f172a;margin-top:0;'>Recuperação de Senha</h2>"
                    f"<p style='color:#475569;'>Olá, <strong>{cust.name}</strong>! Utilize o código de 6 dígitos abaixo para criar uma nova senha na loja <strong>{company.name if company else ''}</strong>:</p>"
                    f"<div style='background:#f8fafc;border:2px dashed #6366f1;padding:16px;text-align:center;font-size:28px;font-weight:bold;letter-spacing:6px;color:#4f46e5;border-radius:10px;margin:20px 0;'>{recovery_code}</div>"
                    f"<p style='color:#64748b;font-size:12px;'>Este código é válido por 15 minutos.</p>"
                    f"</div>"
                ),
                use_ssl=bool(settings.smtp_use_ssl),
                bcc_email=settings.smtp_bcc_email,
            )
        except Exception as e:
            logger.warning(f"[B2C Forgot Password] Erro ao enviar SMTP: {e}")

    return {
        "status": "OK",
        "sent_via_smtp": sent_via_smtp,
        "email": cust.email,
        "dev_recovery_code": None if sent_via_smtp else recovery_code,
        "message": (
            f"Enviamos um código de 6 dígitos para o seu e-mail ({cust.email})."
            if sent_via_smtp
            else f"Código de recuperação gerado para {cust.email} (Ambiente Local / SMTP não configurado: {recovery_code})."
        ),
    }


@router.post("/public/auth/reset-password")
def reset_b2c_customer_password(
    data: B2CAuthResetPasswordRequest,
    db: Session = Depends(get_db),
):
    cust = _find_b2c_customer_by_identifier(db, data.company_id, data.identifier)
    if not cust:
        raise HTTPException(status_code=404, detail="Conta não encontrada.")
    if len(data.new_password.strip()) < 6:
        raise HTTPException(status_code=400, detail="A nova senha deve ter no mínimo 6 caracteres.")

    key = f"{data.company_id}:{cust.id}"
    entry = _B2C_PASSWORD_RESET_CODES.get(key)
    if not entry or _time.time() > float(entry.get("expires_at", 0)):
        raise HTTPException(status_code=400, detail="Código de recuperação expirado ou inválido. Solicite um novo código.")
    if str(entry.get("code")).strip() != str(data.recovery_code).strip():
        raise HTTPException(status_code=400, detail="Código de verificação incorreto.")

    cust.password_hash = security.get_password_hash(data.new_password.strip())
    db.commit()
    _B2C_PASSWORD_RESET_CODES.pop(key, None)

    token = security.create_access_token(
        subject=f"b2c_customer:{cust.id}",
        extra_claims={"role": "B2C_CUSTOMER", "company_id": data.company_id, "customer_id": cust.id},
    )
    return {
        "message": "Sua senha foi redefinida com sucesso!",
        "access_token": token,
        "customer": _serialize_b2c_customer(cust),
    }


@router.get("/public/my-orders")
def list_public_b2c_customer_orders(
    company_id: int = Query(...),
    customer_cpf: str = Query(...),
    db: Session = Depends(get_db),
):
    cpf_digits = _clean_digits(customer_cpf)
    if len(cpf_digits) < 11:
        raise HTTPException(status_code=400, detail="CPF inválido.")

    cust = (
        db.query(Customer)
        .filter(Customer.company_id == company_id, Customer.document == cpf_digits)
        .first()
    )
    if not cust:
        return []

    addr = db.query(Address).filter(Address.customer_id == cust.id).first()

    orders = (
        db.query(Order)
        .filter(Order.company_id == company_id, Order.customer_id == cust.id, Order.origin == "b2c_storefront")
        .order_by(Order.created_at.desc())
        .limit(50)
        .all()
    )

    order_ids = [o.id for o in orders]
    redemptions_by_order: Dict[int, B2CCouponRedemption] = {}
    if order_ids:
        reds = (
            db.query(B2CCouponRedemption)
            .filter(B2CCouponRedemption.company_id == company_id, B2CCouponRedemption.order_id.in_(order_ids))
            .all()
        )
        for r in reds:
            if r.order_id:
                redemptions_by_order[r.order_id] = r

    results = []
    for o in orders:
        norm_st = _normalize_b2c_order_status(o.status)
        meta = _parse_order_meta(o)
        red = redemptions_by_order.get(o.id)
        coupon_code = (
            (red.coupon_code if red else None)
            or meta.get("coupon_code")
            or (o.customer_order_ref if o.customer_order_ref and o.customer_order_ref != "B2C_DIRECT" else None)
        )
        ship_addr = meta.get("shipping_address") or (
            {
                "street": addr.street,
                "number": addr.number,
                "complement": addr.complement,
                "neighborhood": addr.neighborhood,
                "city": addr.city,
                "state": addr.state,
                "zip_code": addr.zip_code,
            }
            if addr
            else None
        )
        results.append(
            {
                "id": o.id,
                "status": norm_st,
                "status_label": B2C_STATUS_LABELS.get(norm_st, norm_st),
                "subtotal": float(o.subtotal or 0),
                "freight": float(meta.get("freight_value") or 0.0),
                "freight_service_name": meta.get("freight_service_name") or "Entrega Padrão",
                "discount_applied": float(o.discount or 0),
                "total": float(o.total or 0),
                "coupon_code": coupon_code,
                "residual_coupon_code": (red.residual_coupon_code if red else None) or meta.get("residual_coupon_code"),
                "remaining_coupon_balance": float(
                    (red.remaining_balance if red else None) or meta.get("remaining_coupon_balance") or 0.0
                ),
                "payment_method": meta.get("payment_method") or ("COUPON_100%" if float(o.total or 0) <= 0.009 else "PIX"),
                "payment_gateway": meta.get("payment_gateway") or "EFI",
                "pix_code": meta.get("pix_code") or "",
                "external_id": o.external_id or "",
                "invoice_number": o.invoice_number or "",
                "invoice_key": o.invoice_key or "",
                "tracking_code": o.tracking_code or "",
                "carrier_name": meta.get("carrier_name") or "",
                "tracking_url": meta.get("tracking_url") or "",
                "shipping_address": ship_addr,
                "customer_name": cust.name,
                "customer_cpf": cust.document,
                "customer_email": cust.email,
                "customer_phone": cust.phone or "",
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "items": [
                    {
                        "id": it.id,
                        "product_id": it.product_id,
                        "sku": it.sku,
                        "ean_isbn": it.ean_isbn or it.sku,
                        "name": it.name,
                        "quantity": it.quantity,
                        "unit_price": float(it.unit_price or 0),
                        "total_price": float(it.total_price or 0),
                    }
                    for it in (o.items or [])
                ],
            }
        )
    return results


@router.get("/public/my-coupons")
def list_public_b2c_customer_coupons(
    company_id: int = Query(...),
    customer_cpf: Optional[str] = Query(None),
    customer_email: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    cpf_digits = _clean_digits(customer_cpf)
    email_clean = (customer_email or "").strip().lower()
    if not cpf_digits and not email_clean:
        return {"coupons": [], "redemptions": []}

    filters = []
    if len(cpf_digits) == 11:
        filters.append(B2CCoupon.assigned_cpf == cpf_digits)
    if email_clean:
        filters.append(func.lower(B2CCoupon.assigned_email) == email_clean)

    coupons = []
    if filters:
        rows = (
            db.query(B2CCoupon)
            .filter(B2CCoupon.company_id == company_id, or_(*filters))
            .order_by(B2CCoupon.created_at.desc())
            .limit(50)
            .all()
        )
        for c in rows:
            coupons.append(
                {
                    "id": c.id,
                    "code": c.code,
                    "discount_type": getattr(c, "discount_type", "FIXED_BRL") or "FIXED_BRL",
                    "initial_value": float(c.initial_value or 0),
                    "current_balance": float(c.current_balance or 0),
                    "allows_freight_discount": bool(c.allows_freight_discount),
                    "allow_residual_balance": bool(getattr(c, "allow_residual_balance", True)),
                    "status": c.status,
                    "valid_until": c.valid_until.isoformat() if c.valid_until else None,
                    "generated_child_code": c.generated_child_code,
                }
            )

    red_filters = []
    if len(cpf_digits) == 11:
        red_filters.append(B2CCouponRedemption.customer_cpf == cpf_digits)
    if email_clean:
        red_filters.append(func.lower(B2CCouponRedemption.customer_email) == email_clean)

    redemptions = []
    if red_filters:
        red_rows = (
            db.query(B2CCouponRedemption)
            .filter(B2CCouponRedemption.company_id == company_id, or_(*red_filters))
            .order_by(B2CCouponRedemption.created_at.desc())
            .limit(50)
            .all()
        )
        for r in red_rows:
            redemptions.append(
                {
                    "id": r.id,
                    "order_id": r.order_id,
                    "coupon_code": r.coupon_code,
                    "discount_applied": float(r.discount_applied or 0),
                    "remaining_balance": float(r.remaining_balance or 0),
                    "residual_coupon_code": r.residual_coupon_code,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
            )

    return {"coupons": coupons, "redemptions": redemptions}


class B2CProfileUpdateRequest(BaseModel):
    company_id: int
    cpf: str
    name: str
    email: str
    phone: Optional[str] = None
    zip_code: Optional[str] = None
    street: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    new_password: Optional[str] = None


@router.put("/public/auth/profile")
def update_public_b2c_customer_profile(
    data: B2CProfileUpdateRequest,
    db: Session = Depends(get_db),
):
    cpf_digits = _clean_digits(data.cpf)
    cust = (
        db.query(Customer)
        .filter(Customer.company_id == data.company_id, Customer.document == cpf_digits)
        .first()
    )
    if not cust:
        raise HTTPException(status_code=404, detail="Conta de cliente não encontrada.")

    cust.name = data.name.strip().upper()
    cust.email = data.email.strip().lower()
    cust.phone = (data.phone or "").strip()
    if data.city:
        cust.city = data.city.strip().upper()
    if data.state:
        cust.state = data.state.strip()[:2].upper()

    if data.new_password and len(data.new_password.strip()) >= 6:
        cust.password_hash = security.get_password_hash(data.new_password.strip())

    if data.zip_code and data.street:
        addr = db.query(Address).filter(Address.customer_id == cust.id).first()
        if not addr:
            addr = Address(
                customer_id=cust.id,
                street=data.street.strip().upper(),
                number=(data.number or "S/N").strip().upper(),
                complement=(data.complement or "").strip().upper() if data.complement else None,
                neighborhood=(data.neighborhood or "").strip().upper(),
                city=(data.city or "").strip().upper(),
                state=(data.state or "SP")[:2].upper(),
                zip_code=_clean_digits(data.zip_code),
                type="MAIN",
            )
            db.add(addr)
        else:
            addr.street = data.street.strip().upper()
            addr.number = (data.number or "S/N").strip().upper()
            addr.complement = (data.complement or "").strip().upper() if data.complement else None
            addr.neighborhood = (data.neighborhood or "").strip().upper()
            addr.city = (data.city or "").strip().upper()
            addr.state = (data.state or "SP")[:2].upper()
            addr.zip_code = _clean_digits(data.zip_code)

    db.commit()
    db.refresh(cust)
    return {
        "message": "Dados atualizados com sucesso!",
        "customer": _serialize_b2c_customer(cust),
    }


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
                has_cpf_restriction = bool(c.batch and c.batch.eligible_cpfs_json)
                if cpf_digits and _clean_digits(c.assigned_cpf) == cpf_digits:
                    if has_cpf_restriction or c.status in ("AVAILABLE", "PARTIALLY_USED"):
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

            # Check max uses on batch (excluding child residual coupons)
            issued_count = (
                db.query(func.count(B2CCoupon.id))
                .filter(B2CCoupon.batch_id == batch.id, B2CCoupon.coupon_mode != "RESIDUAL")
                .scalar()
                or 0
            )
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

    # 1. Find or create B2C Customer (supports Express CPF-only when using Vindi Payment Link)
    customer = (
        db.query(Customer)
        .filter(Customer.company_id == company.id, Customer.document == cpf_digits)
        .first()
    )
    req_name = (data.customer_name or "").strip()
    req_email = (data.customer_email or "").strip().lower()
    req_phone = (data.customer_phone or "").strip() or None
    req_city = (data.city or "").strip()
    req_state = (data.state or "").strip()[:2].upper()
    req_street = (data.street or "").strip()
    req_number = (data.number or "").strip()
    req_neighborhood = (data.neighborhood or "").strip()
    req_zip = _clean_digits(data.zip_code or "")

    # Try to enrich from assigned coupon if customer name/email weren't typed in Express CPF mode
    if (not req_name or not req_email) and data.coupon_code and data.coupon_code.strip():
        pre_coup = (
            db.query(B2CCoupon)
            .filter(
                B2CCoupon.company_id == company.id,
                B2CCoupon.code == data.coupon_code.strip().upper(),
            )
            .first()
        )
        if pre_coup:
            if not req_name and pre_coup.assigned_name:
                req_name = pre_coup.assigned_name.strip()
            if not req_email and pre_coup.assigned_email:
                req_email = pre_coup.assigned_email.strip().lower()

    if not customer:
        final_name = req_name or f"CLIENTE CPF {cpf_digits}"
        final_email = req_email or f"cpf.{cpf_digits}@checkout.vindi.com.br"
        customer = Customer(
            company_id=company.id,
            name=final_name,
            corporate_name=final_name,
            document=cpf_digits,
            email=final_email,
            phone=req_phone,
            customer_type="PF",
            crm_status="ACTIVE",
            city=req_city or None,
            state=req_state or None,
            password_hash=(
                security.get_password_hash(data.customer_password.strip())
                if data.customer_password and data.customer_password.strip()
                else None
            ),
        )
        db.add(customer)
        db.flush()
    else:
        if req_name:
            customer.name = req_name
        if req_email:
            customer.email = req_email
        if req_phone:
            customer.phone = req_phone
        if req_city:
            customer.city = req_city
        if req_state:
            customer.state = req_state
        if not customer.password_hash and data.customer_password and data.customer_password.strip():
            customer.password_hash = security.get_password_hash(data.customer_password.strip())

    # Ensure shipping address (preserves existing address when Express CPF mode omits street)
    addr = db.query(Address).filter(Address.customer_id == customer.id).first()
    if not addr:
        addr = Address(
            customer_id=customer.id,
            street=req_street or "PREENCHIDO NO CHECKOUT VINDI",
            number=req_number or "S/N",
            complement=data.complement,
            neighborhood=req_neighborhood or "CENTRO",
            city=req_city or (customer.city or "SAO PAULO"),
            state=req_state or (customer.state or "SP")[:2].upper(),
            zip_code=req_zip or "01001000",
            type="MAIN",
        )
        db.add(addr)
    elif req_street:
        addr.street = req_street
        addr.number = req_number or addr.number
        addr.complement = data.complement
        addr.neighborhood = req_neighborhood or addr.neighborhood
        addr.city = req_city or addr.city
        addr.state = req_state or addr.state
        if req_zip:
            addr.zip_code = req_zip

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

    # 4. Create Order in Cronuz B2B/B2C with Official B2C Status Ruler & Per-Method Routing
    from app.payments.registry import default_channel_modes, routes_map
    all_routes = routes_map(db, company.id)
    b2c_routes = all_routes.get("B2C_STOREFRONT") or {}
    b2c_ch_mode = (default_channel_modes(settings, all_routes).get("B2C_STOREFRONT") or {})

    configured_mode = getattr(settings, "b2c_checkout_mode", "NATIVE_GATEWAY") if settings else "NATIVE_GATEWAY"
    tray_enabled = bool(getattr(settings, "tray_enabled", False)) if settings else False
    fallback_gateway = (getattr(settings, "payment_gateway_active", "EFI") or "EFI").upper() if settings else "EFI"
    req_payment_method = (data.payment_method or "PIX").strip().upper()

    if b2c_ch_mode.get("mode") == "PAYMENT_LINK" or req_payment_method == "PAYMENT_LINK":
        req_payment_method = "PAYMENT_LINK"
        active_gateway = str(b2c_ch_mode.get("link_provider") or b2c_routes.get("LINK") or "VINDI").upper()
    elif req_payment_method == "CREDIT_CARD":
        active_gateway = str(b2c_routes.get("CARD") or fallback_gateway).upper()
    elif req_payment_method == "BOLETO":
        active_gateway = str(b2c_routes.get("BOLETO") or fallback_gateway).upper()
    else:
        active_gateway = str(b2c_routes.get("PIX") or fallback_gateway).upper()

    effective_mode = "FREE_VOUCHER" if fully_covered else (
        "TRAY_REDIRECT" if (configured_mode == "TRAY_REDIRECT" and tray_enabled) else "NATIVE_GATEWAY"
    )

    initial_order_status = "PAID" if fully_covered else "WAITING_PAYMENT"

    order_meta = {
        "freight_value": freight,
        "freight_service_name": data.freight_service_name or "Entrega Padrão",
        "payment_gateway": "VOUCHER" if fully_covered else active_gateway,
        "payment_method": "VOUCHER_100" if fully_covered else req_payment_method,
        "coupon_code": coupon.code if coupon else None,
        "residual_coupon_code": residual_coupon_code,
        "remaining_coupon_balance": remaining_balance,
        "shipping_address": {
            "street": data.street,
            "number": data.number,
            "complement": data.complement,
            "neighborhood": data.neighborhood,
            "city": data.city,
            "state": data.state[:2].upper() if data.state else "",
            "zip_code": _clean_digits(data.zip_code),
        },
    }

    order = Order(
        company_id=company.id,
        customer_id=customer.id,
        status=initial_order_status,
        type_order="V",
        origin="b2c_storefront",
        customer_order_ref=coupon.code if coupon else "B2C_DIRECT",
        subtotal=subtotal,
        discount=discount_applied,
        total=difference_to_pay,
        payment_condition=effective_mode,
        confirmed_at=datetime.utcnow() if fully_covered else None,
    )
    _save_order_meta(order, order_meta)
    db.add(order)
    db.flush()

    for item in data.items:
        req_qty = max(1, int(item.quantity or 1))
        local_prod = None
        if item.product_id and item.product_id > 0:
            local_prod = (
                db.query(Product)
                .filter(Product.company_id == company.id, Product.id == item.product_id)
                .first()
            )
        if not local_prod and item.sku:
            local_prod = (
                db.query(Product)
                .filter(Product.company_id == company.id, Product.sku == str(item.sku).strip())
                .first()
            )
        if local_prod is not None:
            avail_stock = max(0, int(local_prod.stock_quantity or 0))
            if avail_stock < req_qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"O produto '{item.name}' não possui estoque suficiente (Saldo disponível: {avail_stock}).",
                )
            local_prod.stock_quantity = max(0, avail_stock - req_qty)

        line_total = round(float(item.unit_price) * req_qty, 2)
        oi = OrderItem(
            order_id=order.id,
            product_id=local_prod.id if local_prod else (item.product_id if (item.product_id and item.product_id > 0) else None),
            ean_isbn=str(item.ean_gtin or item.sku or "")[:95],
            sku=str(item.sku or "")[:95],
            name=str(item.name or "Item")[:250],
            brand=str(item.brand or "")[:250] if item.brand else None,
            quantity=req_qty,
            quantity_requested=req_qty,
            quantity_fulfilled=req_qty if fully_covered else 0,
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
    pix_code: Optional[str] = None
    pix_qr_code_url: Optional[str] = None
    vindi_payment_url: Optional[str] = None

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
                "id": "10",
                "name": "Frete Grátis",
                "price": "0.00",
                "value": "0.00",
                "city": data.city or "São Paulo",
                "state": (data.state or "SP")[:2].upper(),
                "zip_code": _clean_digits(data.zip_code),
                "min_period": 1,
                "max_period": 5,
            }

            tray_items_payload = []
            for i in data.items:
                item_dict = i.model_dump()
                lp = None
                if i.product_id and i.product_id > 0:
                    lp = db.query(Product).filter(Product.company_id == company.id, Product.id == i.product_id).first()
                if not lp and i.sku:
                    lp = db.query(Product).filter(Product.company_id == company.id, Product.sku == str(i.sku).strip()).first()
                if not lp and i.ean_gtin:
                    lp = db.query(Product).filter(Product.company_id == company.id, Product.ean_gtin == str(i.ean_gtin).strip()).first()
                if lp:
                    if lp.publisher_code and str(lp.publisher_code).strip().isdigit():
                        item_dict["tray_product_id"] = str(lp.publisher_code).strip()
                    if lp.horus_cod_item:
                        item_dict["horus_cod_item"] = lp.horus_cod_item
                    if lp.sku and not item_dict.get("sku"):
                        item_dict["sku"] = lp.sku
                    if lp.ean_gtin and not item_dict.get("ean_gtin"):
                        item_dict["ean_gtin"] = lp.ean_gtin
                tray_items_payload.append(item_dict)

            cart_res = await tray_client.create_cart_in_tray(
                items=tray_items_payload,
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

    elif effective_mode == "NATIVE_GATEWAY" and difference_to_pay > 0:
        if active_gateway == "VINDI":
            from app.integrators.vindi_checkout import VindiCheckoutClient, VindiCheckoutError, read_vindi_config
            vindi = VindiCheckoutClient(db, company.id)
            vindi_cfg = read_vindi_config(settings)
            vindi_addr = {
                "zip_code": _clean_digits(data.zip_code),
                "street": data.street,
                "number": data.number,
                "complement": data.complement,
                "neighborhood": data.neighborhood,
                "city": data.city,
                "state": (data.state or "")[:2].upper(),
            }
            vindi_customer = {
                "name": customer.name,
                "email": customer.email,
                "cpf": cpf_digits,
                "phone": customer.phone,
            }
            fwd_ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
            client_ip = fwd_ip or (request.client.host if request.client else None)
            base_url = str(request.base_url).rstrip("/")
            try:
                if vindi_cfg.get("integration_mode") == "PAYMENT_LINK" or req_payment_method == "PAYMENT_LINK":
                    v_res = await vindi.create_payment_link(
                        order_id=order.id,
                        amount=difference_to_pay,
                        customer=vindi_customer,
                        address=vindi_addr,
                        api_base_url=base_url,
                    )
                    vindi_payment_url = v_res.get("payment_url")
                elif req_payment_method == "CREDIT_CARD":
                    if not (data.card_number and data.card_expiration and data.card_cvv):
                        raise VindiCheckoutError("Preencha número, validade e CVV do cartão.")
                    v_res = await vindi.create_credit_card_bill(
                        order_id=order.id,
                        amount=difference_to_pay,
                        customer=vindi_customer,
                        address=vindi_addr,
                        customer_ip=client_ip,
                        finger_print=data.finger_print,
                        api_base_url=base_url,
                        card_data={
                            "holder_name": data.card_holder_name or customer.name,
                            "card_number": data.card_number,
                            "card_expiration": data.card_expiration,
                            "card_cvv": data.card_cvv,
                            "installments": data.card_installments or 1,
                        },
                    )
                else:
                    v_res = await vindi.create_pix_bill(
                        order_id=order.id,
                        amount=difference_to_pay,
                        customer=vindi_customer,
                        address=vindi_addr,
                        customer_ip=client_ip,
                        finger_print=data.finger_print,
                        api_base_url=base_url,
                    )
            except VindiCheckoutError as ve:
                # Nada é gravado (pedido, baixa de estoque e uso de cupom são desfeitos)
                db.rollback()
                logger.warning(f"[B2C Checkout Vindi] Empresa {company.id}: {ve.message}")
                hint = (ve.diagnostics or {}).get("diagnostic_hint")
                full_msg = f"{ve.message} ({hint})" if hint else ve.message
                raise HTTPException(status_code=402, detail=full_msg)

            order.external_id = str(v_res.get("gateway_tx_id"))
            if v_res.get("status") == "PAID":
                order.status = "PAID"
                order.confirmed_at = datetime.utcnow()
            pix_code = v_res.get("pix_code")
            pix_qr_code_url = v_res.get("pix_qr_code_url")
            if v_res.get("token_transaction"):
                order_meta["vindi_token_transaction"] = v_res.get("token_transaction")
            if v_res.get("payment_url") and not pix_code:
                vindi_payment_url = v_res.get("payment_url")
            elif v_res.get("payment_url") and not vindi_payment_url:
                order_meta["vindi_pix_url"] = v_res.get("payment_url")
            if vindi_payment_url:
                order_meta["vindi_payment_url"] = vindi_payment_url
            order_meta["payment_history"] = [
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "source": "CHECKOUT_LOJA",
                    "status_name": "Pago / Aprovado" if order.status == "PAID" else "Aguardando Pagamento na Vindi",
                    "payment_method": "LINK_VINDI" if vindi_payment_url else req_payment_method,
                    "token_transaction": v_res.get("token_transaction") or order.external_id,
                    "message": (
                        f"Link Vindi gerado ({vindi_payment_url})"
                        if vindi_payment_url
                        else f"Cobrança {req_payment_method} criada na Vindi ({order.external_id})"
                    ),
                }
            ]
            _save_order_meta(order, order_meta)
        else:
            # Default Homologated Gateway: EFI (Gerencianet)
            if req_payment_method == "CREDIT_CARD" and data.card_number:
                order.external_id = f"EFI-CC-{order.id}"
                order.status = "PAID"
                order.confirmed_at = datetime.utcnow()
            else:
                order.external_id = f"EFI-PIX-{order.id}"
                pix_code = (
                    f"00020126580014BR.GOV.BCB.PIX0136cronuz-b2c-order-{order.id}"
                    f"520400005303986540{difference_to_pay:.2f}5802BR5913{company.name[:13]}6009SAOPAULO62070503***6304ABCD"
                )

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
            status="COMPLETED" if (fully_covered or order.status == "PAID") else (
                "REDIRECTED_TO_TRAY" if effective_mode == "TRAY_REDIRECT" else "PENDING_PAYMENT"
            ),
        )
        db.add(redemption)

    db.commit()
    db.refresh(order)
    _b2c_cache_clear(company.id)

    norm_st = _normalize_b2c_order_status(order.status)
    return {
        "order_id": order.id,
        "status": norm_st,
        "status_label": B2C_STATUS_LABELS.get(norm_st, norm_st),
        "payment_gateway": "VOUCHER" if fully_covered else active_gateway,
        "payment_method": "VOUCHER_100" if fully_covered else req_payment_method,
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
        "vindi_payment_url": vindi_payment_url,
        "pix_code": pix_code,
        "pix_qr_code_url": pix_qr_code_url,
        "customer": _serialize_b2c_customer(customer),
        "message": (
            "Pedido 100% coberto pelo seu cupom e aprovado com sucesso!"
            if fully_covered
            else (
                "Pagamento aprovado no cartão! Seu pedido já está com status Pago."
                if norm_st == "PAID"
                else (
                    "Carrinho preparado! Redirecionando para pagamento da diferença..."
                    if effective_mode == "TRAY_REDIRECT"
                    else (
                        f"Pedido #{order.id} registrado! Redirecionando para o ambiente seguro de pagamento da Vindi..."
                        if vindi_payment_url
                        else (
                            f"Pedido #{order.id} registrado! Pagamento no cartão em análise pela operadora."
                            if req_payment_method == "CREDIT_CARD"
                            else f"Pedido #{order.id} registrado ({active_gateway})! Realize o pagamento do PIX para aprovar."
                        )
                    )
                )
            )
        ),
    }


def _build_yapay_hosted_form_html(
    action_url: str,
    token_account: str,
    order_number: str,
    amount: float,
    customer_name: str,
    customer_cpf: str,
    customer_email: str,
    customer_phone: str,
    zip_code: str,
    street: str,
    number: str,
    neighborhood: str,
    city: str,
    state: str,
    notification_url: str,
    return_url: str = "",
    max_installments: int = 6,
    allow_pix: bool = True,
    allow_credit_card: bool = True,
    allow_boleto: bool = False,
) -> str:
    import html as _html

    methods = []
    if allow_credit_card:
        methods.extend(["2", "3", "4", "5", "16", "20"])
    if allow_boleto:
        methods.append("6")
    if allow_pix:
        methods.append("27")
    if not methods:
        methods = ["27", "3", "4", "16"]

    fields = {
        "token_account": token_account,
        "order_number": order_number,
        "url_notification": notification_url,
        "available_payment_methods": ",".join(methods),
        "max_split_transaction": str(max(1, min(12, int(max_installments or 6)))),
        "shipping_type": "ENTREGA",
        "shipping_price": "0.00",
        "customer[name]": (customer_name or "CLIENTE B2C").upper(),
        "customer[cpf]": "".join(filter(str.isdigit, customer_cpf or "")),
        "customer[email]": (customer_email or "").strip().lower(),
        "customer[contacts][1][type_contact]": "M",
        "customer[contacts][1][number_contact]": "".join(filter(str.isdigit, customer_phone or "")) or "11999999999",
        "customer[addresses][1][type_address]": "B",
        "customer[addresses][1][postal_code]": "".join(filter(str.isdigit, zip_code or "")) or "01001000",
        "customer[addresses][1][street]": (street or "PRACA DA SE").upper(),
        "customer[addresses][1][number]": (number or "100").upper(),
        "customer[addresses][1][neighborhood]": (neighborhood or "CENTRO").upper(),
        "customer[addresses][1][city]": (city or "SAO PAULO").upper(),
        "customer[addresses][1][state]": (state or "SP")[:2].upper(),
        "transaction_product[1][description]": f"PEDIDO LOJA B2C #{order_number}",
        "transaction_product[1][quantity]": "1",
        "transaction_product[1][price_unit]": f"{float(amount):.2f}",
        "transaction_product[1][code]": order_number,
    }
    if return_url:
        fields["url_success"] = return_url
        fields["url_cancel"] = return_url

    inputs = "\n".join(
        f'<input type="hidden" name="{_html.escape(k)}" value="{_html.escape(str(v))}" />'
        for k, v in fields.items()
    )
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Redirecionando para Pagamento Seguro Vindi...</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
    .card {{ background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; max-width: 420px; text-align: center; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }}
    .spinner {{ width: 36px; height: 36px; border: 3px solid #e2e8f0; border-top-color: #4f46e5; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }}
    @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
    button {{ margin-top: 16px; background: #4f46e5; color: #fff; border: 0; border-radius: 10px; padding: 10px 20px; font-weight: 700; cursor: pointer; }}
  </style>
</head>
<body onload="document.getElementById('vindiForm').submit();">
  <div class="card">
    <div class="spinner"></div>
    <h3 style="margin:0 0 8px;font-size:16px;">Conectando ao Ambiente Seguro Vindi</h3>
    <p style="margin:0;font-size:13px;color:#64748b;">Aguarde um instante enquanto abrimos sua página de pagamento (R$ {float(amount):.2f})...</p>
    <form id="vindiForm" method="POST" action="{_html.escape(action_url)}">
      {inputs}
      <noscript><button type="submit">Continuar para Pagamento Vindi</button></noscript>
    </form>
  </div>
</body>
</html>"""


@router.get("/public/vindi-checkout-test")
def public_vindi_hosted_checkout_test(
    request: Request,
    company_id: int = Query(...),
    amount: float = Query(1.00),
    sandbox: int = Query(1),
    db: Session = Depends(get_db),
):
    from fastapi.responses import HTMLResponse
    from app.integrators.vindi_checkout import VindiCheckoutClient, read_vindi_config

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    vindi_cfg = read_vindi_config(settings)
    vindi = VindiCheckoutClient(db, company_id, sandbox=bool(sandbox))
    if not vindi.is_configured:
        raise HTTPException(status_code=400, detail="Token / Chave Vindi não configurada para esta empresa.")

    base_url = str(request.base_url).rstrip("/")
    order_num = f"TESTE-{company_id}-{datetime.utcnow().strftime('%H%M%S')}"
    html_doc = _build_yapay_hosted_form_html(
        action_url=vindi.yapay_hosted_checkout_url,
        token_account=vindi.api_key,
        order_number=order_num,
        amount=round(max(0.01, float(amount or 1.00)), 2),
        customer_name="CLIENTE TESTE HOMOLOGACAO",
        customer_cpf="11144477735",
        customer_email="homologacao@cronuzb2b.com.br",
        customer_phone="11999999999",
        zip_code="01001000",
        street="PRACA DA SE",
        number="100",
        neighborhood="SE",
        city="SAO PAULO",
        state="SP",
        notification_url=f"{base_url}/b2c/webhooks/vindi",
        return_url=vindi_cfg.get("return_url") or "",
        max_installments=vindi_cfg.get("max_installments", 6),
        allow_pix=vindi_cfg.get("allow_pix", True),
        allow_credit_card=vindi_cfg.get("allow_credit_card", True),
        allow_boleto=vindi_cfg.get("allow_boleto", False),
    )
    return HTMLResponse(content=html_doc)


@router.get("/public/vindi-checkout/{order_id}")
def public_vindi_hosted_checkout_redirect(
    order_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    from fastapi.responses import HTMLResponse
    from app.integrators.vindi_checkout import VindiCheckoutClient, read_vindi_config

    order = db.query(Order).filter(Order.id == order_id, Order.origin == "b2c_storefront").first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido B2C não encontrado.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == order.company_id).first()
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    vindi_cfg = read_vindi_config(settings)
    vindi = VindiCheckoutClient(db, order.company_id)
    if not vindi.is_configured:
        raise HTTPException(status_code=400, detail="Token / Chave Vindi não configurada para esta loja.")

    meta = _parse_order_meta(order)
    addr = meta.get("shipping_address") if isinstance(meta.get("shipping_address"), dict) else {}
    base_url = str(request.base_url).rstrip("/")

    html_doc = _build_yapay_hosted_form_html(
        action_url=vindi.yapay_hosted_checkout_url,
        token_account=vindi.api_key,
        order_number=f"CRZ-{order.id}",
        amount=round(float(order.total or 0), 2),
        customer_name=customer.name if customer else "CLIENTE B2C",
        customer_cpf=customer.document if customer else "",
        customer_email=customer.email if customer else "",
        customer_phone=customer.phone if customer else "",
        zip_code=addr.get("zip_code") or "01001000",
        street=addr.get("street") or "RUA",
        number=addr.get("number") or "S/N",
        neighborhood=addr.get("neighborhood") or "CENTRO",
        city=addr.get("city") or "SAO PAULO",
        state=addr.get("state") or "SP",
        notification_url=f"{base_url}/b2c/webhooks/vindi",
        return_url=vindi_cfg.get("return_url") or "",
        max_installments=vindi_cfg.get("max_installments", 6),
        allow_pix=vindi_cfg.get("allow_pix", True),
        allow_credit_card=vindi_cfg.get("allow_credit_card", True),
        allow_boleto=vindi_cfg.get("allow_boleto", False),
    )
    return HTMLResponse(content=html_doc)


def _sync_order_with_vindi_tx(
    db: Session,
    order: Order,
    tx_info: Dict[str, Any],
    source: str = "API_VINDI",
) -> Dict[str, Any]:
    """
    Atualiza o Pedido B2C, o Cliente (caso tenha entrado via Checkout Express apenas com CPF)
    e o Histórico de Pagamento (`payment_history`) a partir dos dados oficiais da transação Vindi
    retornados por `GET /api/v3/transactions/get_by_token`.
    """
    meta = _parse_order_meta(order)
    status_id = int(tx_info.get("status_id") or 0)
    status_name = str(tx_info.get("status_name") or "").strip() or "Aguardando Pagamento"
    resolved_pm = str(tx_info.get("resolved_payment_method") or "").strip()
    tx_id = tx_info.get("transaction_id")
    token_tx = tx_info.get("token_transaction") or meta.get("vindi_token_transaction")

    if token_tx:
        meta["vindi_token_transaction"] = str(token_tx)
    if tx_id:
        meta["vindi_transaction_id"] = str(tx_id)
    if status_name:
        meta["vindi_status_name"] = status_name
    if resolved_pm and resolved_pm != "PAYMENT_LINK":
        meta["payment_method"] = resolved_pm

    # Enriquecer dados do cliente e endereço preenchidos na página da Vindi (Checkout Express por CPF)
    v_cust = tx_info.get("customer") if isinstance(tx_info.get("customer"), dict) else {}
    if v_cust and order.customer_id:
        cust_obj = db.query(Customer).filter(Customer.id == order.customer_id).first()
        if cust_obj:
            v_name = str(v_cust.get("name") or "").strip()
            v_email = str(v_cust.get("email") or "").strip().lower()
            if v_name and (not cust_obj.name or cust_obj.name.startswith("CLIENTE CPF")):
                cust_obj.name = v_name.upper()
                cust_obj.corporate_name = v_name.upper()
            if v_email and (not cust_obj.email or "@checkout.vindi" in cust_obj.email):
                cust_obj.email = v_email
            v_contacts = v_cust.get("contacts") if isinstance(v_cust.get("contacts"), list) else []
            if v_contacts and isinstance(v_contacts[0], dict):
                v_phone = str(v_contacts[0].get("number_contact") or "").strip()
                if v_phone and not cust_obj.phone:
                    cust_obj.phone = v_phone
            v_addrs = v_cust.get("addresses") if isinstance(v_cust.get("addresses"), list) else []
            if v_addrs and isinstance(v_addrs[0], dict):
                va = v_addrs[0]
                v_street = str(va.get("street") or "").strip()
                if v_street:
                    meta["shipping_address"] = {
                        "street": v_street,
                        "number": str(va.get("number") or "S/N"),
                        "complement": str(va.get("completion") or ""),
                        "neighborhood": str(va.get("neighborhood") or ""),
                        "city": str(va.get("city") or ""),
                        "state": str(va.get("state") or "")[:2].upper(),
                        "zip_code": _clean_digits(str(va.get("postal_code") or "")),
                    }

    history: List[Dict[str, Any]] = meta.get("payment_history") if isinstance(meta.get("payment_history"), list) else []
    last_entry = history[-1] if history else {}
    sig = f"{status_id}:{resolved_pm}:{tx_info.get('paid')}"
    if last_entry.get("sig") != sig:
        history.append(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "source": source,
                "status_id": status_id,
                "status_name": status_name,
                "payment_method": resolved_pm or meta.get("payment_method") or "LINK_VINDI",
                "transaction_id": tx_id,
                "token_transaction": token_tx,
                "sig": sig,
                "message": (
                    f"Pagamento APROVADO na Vindi ({resolved_pm or 'PIX/Cartão'}) • Transação #{tx_id or token_tx}"
                    if tx_info.get("paid")
                    else f"Status na Vindi: {status_name} ({resolved_pm or 'Aguardando escolha no Link'})"
                ),
            }
        )
        meta["payment_history"] = history[-30:]

    if tx_info.get("paid") and _normalize_b2c_order_status(order.status) != "PAID":
        order.status = "PAID"
        order.confirmed_at = datetime.utcnow()
        red = (
            db.query(B2CCouponRedemption)
            .filter(B2CCouponRedemption.order_id == order.id)
            .first()
        )
        if red and red.status == "PENDING_PAYMENT":
            red.status = "COMPLETED"

    _save_order_meta(order, meta)
    db.commit()
    _b2c_cache_clear(order.company_id)
    return {
        "order_id": order.id,
        "status": _normalize_b2c_order_status(order.status),
        "paid": bool(tx_info.get("paid")),
        "gateway_status": status_name,
        "payment_method": meta.get("payment_method"),
        "payment_history": meta.get("payment_history") or [],
    }


@router.post("/webhooks/vindi")
async def vindi_b2c_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Recebe notificações automáticas de pagamento da Vindi (tanto Vindi Commerce/Yapay quanto Vindi API v1)
    conforme https://developers.vindi.com.br/docs/webhooks e atualiza o pedido B2C para PAID quando confirmado,
    gravando o histórico completo da aprovação (PIX ou Cartão).
    """
    from app.integrators.vindi_checkout import VindiCheckoutClient

    try:
        content_type = (request.headers.get("content-type") or "").lower()
        if "application/json" in content_type:
            payload = await request.json()
        else:
            form = await request.form()
            payload = dict(form)
    except Exception:
        payload = {}

    # 1. Formato Vindi API v1: {"event": {"type": "bill_paid", "data": {"bill": {"code": "B2C-ORD-123-..."}}}}
    event = payload.get("event") if isinstance(payload.get("event"), dict) else {}
    ev_type = str(event.get("type") or "").lower()
    bill = ((event.get("data") or {}).get("bill") or {}) if isinstance(event.get("data"), dict) else {}
    bill_code = str(bill.get("code") or "")

    # 2. Formato Vindi Commerce / Yapay (suporta JSON aninhado e POST form `transaction[order_number]` / `token_transaction`)
    tx_dict = payload.get("transaction") if isinstance(payload.get("transaction"), dict) else {}
    order_number = str(
        payload.get("transaction[order_number]")
        or payload.get("order_number")
        or tx_dict.get("order_number")
        or ""
    )
    status_id = str(
        payload.get("transaction[status_id]")
        or payload.get("status_id")
        or tx_dict.get("status_id")
        or ""
    )
    token_transaction = str(
        payload.get("token_transaction")
        or payload.get("transaction[transaction_token]")
        or tx_dict.get("token_transaction")
        or tx_dict.get("transaction_token")
        or ""
    ).strip()

    target_order_id: Optional[int] = None
    is_paid = False

    if ev_type == "bill_paid" or str(bill.get("status") or "").lower() == "paid":
        is_paid = True
        m = re.search(r"B2C-ORD-(\d+)", bill_code)
        if m:
            target_order_id = int(m.group(1))
    else:
        m = re.search(r"CRZ-(\d+)", order_number)
        if m:
            target_order_id = int(m.group(1))
        if status_id == "6":
            is_paid = True

    order: Optional[Order] = None
    if target_order_id:
        order = db.query(Order).filter(Order.id == target_order_id, Order.origin == "b2c_storefront").first()
    elif token_transaction:
        order = (
            db.query(Order)
            .filter(Order.origin == "b2c_storefront", Order.external_id == token_transaction)
            .first()
        )

    # 3. Consulta oficial por token_transaction na API Vindi Commerce (get_by_token) conforme documentação
    if order:
        meta = _parse_order_meta(order)
        tok_to_check = token_transaction or str(meta.get("vindi_token_transaction") or "").strip()
        if tok_to_check:
            try:
                vindi = VindiCheckoutClient(db, order.company_id)
                if vindi.is_configured and vindi.credential_type == "VINDI_PAGAMENTOS":
                    tx_info = await vindi.get_transaction_by_token(tok_to_check)
                    sync_res = _sync_order_with_vindi_tx(db, order, tx_info, source="WEBHOOK_VINDI")
                    return {"received": True, **sync_res}
            except Exception as e:
                logger.warning(f"[Vindi Webhook] Falha ao consultar get_by_token ({tok_to_check}): {e}")

    if order and is_paid:
        if order.status != "PAID":
            order.status = "PAID"
            order.confirmed_at = datetime.utcnow()
            db.commit()
            _b2c_cache_clear(order.company_id)
        return {"received": True, "order_id": order.id, "status": "PAID"}

    return {"received": True, "updated": False}


@router.get("/public/orders/{order_id}/payment-status")
async def get_public_b2c_order_payment_status(
    order_id: int,
    db: Session = Depends(get_db),
):
    """
    Endpoint público de polling para a tela de PIX / Link da Storefront B2C:
    Verifica se o pedido já foi pago (via Webhook ou consultando `GET /api/v3/transactions/get_by_token` na Vindi).
    """
    from app.integrators.vindi_checkout import VindiCheckoutClient

    order = db.query(Order).filter(Order.id == order_id, Order.origin == "b2c_storefront").first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")

    norm_st = _normalize_b2c_order_status(order.status)
    meta = _parse_order_meta(order)
    if norm_st == "PAID":
        return {
            "order_id": order.id,
            "status": "PAID",
            "paid": True,
            "payment_method": meta.get("payment_method"),
            "payment_history": meta.get("payment_history") or [],
        }

    token_tx = str(meta.get("vindi_token_transaction") or "").strip()
    if token_tx:
        try:
            vindi = VindiCheckoutClient(db, order.company_id)
            if vindi.is_configured and vindi.credential_type == "VINDI_PAGAMENTOS":
                tx_info = await vindi.get_transaction_by_token(token_tx)
                return _sync_order_with_vindi_tx(db, order, tx_info, source="POLLING_AUTOMATICO")
        except Exception:
            pass

    return {"order_id": order.id, "status": norm_st, "paid": False}


class SyncVindiOrdersRequest(BaseModel):
    order_id: Optional[int] = None


@router.post("/orders/sync-vindi")
async def sync_b2c_orders_with_vindi(
    data: SyncVindiOrdersRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Permite ao Seller consultar ativamente na API da Vindi (`GET /api/v3/transactions/get_by_token`)
    o status real de pagamento (PIX ou Cartão), enriquecer dados do cliente preenchidos no Link Vindi
    e registrar o histórico de aprovação de um pedido específico ou de todos os pedidos pendentes.
    """
    from app.integrators.vindi_checkout import VindiCheckoutClient

    cid = _resolve_seller_company_id(current_user, company_id)
    vindi = VindiCheckoutClient(db, cid)
    if not vindi.is_configured:
        raise HTTPException(status_code=400, detail="Token da Vindi não configurado para esta loja.")

    q = db.query(Order).filter(Order.company_id == cid, Order.origin == "b2c_storefront")
    if data.order_id:
        q = q.filter(Order.id == data.order_id)
    else:
        q = q.filter(Order.status == "WAITING_PAYMENT")

    orders = q.order_by(Order.created_at.desc()).limit(50).all()
    checked = 0
    approved = 0
    details = []

    for o in orders:
        meta = _parse_order_meta(o)
        token_tx = str(meta.get("vindi_token_transaction") or "").strip()
        if not token_tx and o.external_id and str(o.external_id).startswith("t"):
            token_tx = str(o.external_id).strip()
        if not token_tx:
            continue
        checked += 1
        try:
            tx_info = await vindi.get_transaction_by_token(token_tx)
            sync_res = _sync_order_with_vindi_tx(db, o, tx_info, source="CONSULTA_PAINEL_SELLER")
            if sync_res.get("paid"):
                approved += 1
            details.append(sync_res)
        except Exception as e:
            details.append({"order_id": o.id, "error": str(e)})

    return {
        "checked_count": checked,
        "approved_count": approved,
        "details": details,
        "message": (
            f"Consulta concluída na Vindi: {checked} pedido(s) verificado(s), {approved} pagamento(s) aprovado(s)!"
            if checked > 0
            else "Nenhum pedido com token_transaction da Vindi encontrado para sincronizar."
        ),
    }
