import re
import uuid
import time
import logging
import threading
from datetime import datetime, date, timezone
from decimal import Decimal
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from app.integrators.horus_clients import HorusClients

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


_BLOCKED_B2C_SITUACOES = {"FC", "FE"}
_HORUS_SITUACAO_COL_ENSURED = False


def _ensure_horus_situacao_column(db: Session) -> None:
    """Garante de forma idempotente que a coluna horus_situacao_item exista em prd_product."""
    global _HORUS_SITUACAO_COL_ENSURED
    if _HORUS_SITUACAO_COL_ENSURED:
        return
    try:
        from sqlalchemy import text
        db.execute(text("ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS horus_situacao_item VARCHAR(20)"))
        db.commit()
        _HORUS_SITUACAO_COL_ENSURED = True
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass


def _is_b2c_zero_balance_sale_enabled(settings: Optional[CompanySettings]) -> bool:
    """Retorna True se o seller habilitou a venda B2C de itens com saldo zero (exceto situação FC ou FE)."""
    if not settings:
        return False
    raw_cfg = getattr(settings, "b2c_showcases_config", None)
    if isinstance(raw_cfg, dict):
        sync_cfg = raw_cfg.get("horus_sync_config")
        if isinstance(sync_cfg, dict) and "allow_zero_balance_sale" in sync_cfg:
            return bool(sync_cfg.get("allow_zero_balance_sale"))
        if "allow_zero_balance_sale" in raw_cfg:
            return bool(raw_cfg.get("allow_zero_balance_sale"))
    return False


def _can_sell_b2c_product(
    stock_qty: int,
    situacao_item: Optional[str],
    allow_zero_balance_sale: bool,
) -> tuple[bool, str]:
    """
    Calcula (allow_purchase, stock_status_label) para produtos da vitrine B2C:
    - Se stock_qty > 0: permite compra ("Em Estoque")
    - Se stock_qty <= 0:
      - Se allow_zero_balance_sale == True e situacao_item NÃO for FC nem FE: permite compra ("Disponível sob encomenda")
      - Caso contrário: bloqueia compra ("Indisponível (FC/FE)" ou "Avise-me quando chegar")
    """
    qty = max(0, int(stock_qty or 0))
    sit = str(situacao_item or "").strip().upper()
    if qty > 0:
        return True, "Em Estoque"
    if allow_zero_balance_sale and sit not in _BLOCKED_B2C_SITUACOES:
        return True, "Disponível sob encomenda"
    if sit in _BLOCKED_B2C_SITUACOES:
        return False, f"Indisponível ({sit})"
    return False, "Avise-me quando chegar"


def _recompute_company_b2c_product_availability(
    db: Session,
    company_id: int,
    allow_zero_balance_sale: bool,
) -> int:
    """Recalcula allow_purchase e stock_status_label de todos os produtos locais da empresa."""
    _ensure_horus_situacao_column(db)
    prods = db.query(Product).filter(Product.company_id == company_id).all()
    changed = 0
    for p in prods:
        qty = max(0, int(p.stock_quantity or 0))
        sit = getattr(p, "horus_situacao_item", None)
        new_allow, new_lbl = _can_sell_b2c_product(qty, sit, allow_zero_balance_sale)
        if bool(p.allow_purchase) != new_allow or (p.stock_status_label or "") != new_lbl:
            p.allow_purchase = new_allow
            p.stock_status_label = new_lbl
            changed += 1
    return changed


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
    store_slug: Optional[str] = None
    b2c_storefront_open: Optional[bool] = None
    b2c_checkout_mode: Optional[str] = None
    b2c_lgpd_terms_text: Optional[str] = None
    b2c_default_freight_value: Optional[float] = None
    b2c_free_shipping_min_value: Optional[float] = None
    b2c_showcases_config: Optional[Dict[str, Any]] = None
    footer_info: Optional[Dict[str, Any]] = None
    seo_config: Optional[Dict[str, Any]] = None
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
    horus_order_config: Optional[Dict[str, Any]] = None
    allow_zero_balance_sale: Optional[bool] = None
    email_notifications_config: Optional[Dict[str, Any]] = None
    tray_enabled: Optional[bool] = None
    tray_store_url: Optional[str] = None
    tray_auth_code: Optional[str] = None


class B2CTestEmailRequest(BaseModel):
    to_email: str
    event_status: str = "PAID"
    email_notifications_config: Optional[Dict[str, Any]] = None


class B2COrderSendEmailRequest(BaseModel):
    event_status: Optional[str] = None
    override_email: Optional[str] = None


class B2CCustomerManualUpsertRequest(BaseModel):
    name: str
    cpf: str
    email: str
    phone: Optional[str] = None
    zip_code: Optional[str] = None
    street: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    password: Optional[str] = None


class B2CSendToHorusRequest(BaseModel):
    force: bool = False


class B2CHorusSyncRequest(BaseModel):
    cod_tpo_caract: Optional[str] = None
    cod_caract: Optional[str] = None
    characteristic_type_name: Optional[str] = None
    characteristic_value: Optional[str] = None
    search_term: Optional[str] = None
    auto_collect_bookinfo_covers: bool = False
    allow_zero_balance_sale: Optional[bool] = None
    full_sync: bool = False
    custom_data_ini: Optional[str] = None
    max_items: int = Field(default=10000, ge=1, le=25000)


class B2CAppearanceUpdateRequest(BaseModel):
    branding: Optional[Dict[str, Any]] = None
    banners: Optional[List[Dict[str, Any]]] = None
    showcases: Optional[List[Dict[str, Any]]] = None
    categories: Optional[List[Dict[str, Any]]] = None
    promotions: Optional[List[Dict[str, Any]]] = None
    footer_info: Optional[Dict[str, Any]] = None
    seo_config: Optional[Dict[str, Any]] = None
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


def _default_b2c_email_config() -> Dict[str, Any]:
    wp_msg = "Recebemos o seu pedido #{pedido} no valor de {valor}. Assim que o pagamento for confirmado, iniciaremos a separação dos seus produtos."
    paid_msg = "O pagamento do seu pedido #{pedido} ({valor}) foi aprovado com sucesso! Já estamos preparando o seu pedido para envio."
    sep_msg = "Boas notícias! O seu pedido #{pedido} já está em separação em nosso estoque e em breve será expedido."
    fin_msg = "O seu pedido #{pedido} foi finalizado/faturado e preparado para envio. Confira abaixo os dados de acompanhamento."
    deliv_msg = "O seu pedido #{pedido} consta como entregue! Agradecemos a sua compra na {loja}."
    canc_msg = "Informamos que o seu pedido #{pedido} foi cancelado. Caso tenha qualquer dúvida, estamos à disposição em nossos canais de atendimento."
    return {
        "enabled": True,
        "waiting_payment_enabled": True,
        "waiting_payment_subject": "Pedido #{pedido} realizado — Aguardando Pagamento | {loja}",
        "waiting_payment_body": wp_msg,
        "waiting_payment_message": wp_msg,
        "paid_enabled": True,
        "paid_subject": "Pagamento Aprovado! Pedido #{pedido} confirmado | {loja}",
        "paid_body": paid_msg,
        "paid_message": paid_msg,
        "separation_enabled": True,
        "separation_subject": "Seu pedido #{pedido} está em separação | {loja}",
        "separation_body": sep_msg,
        "separation_message": sep_msg,
        "finalized_enabled": True,
        "finalized_subject": "Pedido #{pedido} finalizado e pronto para envio | {loja}",
        "finalized_body": fin_msg,
        "finalized_message": fin_msg,
        "delivered_enabled": True,
        "delivered_subject": "Pedido #{pedido} entregue! | {loja}",
        "delivered_body": deliv_msg,
        "delivered_message": deliv_msg,
        "canceled_enabled": True,
        "canceled_subject": "Pedido #{pedido} cancelado | {loja}",
        "canceled_body": canc_msg,
        "canceled_message": canc_msg,
        "footer_note": "Você pode acompanhar todos os detalhes em Minha Conta → Meus Pedidos na loja {loja}.",
    }


def _get_b2c_email_config(settings: Optional[CompanySettings]) -> Dict[str, Any]:
    defaults = _default_b2c_email_config()
    raw_cfg = getattr(settings, "b2c_showcases_config", None) if settings else None
    saved = (
        raw_cfg.get("email_notifications_config")
        if isinstance(raw_cfg, dict) and isinstance(raw_cfg.get("email_notifications_config"), dict)
        else {}
    )
    merged = {**defaults, **saved}
    # Sincroniza *_message e *_body para compatibilidade total em todos os 6 status oficiais
    for prefix in ("waiting_payment", "paid", "separation", "finalized", "delivered", "canceled"):
        msg_val = saved.get(f"{prefix}_message") or saved.get(f"{prefix}_body") or defaults[f"{prefix}_body"]
        merged[f"{prefix}_message"] = msg_val
        merged[f"{prefix}_body"] = msg_val
    return merged


def _default_b2c_horus_order_config(db: Optional[Session] = None, company_id: Optional[int] = None) -> Dict[str, Any]:
    base = {
        "enabled": False,
        "auto_send_on_paid": False,
        "tipo_pedido": "L",  # "L" = Logística/Remessa B2C (não exige condição financeira) ou "V" = Venda
        "cod_param_fiscal_intra": "",
        "cod_param_fiscal_inter": "",
        "cod_metodo": "1",
        "cod_endereco": "1",
        "cod_transp": "",
        "frete_emit_dest": "1",  # 1 = Emitente, 2 = Destinatário
        "status_envio_erp": "LEX",
        "resp_cliente": "",
        "cod_resp": "",
        "cod_forma": "",
        "send_freight_value": True,
        "price_mode": "UNIT_PRICE",  # "UNIT_PRICE" = Preço Unitário do Item | "NET_AFTER_COUPON" = Líquido pós-cupom
    }
    if db and company_id:
        try:
            from app.models.dropship import DropshipConfig
            dsp = db.query(DropshipConfig).filter(DropshipConfig.company_id == company_id).first()
            if dsp:
                base["cod_param_fiscal_intra"] = str(dsp.horus_fiscal_param_remessa_intra or dsp.horus_fiscal_param_venda or "")
                base["cod_param_fiscal_inter"] = str(dsp.horus_fiscal_param_remessa_inter or dsp.horus_fiscal_param_venda or "")
                base["cod_metodo"] = str(dsp.horus_cod_metodo or "1")
                base["cod_endereco"] = str(dsp.horus_cod_endereco or "1")
                base["cod_transp"] = str(dsp.horus_cod_transp or "")
                base["frete_emit_dest"] = str(dsp.horus_frete_emit_dest or "1")
                base["status_envio_erp"] = str(dsp.horus_status_envio_erp or "LEX")
                base["resp_cliente"] = str(dsp.horus_resp_cliente or "").upper()
                base["cod_resp"] = str(dsp.horus_cod_resp or "")
        except Exception:
            pass
    return base


def _get_b2c_horus_order_config(
    settings: Optional[CompanySettings],
    db: Optional[Session] = None,
    company_id: Optional[int] = None,
) -> Dict[str, Any]:
    defaults = _default_b2c_horus_order_config(db=db, company_id=company_id)
    raw_cfg = getattr(settings, "b2c_showcases_config", None) if settings else None
    saved = (
        raw_cfg.get("horus_order_config")
        if isinstance(raw_cfg, dict) and isinstance(raw_cfg.get("horus_order_config"), dict)
        else {}
    )
    return {**defaults, **saved}


def _resolve_smtp_settings(db: Session, company_id: int) -> Optional[CompanySettings]:
    """Retorna o SMTP do Seller ou faz fallback automático para o SMTP da Sede Master (company_id=1)."""
    s = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if s and s.smtp_host and s.smtp_username and s.smtp_password:
        return s
    master_s = db.query(CompanySettings).filter(CompanySettings.company_id == 1).first()
    if master_s and master_s.smtp_host and master_s.smtp_username and master_s.smtp_password:
        return master_s
    return None


def _send_b2c_order_email(
    db: Session,
    order: Order,
    event_status: Optional[str] = None,
    force: bool = False,
    override_email: Optional[str] = None,
    sync_send: bool = False,
    allow_resend: bool = False,
) -> bool:
    """
    Dispara e-mail automático, simples e objetivo para o comprador B2C nos 6 eventos:
    - WAITING_PAYMENT: Pedido realizado (aguardando pagamento)
    - PAID: Pagamento aprovado / Pedido pago
    - SEPARATION: Pedido em separação
    - FINALIZED: Pedido finalizado / faturado
    - DELIVERED: Pedido entregue
    - CANCELLED / CANCELED: Pedido cancelado (pelo portal ou retorno de pagamento)
    """
    try:
        company = db.query(Company).filter(Company.id == order.company_id).first()
        seller_settings = db.query(CompanySettings).filter(CompanySettings.company_id == order.company_id).first()
        email_cfg = _get_b2c_email_config(seller_settings)
        if not force and not email_cfg.get("enabled", True):
            return False

        cust = order.customer or (
            db.query(Customer).filter(Customer.id == order.customer_id).first() if order.customer_id else None
        )
        red = (
            db.query(B2CCouponRedemption)
            .filter(B2CCouponRedemption.company_id == order.company_id, B2CCouponRedemption.order_id == order.id)
            .first()
        )
        to_email = (
            (override_email or "").strip().lower()
            or (red.customer_email if red and red.customer_email else "").strip().lower()
            or (cust.email if cust and cust.email else "").strip().lower()
        )
        if not to_email or "@" not in to_email or "@compraexpressa" in to_email or "@checkout.vindi" in to_email:
            return False

        if override_email and cust and ("@compraexpressa" in (cust.email or "") or "@checkout.vindi" in (cust.email or "") or not cust.email):
            cust.email = to_email

        norm_st = _normalize_b2c_order_status(event_status or order.status)
        status_prefix_map = {
            "WAITING_PAYMENT": "waiting_payment",
            "PAID": "paid",
            "SEPARATION": "separation",
            "FINALIZED": "finalized",
            "DELIVERED": "delivered",
            "CANCELLED": "canceled",
            "CANCELED": "canceled",
        }
        st_prefix = status_prefix_map.get(norm_st)
        if not force and st_prefix and email_cfg.get(f"{st_prefix}_enabled") is False:
            return False

        meta = _parse_order_meta(order)
        sent_list = meta.get("emails_sent") if isinstance(meta.get("emails_sent"), list) else []
        if not force and not allow_resend and norm_st in sent_list:
            return False

        smtp_cfg = _resolve_smtp_settings(db, order.company_id)
        if not smtp_cfg:
            logger.info(f"[B2C Email] Pedido #{order.id} ({norm_st}): nenhum SMTP configurado para disparo.")
            return False

        store_name = company.name if company and company.name else "Nossa Loja"
        cust_name = (
            (red.customer_name if red and red.customer_name else None)
            or (cust.name if cust and cust.name else "Cliente")
        ).strip()
        total_val = float(order.total or 0.0)
        valor_fmt = f"R$ {total_val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

        vars_map = {
            "{cliente}": cust_name,
            "{nome_cliente}": cust_name,
            "{pedido}": str(order.id),
            "{numero_pedido}": str(order.id),
            "{loja}": store_name,
            "{nome_loja}": store_name,
            "{valor}": valor_fmt,
            "{valor_total}": valor_fmt,
        }

        def _apply_vars(text: str) -> str:
            out = text or ""
            for k, v in vars_map.items():
                out = out.replace(k, v)
            return out

        if norm_st == "WAITING_PAYMENT":
            subject = _apply_vars(email_cfg.get("waiting_payment_subject") or "")
            intro_text = _apply_vars(email_cfg.get("waiting_payment_message") or email_cfg.get("waiting_payment_body") or "")
            badge_bg, badge_color, badge_label = "#fef3c7", "#b45309", "⏳ Pedido Realizado • Aguardando Pagamento"
        elif norm_st == "PAID":
            subject = _apply_vars(email_cfg.get("paid_subject") or "")
            intro_text = _apply_vars(email_cfg.get("paid_message") or email_cfg.get("paid_body") or "")
            badge_bg, badge_color, badge_label = "#d1fae5", "#047857", "✅ Pagamento Aprovado"
        elif norm_st == "SEPARATION":
            subject = _apply_vars(email_cfg.get("separation_subject") or f"Seu pedido #{order.id} está em separação | {store_name}")
            intro_text = _apply_vars(email_cfg.get("separation_message") or email_cfg.get("separation_body") or "")
            badge_bg, badge_color, badge_label = "#e0e7ff", "#4338ca", "📦 Pedido em Separação"
        elif norm_st == "FINALIZED":
            subject = _apply_vars(email_cfg.get("finalized_subject") or f"Pedido #{order.id} finalizado e pronto para envio | {store_name}")
            intro_text = _apply_vars(email_cfg.get("finalized_message") or email_cfg.get("finalized_body") or "")
            badge_bg, badge_color, badge_label = "#dbeafe", "#1d4ed8", "🚚 Pedido Finalizado • Pronto para Envio"
        elif norm_st == "DELIVERED":
            subject = _apply_vars(email_cfg.get("delivered_subject") or f"Pedido #{order.id} entregue! | {store_name}")
            intro_text = _apply_vars(email_cfg.get("delivered_message") or email_cfg.get("delivered_body") or "")
            badge_bg, badge_color, badge_label = "#dcfce7", "#15803d", "🎉 Pedido Entregue"
        elif norm_st in ("CANCELLED", "CANCELED"):
            subject = _apply_vars(email_cfg.get("canceled_subject") or "")
            intro_text = _apply_vars(email_cfg.get("canceled_message") or email_cfg.get("canceled_body") or "")
            badge_bg, badge_color, badge_label = "#fee2e2", "#b91c1c", "❌ Pedido Cancelado"
        else:
            st_label = B2C_STATUS_LABELS.get(norm_st, norm_st)
            subject = f"Atualização do Pedido #{order.id}: {st_label} | {store_name}"
            intro_text = f"O status do seu pedido #{order.id} na loja {store_name} foi atualizado para: {st_label}."
            badge_bg, badge_color, badge_label = "#e0e7ff", "#4338ca", f"📦 {st_label}"

        # Lista enxuta de itens
        items_rows = ""
        for it in (order.items or []):
            it_total = float(it.total_price or (float(it.unit_price or 0) * int(it.quantity or 1)))
            it_fmt = f"R$ {it_total:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            items_rows += (
                f"<tr>"
                f"<td style='padding:8px 0;border-bottom:1px solid #f1f5f9;color:#334155;font-size:13px;'>"
                f"<strong>{it.quantity}x</strong> {it.name}</td>"
                f"<td style='padding:8px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:13px;font-weight:bold;text-align:right;'>"
                f"{it_fmt}</td>"
                f"</tr>"
            )

        action_block = ""
        vindi_url = meta.get("vindi_payment_url")
        if norm_st == "WAITING_PAYMENT" and vindi_url:
            action_block = (
                f"<div style='margin:20px 0;text-align:center;'>"
                f"<a href='{vindi_url}' style='display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold;font-size:14px;'>"
                f"Concluir Pagamento Online ({valor_fmt})</a>"
                f"</div>"
            )

        residual_block = ""
        res_code = meta.get("residual_coupon_code") or (red.residual_coupon_code if red else None)
        res_bal = float(meta.get("remaining_coupon_balance") or (red.remaining_balance if red else 0) or 0)
        if res_code and res_bal > 0 and norm_st in ("WAITING_PAYMENT", "PAID"):
            res_fmt = f"R$ {res_bal:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            residual_block = (
                f"<div style='margin:16px 0;padding:12px 16px;background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;font-size:13px;color:#92400e;'>"
                f"<strong>Saldo Residual Disponível ({res_fmt}):</strong> Utilize o cupom <code style='font-weight:bold;font-size:14px;'>{res_code}</code> na sua próxima compra."
                f"</div>"
            )

        tracking_block = ""
        if order.tracking_code or order.invoice_number:
            t_parts = []
            if order.invoice_number:
                t_parts.append(f"<div><strong>Nota Fiscal:</strong> {order.invoice_number}</div>")
            if order.tracking_code:
                t_parts.append(f"<div><strong>Código de Rastreio:</strong> {order.tracking_code}</div>")
            if meta.get("tracking_url"):
                t_parts.append(f"<div style='margin-top:6px;'><a href='{meta.get('tracking_url')}' style='color:#4f46e5;font-weight:bold;'>Rastrear entrega online →</a></div>")
            tracking_block = (
                f"<div style='margin:16px 0;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;color:#334155;'>"
                f"{''.join(t_parts)}</div>"
            )

        footer_text = _apply_vars(
            email_cfg.get("footer_note")
            or f"Você pode acompanhar todos os detalhes em Minha Conta → Meus Pedidos na loja {store_name}."
        )

        html_content = (
            f"<div style='font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;color:#0f172a;'>"
            f"<div style='border-bottom:1px solid #f1f5f9;padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;'>"
            f"<strong style='font-size:16px;color:#0f172a;'>{store_name}</strong>"
            f"<span style='font-size:12px;color:#64748b;'>Pedido #{order.id}</span>"
            f"</div>"
            f"<div style='display:inline-block;background:{badge_bg};color:{badge_color};padding:6px 12px;border-radius:8px;font-weight:bold;font-size:13px;margin-bottom:14px;'>"
            f"{badge_label}</div>"
            f"<p style='font-size:15px;font-weight:bold;margin:0 0 8px 0;'>Olá, {cust_name}!</p>"
            f"<p style='font-size:14px;color:#475569;line-height:1.5;margin:0 0 16px 0;'>{intro_text}</p>"
            f"{action_block}{residual_block}{tracking_block}"
            f"<div style='background:#f8fafc;padding:14px 16px;border-radius:12px;margin-top:16px;'>"
            f"<div style='font-size:11px;font-weight:bold;text-transform:uppercase;color:#64748b;margin-bottom:8px;'>Resumo do Pedido #{order.id}</div>"
            f"<table style='width:100%;border-collapse:collapse;'>{items_rows}</table>"
            f"<div style='margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:14px;font-weight:bold;color:#0f172a;'>"
            f"<span>Total a Pagar / Pago: </span><span style='float:right;color:#047857;'>{valor_fmt}</span>"
            f"</div></div>"
            f"<p style='color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;'>"
            f"{footer_text}</p>"
            f"</div>"
        )

        # Grava no pedido que o e-mail para este status foi disparado
        if norm_st not in sent_list:
            sent_list.append(norm_st)
        meta["emails_sent"] = sent_list
        meta["last_email_sent_at"] = datetime.now(timezone.utc).isoformat()
        meta["last_email_to"] = to_email
        _save_order_meta(order, meta)
        db.commit()

        import threading
        from app.core.email import send_smtp_email

        smtp_args = {
            "smtp_host": smtp_cfg.smtp_host,
            "smtp_port": int(smtp_cfg.smtp_port or 587),
            "smtp_username": smtp_cfg.smtp_username or "",
            "smtp_password": smtp_cfg.smtp_password or "",
            "smtp_from": smtp_cfg.smtp_from_email or smtp_cfg.smtp_username or "noreply@cronuz.com.br",
            "to_email": to_email,
            "subject": subject,
            "html_content": html_content,
            "use_ssl": bool(smtp_cfg.smtp_use_ssl),
            "bcc_email": smtp_cfg.smtp_bcc_email,
        }

        if sync_send:
            send_smtp_email(**smtp_args)
            return True

        def _bg_send():
            try:
                send_smtp_email(**smtp_args)
            except Exception as exc:
                logger.warning(f"[B2C Order Email] Falha SMTP no pedido #{order.id} ({norm_st}): {exc}")

        threading.Thread(target=_bg_send, daemon=True).start()
        return True
    except Exception as e:
        logger.warning(f"[B2C Order Email] Erro ao preparar e-mail do pedido #{order.id}: {e}")
        return False


_UF_NOMES_HORUS_UPPER: Dict[str, str] = {
    "AC": "ACRE", "AL": "ALAGOAS", "AP": "AMAPÁ", "AM": "AMAZONAS",
    "BA": "BAHIA", "CE": "CEARÁ", "DF": "DISTRITO FEDERAL",
    "ES": "ESPÍRITO SANTO", "GO": "GOIÁS", "MA": "MARANHÃO",
    "MT": "MATO GROSSO", "MS": "MATO GROSSO DO SUL", "MG": "MINAS GERAIS",
    "PA": "PARÁ", "PB": "PARAÍBA", "PR": "PARANÁ", "PE": "PERNAMBUCO",
    "PI": "PIAUÍ", "RJ": "RIO DE JANEIRO", "RN": "RIO GRANDE DO NORTE",
    "RS": "RIO GRANDE DO SUL", "RO": "RONDÔNIA", "RR": "RORAIMA",
    "SC": "SANTA CATARINA", "SP": "SÃO PAULO", "SE": "SERGIPE", "TO": "TOCANTINS",
}


def _upper_horus_dict(params: Dict[str, Any]) -> Dict[str, Any]:
    """Regra 11: Garante que todo valor textual enviado ao Horus esteja em CAIXA ALTA."""
    return {
        k: (v.strip().upper() if isinstance(v, str) else v)
        for k, v in params.items()
        if v is not None and v != ""
    }


async def _send_b2c_order_to_horus(
    db: Session,
    order: Order,
    force: bool = False,
) -> Dict[str, Any]:
    """
    Integra um pedido da Loja B2C ao Horus ERP via API Aberta do Horus (sem necessidade de ID_GUID do cliente),
    seguindo rigorosamente o fluxo homologado (Regra 11 — 100% CAIXA ALTA):
      1. Busca_Cliente (por CPF/CNPJ) -> se não existir, InsAltCliente (COD_CLI='NOVO')
      2. InsAltEndCliente (cadastra/atualiza endereço de entrega do consumidor final)
      3. Busca_Acervo / Cache local para resolver COD_ITEM de cada livro
      4. InsPedidoVenda (cria o cabeçalho do pedido no Horus ERP)
      5. InsItensPedidoVenda (insere os itens com QTD_PEDIDA e VLR_LIQUIDO)
      6. AltStatus_Pedido (avança o status para LEX/LAP conforme configuração)
    """
    meta = _parse_order_meta(order)
    if order.horus_pedido_venda and not force:
        return {
            "ok": True,
            "already_sent": True,
            "horus_pedido_venda": order.horus_pedido_venda,
            "horus_cod_cli": meta.get("horus_cod_cli"),
            "message": f"Pedido #{order.id} já está integrado ao Horus ERP (Pedido Horus #{order.horus_pedido_venda}).",
        }

    company = db.query(Company).filter(Company.id == order.company_id).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == order.company_id).first()
    if not settings or not settings.horus_enabled:
        raise ValueError("Integração Horus ERP não está habilitada nas configurações desta empresa.")

    h_cfg = _get_b2c_horus_order_config(settings, db=db, company_id=order.company_id)
    fiscal_intra = str(h_cfg.get("cod_param_fiscal_intra") or "").strip().upper()
    fiscal_inter = str(h_cfg.get("cod_param_fiscal_inter") or "").strip().upper()
    if not fiscal_intra and not fiscal_inter:
        raise ValueError(
            "Parâmetro Fiscal (COD_PARAM_FISCAL Intraestadual / Interestadual) não configurado. "
            "Acesse Loja B2C → Configurações → Integração Pedidos Horus e preencha o código do parâmetro fiscal."
        )

    cust = order.customer or (
        db.query(Customer).filter(Customer.id == order.customer_id).first() if order.customer_id else None
    )
    red = (
        db.query(B2CCouponRedemption)
        .filter(B2CCouponRedemption.company_id == order.company_id, B2CCouponRedemption.order_id == order.id)
        .first()
    )
    addr = cust.addresses[0] if (cust and getattr(cust, "addresses", None)) else None
    meta_ship = meta.get("shipping_address") if isinstance(meta.get("shipping_address"), dict) else {}

    cpf_cnpj = _clean_digits(
        (red.customer_cpf if red and red.customer_cpf else None)
        or (cust.document if cust and cust.document else "")
    )
    if not cpf_cnpj:
        raise ValueError("CPF/CNPJ do comprador não encontrado no pedido. O Horus exige CPF ou CNPJ para registrar o cliente.")

    nome = (
        (red.customer_name if red and red.customer_name else None)
        or (cust.name if cust and cust.name else "CLIENTE LOJA B2C")
    ).strip().upper()
    cep = _clean_digits(
        meta_ship.get("zip_code")
        or (getattr(addr, "zip_code", "") if addr else "")
        or (getattr(company, "zip_code", "") if company else "")
        or "01001000"
    )
    uf = (
        meta_ship.get("state")
        or (getattr(addr, "state", "") if addr else "")
        or (getattr(cust, "state", "") if cust else "")
        or (getattr(company, "state", "") if company else "")
        or "SP"
    ).strip().upper()[:2]
    cidade = (
        meta_ship.get("city")
        or (getattr(addr, "city", "") if addr else "")
        or (getattr(cust, "city", "") if cust else "")
        or (getattr(company, "city", "") if company else "")
        or "SAO PAULO"
    ).strip().upper()
    bairro = (
        meta_ship.get("neighborhood")
        or (getattr(addr, "neighborhood", "") if addr else "")
        or (getattr(company, "neighborhood", "") if company else "")
        or "CENTRO"
    ).strip().upper()
    endereco = (
        meta_ship.get("street")
        or (getattr(addr, "street", "") if addr else "")
        or (getattr(company, "address", "") if company else "")
        or "ENDERECO PADRAO"
    ).strip().upper()
    numero = (
        meta_ship.get("number")
        or (getattr(addr, "number", "") if addr else "")
        or "S/N"
    ).strip().upper()
    complemento = (
        meta_ship.get("complement")
        or (getattr(addr, "complement", "") if addr else "")
        or ""
    ).strip().upper()

    horus_clients = HorusClients(db, order.company_id)
    steps_log: List[Dict[str, Any]] = []
    warnings: List[str] = []

    try:
        # ──────────────────────────────────────────────────────────────────────
        # PASSO 1: Busca_Cliente (por CPF/CNPJ) ou InsAltCliente (COD_CLI='NOVO')
        # ──────────────────────────────────────────────────────────────────────
        cod_cli: Optional[str] = None
        busca = await horus_clients.get_client_b2c(cnpj_destino="", cpf=cpf_cnpj)
        if busca and not busca.get("error") and busca.get("data"):
            data_cli = busca["data"]
            cod_cli = str(data_cli.get("COD_CLI") or data_cli.get("CODIGO") or "").strip().upper() or None
            if cod_cli:
                steps_log.append({
                    "step": "Busca_Cliente",
                    "status": "OK",
                    "detail": f"Cliente localizado no Horus: COD_CLI={cod_cli} (CPF/CNPJ {cpf_cnpj})",
                })

        if not cod_cli:
            doc_key = "CPF" if len(cpf_cnpj) == 11 else "CNPJ"
            tpo_pessoa = "F" if len(cpf_cnpj) == 11 else "J"
            ins_params: Dict[str, Any] = {
                "COD_CLI": "NOVO",
                "TPO_PESSOA": tpo_pessoa,
                doc_key: cpf_cnpj,
                "NOM_CLI": (nome[:60] if nome else "CLIENTE LOJA B2C").upper(),
            }
            if h_cfg.get("resp_cliente"):
                ins_params["NOM_RESP"] = str(h_cfg["resp_cliente"]).strip().upper()
            if h_cfg.get("cod_resp"):
                ins_params["COD_RESPONSAVEL"] = str(h_cfg["cod_resp"]).strip().upper()

            ins_params = _upper_horus_dict(ins_params)
            ins_res = await horus_clients.get("InsAltCliente", params=ins_params)
            if ins_res and isinstance(ins_res, list) and len(ins_res) > 0:
                item_cli = ins_res[0]
                if item_cli.get("Falha") or item_cli.get("FALHA") == "S":
                    msg_horus = str(item_cli.get("Mensagem") or item_cli.get("MENSAGEM") or item_cli.get("MSG") or "Erro Horus")
                    if "duplica" in msg_horus.lower() or "buscar antes" in msg_horus.lower():
                        busca_retry = await horus_clients.get_client_b2c(cnpj_destino="", cpf=cpf_cnpj)
                        if busca_retry and not busca_retry.get("error") and busca_retry.get("data"):
                            cod_cli = str(busca_retry["data"].get("COD_CLI") or busca_retry["data"].get("CODIGO") or "").strip().upper() or None
                    if not cod_cli:
                        raise ValueError(f"InsAltCliente recusado pelo Horus: {msg_horus}")
                else:
                    cod_cli = str(item_cli.get("COD_CLI") or item_cli.get("CODIGO") or "").strip().upper() or None
            if not cod_cli:
                raise ValueError(f"InsAltCliente não retornou COD_CLI válido. Resposta Horus: {ins_res}")

            steps_log.append({
                "step": "InsAltCliente",
                "status": "OK",
                "detail": f"Cliente cadastrado no Horus: COD_CLI={cod_cli} ({nome[:60]})",
            })

        # ──────────────────────────────────────────────────────────────────────
        # PASSO 2: InsAltEndCliente — Cadastrar/atualizar endereço de entrega (CAIXA ALTA)
        # ──────────────────────────────────────────────────────────────────────
        end_params: Dict[str, Any] = {
            "COD_CLI": cod_cli,
            "COD_TPO_END": str(h_cfg.get("cod_endereco") or "1").strip().upper(),
            "NOM_PAIS": "BRASIL",
            "SIGLA_UF": uf,
            "NOME_UF": _UF_NOMES_HORUS_UPPER.get(uf, uf).upper(),
            "NOM_LOCAL": cidade[:60],
            "NOM_BAIRRO": bairro[:40],
            "DESC_ENDERECO": endereco[:80],
            "NUM_END": numero[:10],
            "CEP": cep,
        }
        if complemento:
            end_params["COM_ENDERECO"] = complemento[:40]
        end_params = _upper_horus_dict(end_params)
        try:
            end_res = await horus_clients.get("InsAltEndCliente", params=end_params)
            end_fail = _extract_horus_failures(end_res)
            if end_fail:
                warnings.append(f"InsAltEndCliente aviso: {' | '.join(end_fail)}")
                steps_log.append({"step": "InsAltEndCliente", "status": "WARNING", "detail": " | ".join(end_fail)})
            else:
                steps_log.append({
                    "step": "InsAltEndCliente",
                    "status": "OK",
                    "detail": f"Endereço atualizado: {endereco[:40]}, {numero} - {cidade}/{uf} (CEP {cep})",
                })
        except Exception as e_end:
            warnings.append(f"InsAltEndCliente falhou (não bloqueante): {e_end}")

        # ──────────────────────────────────────────────────────────────────────
        # PASSO 3: Resolver COD_ITEM de todos os itens do pedido
        # ──────────────────────────────────────────────────────────────────────
        order_items = list(order.items or [])
        if not order_items:
            raise ValueError("O pedido não possui itens para enviar ao Horus.")

        resolved_items: List[Dict[str, Any]] = []
        for it in order_items:
            cod_item_val: Optional[str] = None
            isbn_clean = str(it.ean_isbn or it.sku or "").strip().upper()

            if it.product_id:
                p_obj = db.query(Product).filter(Product.id == it.product_id).first()
                if p_obj and p_obj.horus_cod_item:
                    cod_item_val = str(p_obj.horus_cod_item).strip()

            if not cod_item_val and isbn_clean:
                p_by_ean = (
                    db.query(Product)
                    .filter(
                        Product.company_id == order.company_id,
                        or_(Product.ean_gtin == isbn_clean, Product.sku == isbn_clean),
                    )
                    .first()
                )
                if p_by_ean and p_by_ean.horus_cod_item:
                    cod_item_val = str(p_by_ean.horus_cod_item).strip()

            if not cod_item_val and isbn_clean:
                try:
                    acervo = await horus_clients.get("Busca_Acervo", params={"BARRAS_ISBN": isbn_clean})
                    if isinstance(acervo, list) and len(acervo) > 0 and isinstance(acervo[0], dict) and not acervo[0].get("Falha"):
                        cod_item_val = str(acervo[0].get("COD_ITEM") or acervo[0].get("CODIGO") or "").strip() or None
                except Exception:
                    pass

            if not cod_item_val and str(it.sku or "").strip().isdigit():
                cod_item_val = str(it.sku).strip()

            if not cod_item_val:
                raise ValueError(
                    f"Não foi possível localizar o COD_ITEM no Horus para o produto '{it.name}' (ISBN/SKU: {isbn_clean})."
                )

            resolved_items.append({
                "order_item": it,
                "cod_item": cod_item_val.upper(),
                "isbn": isbn_clean,
                "qty": max(1, int(it.quantity or 1)),
                "unit_price": float(it.unit_price or 0.0),
            })

        # ──────────────────────────────────────────────────────────────────────
        # PASSO 4: InsPedidoVenda (Cabeçalho do Pedido via API Aberta B2C)
        # ──────────────────────────────────────────────────────────────────────
        uf_seller = str(getattr(company, "state", "") or "SP").strip().upper()[:2]
        if uf_seller and uf and uf_seller == uf:
            fiscal_param = fiscal_intra or fiscal_inter
        else:
            fiscal_param = fiscal_inter or fiscal_intra

        coupon_ref = (red.coupon_code if red and red.coupon_code else None) or (
            order.customer_order_ref if order.customer_order_ref and order.customer_order_ref != "B2C_DIRECT" else None
        )
        obs_parts = [
            f"LOJA B2C | PEDIDO #{order.id}",
            f"CLIENTE: {nome[:40]}",
            f"CPF: {cpf_cnpj}",
            f"CEP: {cep}",
        ]
        if coupon_ref:
            obs_parts.append(f"CUPOM: {coupon_ref}")
        obs_pedido = " | ".join(obs_parts).upper()[:240]

        tipo_ped = str(h_cfg.get("tipo_pedido") or "L").strip().upper()[:1] or "L"
        pedido_params: Dict[str, Any] = {
            "TIPO_PEDIDO_V_T_D": tipo_ped,
            "COD_PARAM_FISCAL": fiscal_param,
            "COD_PEDIDO_ORIGEM": f"B2C-{order.id}".upper(),
            "COD_CLI": cod_cli,
            "OBS_PEDIDO": obs_pedido,
        }
        if settings.horus_company:
            pedido_params["COD_EMPRESA"] = str(settings.horus_company).strip().upper()
        if settings.horus_branch:
            pedido_params["COD_FILIAL"] = str(settings.horus_branch).strip().upper()
        if h_cfg.get("cod_metodo"):
            pedido_params["COD_METODO"] = str(h_cfg["cod_metodo"]).strip().upper()
        if h_cfg.get("cod_endereco"):
            pedido_params["COD_TPO_END"] = str(h_cfg["cod_endereco"]).strip().upper()
        if h_cfg.get("cod_transp"):
            pedido_params["COD_TRANSP"] = str(h_cfg["cod_transp"]).strip().upper()
        if h_cfg.get("frete_emit_dest"):
            pedido_params["FRETE_EMIT_DEST"] = str(h_cfg["frete_emit_dest"]).strip().upper()
        if h_cfg.get("cod_forma") and tipo_ped == "V":
            pedido_params["COD_FORMA"] = str(h_cfg["cod_forma"]).strip().upper()

        freight_val = float(red.order_freight or 0) if red else float(meta.get("freight_value") or 0.0)
        if h_cfg.get("send_freight_value", True) and freight_val > 0:
            pedido_params["VLR_FRETE"] = round(freight_val, 2)

        pedido_params = _upper_horus_dict(pedido_params)
        ped_res = await horus_clients.get("InsPedidoVenda", params=pedido_params)
        cod_ped_venda: Optional[str] = None
        if ped_res and isinstance(ped_res, list) and len(ped_res) > 0:
            if ped_res[0].get("Falha") or ped_res[0].get("FALHA") == "S":
                msg_ped = str(ped_res[0].get("Mensagem") or ped_res[0].get("MENSAGEM") or ped_res[0])
                raise ValueError(f"InsPedidoVenda recusado pelo Horus: {msg_ped}")
            cod_ped_venda = str(ped_res[0].get("COD_PED_VENDA") or "").strip().upper() or None

        if not cod_ped_venda:
            raise ValueError(f"Horus não retornou COD_PED_VENDA em InsPedidoVenda. Resposta: {ped_res}")

        steps_log.append({
            "step": "InsPedidoVenda",
            "status": "OK",
            "detail": f"Pedido criado no Horus: COD_PED_VENDA={cod_ped_venda} (CFOP/Param Fiscal={fiscal_param}, Tipo={tipo_ped})",
        })

        # ──────────────────────────────────────────────────────────────────────
        # PASSO 5: InsItensPedidoVenda (Inserir todos os itens do pedido)
        # ──────────────────────────────────────────────────────────────────────
        price_mode = str(h_cfg.get("price_mode") or "UNIT_PRICE").strip().upper()
        subtotal_val = float(order.subtotal or 0.0)
        discount_val = float(order.discount or 0.0)
        discount_ratio = (
            max(0.0, min(0.99, (subtotal_val - discount_val) / subtotal_val))
            if (price_mode == "NET_AFTER_COUPON" and subtotal_val > 0 and discount_val > 0)
            else 1.0
        )

        items_sent_count = 0
        for r_it in resolved_items:
            raw_unit = float(r_it["unit_price"] or 0.01)
            vlr_liq = round(max(0.01, raw_unit * discount_ratio), 2)
            item_params: Dict[str, Any] = {
                "COD_PED_VENDA": cod_ped_venda,
                "COD_ITEM": r_it["cod_item"],
                "QTD_PEDIDA": r_it["qty"],
                "VLR_LIQUIDO": vlr_liq,
                "COD_CLI": cod_cli,
            }
            if settings.horus_company:
                item_params["COD_EMPRESA"] = str(settings.horus_company).strip().upper()
            if settings.horus_branch:
                item_params["COD_FILIAL"] = str(settings.horus_branch).strip().upper()

            item_params = _upper_horus_dict(item_params)
            it_res = await horus_clients.get("InsItensPedidoVenda", params=item_params)
            it_fail = _extract_horus_failures(it_res)
            if it_fail:
                warnings.append(f"Item {r_it['cod_item']} ({r_it['isbn']}): {' | '.join(it_fail)}")
            else:
                items_sent_count += 1

        steps_log.append({
            "step": "InsItensPedidoVenda",
            "status": "OK" if items_sent_count == len(resolved_items) else "WARNING",
            "detail": f"{items_sent_count}/{len(resolved_items)} item(ns) inserido(s) no pedido Horus #{cod_ped_venda}",
        })

        # ──────────────────────────────────────────────────────────────────────
        # PASSO 6: AltStatus_Pedido (Liberar pedido no Horus, ex: LEX / LAP)
        # ──────────────────────────────────────────────────────────────────────
        target_erp_status = str(h_cfg.get("status_envio_erp") or "").strip().upper()
        if target_erp_status:
            alt_params: Dict[str, Any] = {
                "COD_EMPRESA": settings.horus_company,
                "COD_FILIAL": settings.horus_branch,
                "COD_CLI": cod_cli,
                "COD_PED_VENDA": cod_ped_venda,
                "STA_PEDIDO": target_erp_status,
            }
            alt_params = _upper_horus_dict(alt_params)
            try:
                alt_res = await horus_clients.get("AltStatus_Pedido", params=alt_params)
                alt_fail = _extract_horus_failures(alt_res)
                if alt_fail:
                    warnings.append(f"AltStatus_Pedido ({target_erp_status}): {' | '.join(alt_fail)}")
                    steps_log.append({"step": "AltStatus_Pedido", "status": "WARNING", "detail": " | ".join(alt_fail)})
                else:
                    steps_log.append({
                        "step": "AltStatus_Pedido",
                        "status": "OK",
                        "detail": f"Status no Horus avançado para {target_erp_status}",
                    })
            except Exception as e_alt:
                warnings.append(f"AltStatus_Pedido ({target_erp_status}) falhou: {e_alt}")

        # Persistir no Pedido B2C
        now_iso = datetime.now(timezone.utc).isoformat()
        order.horus_pedido_venda = str(cod_ped_venda)
        meta["horus_pedido_venda"] = str(cod_ped_venda)
        meta["horus_cod_cli"] = str(cod_cli)
        meta["horus_sent_at"] = now_iso
        meta["horus_status_erp"] = target_erp_status or "CRIADO"
        meta["horus_integration_log"] = steps_log
        if warnings:
            meta["horus_warnings"] = warnings
        _save_order_meta(order, meta)
        db.commit()
        db.refresh(order)

        return {
            "ok": True,
            "already_sent": False,
            "horus_pedido_venda": str(cod_ped_venda),
            "horus_cod_cli": str(cod_cli),
            "horus_status_erp": target_erp_status or "CRIADO",
            "horus_sent_at": now_iso,
            "items_sent": items_sent_count,
            "warnings": warnings,
            "steps_log": steps_log,
            "message": f"Pedido #{order.id} integrado ao Horus ERP com sucesso! Nº Horus: {cod_ped_venda} (COD_CLI: {cod_cli}).",
        }
    finally:
        try:
            await horus_clients.close()
        except Exception:
            pass


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
        "allow_zero_balance_sale": _is_b2c_zero_balance_sale_enabled(settings),
        "last_sync_at": raw_sync_cfg.get("last_sync_at"),
        "last_synced_count": int(raw_sync_cfg.get("last_synced_count") or 0),
    }

    appearance_cfg = _build_b2c_appearance_config(company, settings, db) if company else {}
    resolved_store_slug = (
        (appearance_cfg.get("branding") or {}).get("store_slug")
        or _slugify_store_name(company.name if company else f"loja-{cid}", cid)
    )

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
            "company_id": cid,
            "company_name": company.name if company else "",
            "store_slug": resolved_store_slug,
            "b2c_custom_domain": getattr(company, "b2c_custom_domain", None) if company else None,
            "domain": company.domain if company else None,
            "custom_domain": company.custom_domain if company else None,
            "footer_info": appearance_cfg.get("footer_info") or {},
            "seo_config": appearance_cfg.get("seo_config") or {},
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
            "horus_company": getattr(settings, "horus_company", "") or "" if settings else "",
            "horus_branch": getattr(settings, "horus_branch", "") or "" if settings else "",
            "allow_zero_balance_sale": _is_b2c_zero_balance_sale_enabled(settings),
            "freight_config": freight_config,
            "horus_sync_config": horus_sync_config,
            "horus_order_config": _get_b2c_horus_order_config(settings, db=db, company_id=cid),
            "email_notifications_config": _get_b2c_email_config(settings),
            "smtp_configured": bool(_resolve_smtp_settings(db, cid)),
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
        next_allow_zero = (
            bool(data.horus_sync_config.get("allow_zero_balance_sale"))
            if "allow_zero_balance_sale" in data.horus_sync_config
            else bool(prev_sync.get("allow_zero_balance_sale", False))
        )
        raw_cfg["horus_sync_config"] = {
            **prev_sync,
            "cod_tpo_caract": str(data.horus_sync_config.get("cod_tpo_caract") or "").strip(),
            "characteristic_type_name": str(data.horus_sync_config.get("characteristic_type_name") or "").strip(),
            "characteristic_value": str(data.horus_sync_config.get("characteristic_value") or "").strip(),
            "search_term": str(data.horus_sync_config.get("search_term") or "").strip(),
            "auto_collect_bookinfo_covers": bool(data.horus_sync_config.get("auto_collect_bookinfo_covers", False)),
            "allow_zero_balance_sale": next_allow_zero,
            "cod_caract": str(data.horus_sync_config.get("cod_caract") or "").strip(),
        }
        settings.b2c_showcases_config = raw_cfg
        flag_modified(settings, "b2c_showcases_config")
        _recompute_company_b2c_product_availability(db, cid, next_allow_zero)

    if data.allow_zero_balance_sale is not None:
        raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
        prev_sync = raw_cfg.get("horus_sync_config") if isinstance(raw_cfg.get("horus_sync_config"), dict) else {}
        next_allow_zero = bool(data.allow_zero_balance_sale)
        raw_cfg["horus_sync_config"] = {
            **prev_sync,
            "allow_zero_balance_sale": next_allow_zero,
        }
        settings.b2c_showcases_config = raw_cfg
        flag_modified(settings, "b2c_showcases_config")
        _recompute_company_b2c_product_availability(db, cid, next_allow_zero)

    if data.horus_order_config is not None and isinstance(data.horus_order_config, dict):
        raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
        prev_hord = (
            raw_cfg.get("horus_order_config")
            if isinstance(raw_cfg.get("horus_order_config"), dict)
            else _default_b2c_horus_order_config(db=db, company_id=cid)
        )
        raw_cfg["horus_order_config"] = {
            **prev_hord,
            "enabled": bool(data.horus_order_config.get("enabled", True)),
            "auto_send_on_paid": bool(data.horus_order_config.get("auto_send_on_paid", False)),
            "tipo_pedido": str(data.horus_order_config.get("tipo_pedido") or "L").strip().upper()[:1] or "L",
            "cod_param_fiscal_intra": str(data.horus_order_config.get("cod_param_fiscal_intra") or "").strip().upper(),
            "cod_param_fiscal_inter": str(data.horus_order_config.get("cod_param_fiscal_inter") or "").strip().upper(),
            "cod_metodo": str(data.horus_order_config.get("cod_metodo") or "1").strip().upper(),
            "cod_endereco": str(data.horus_order_config.get("cod_endereco") or "1").strip().upper(),
            "cod_transp": str(data.horus_order_config.get("cod_transp") or "").strip().upper(),
            "frete_emit_dest": str(data.horus_order_config.get("frete_emit_dest") or "1").strip().upper(),
            "status_envio_erp": str(data.horus_order_config.get("status_envio_erp") or "LEX").strip().upper(),
            "resp_cliente": str(data.horus_order_config.get("resp_cliente") or "").strip().upper(),
            "cod_resp": str(data.horus_order_config.get("cod_resp") or "").strip().upper(),
            "cod_forma": str(data.horus_order_config.get("cod_forma") or "").strip().upper(),
            "send_freight_value": bool(data.horus_order_config.get("send_freight_value", True)),
            "price_mode": str(data.horus_order_config.get("price_mode") or "UNIT_PRICE").strip().upper(),
        }
        settings.b2c_showcases_config = raw_cfg
        flag_modified(settings, "b2c_showcases_config")

    if data.email_notifications_config is not None and isinstance(data.email_notifications_config, dict):
        raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
        merged_email_cfg = {**_default_b2c_email_config(), **data.email_notifications_config}
        for prefix in ("waiting_payment", "paid", "separation", "finalized", "delivered", "canceled"):
            msg_val = (
                data.email_notifications_config.get(f"{prefix}_message")
                or data.email_notifications_config.get(f"{prefix}_body")
                or merged_email_cfg.get(f"{prefix}_body")
            )
            merged_email_cfg[f"{prefix}_message"] = msg_val
            merged_email_cfg[f"{prefix}_body"] = msg_val
        raw_cfg["email_notifications_config"] = merged_email_cfg
        settings.b2c_showcases_config = raw_cfg
        flag_modified(settings, "b2c_showcases_config")

    if data.store_slug is not None:
        raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
        prev_branding = dict(raw_cfg.get("branding")) if isinstance(raw_cfg.get("branding"), dict) else {}
        cleaned_slug = _slugify_store_name(data.store_slug.strip() or (company.name if company else f"loja-{cid}"), cid)
        if cleaned_slug.isdigit() and company and company.name:
            cleaned_slug = _slugify_store_name(company.name, cid)
        prev_branding["store_slug"] = cleaned_slug
        raw_cfg["branding"] = prev_branding
        settings.b2c_showcases_config = raw_cfg
        flag_modified(settings, "b2c_showcases_config")

    if data.footer_info is not None and isinstance(data.footer_info, dict):
        raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
        prev_footer = dict(raw_cfg.get("footer_info")) if isinstance(raw_cfg.get("footer_info"), dict) else {}
        raw_cfg["footer_info"] = {**prev_footer, **data.footer_info}
        settings.b2c_showcases_config = raw_cfg
        flag_modified(settings, "b2c_showcases_config")

    if data.seo_config is not None and isinstance(data.seo_config, dict):
        raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
        prev_seo = dict(raw_cfg.get("seo_config")) if isinstance(raw_cfg.get("seo_config"), dict) else {}
        raw_cfg["seo_config"] = {**prev_seo, **data.seo_config}
        settings.b2c_showcases_config = raw_cfg
        flag_modified(settings, "b2c_showcases_config")

    db.commit()
    _b2c_cache_clear(cid)

    try:
        import threading
        from app.core.ssl_authors import ensure_author_portal_ssl, ensure_custom_b2c_domain_ssl
        final_cfg = getattr(settings, "b2c_showcases_config", None) or {}
        saved_slug = (final_cfg.get("branding") or {}).get("store_slug") or (company.domain if company else None)
        if saved_slug:
            threading.Thread(target=ensure_author_portal_ssl, args=(saved_slug,), daemon=True).start()
        if company and getattr(company, "b2c_custom_domain", None):
            threading.Thread(target=ensure_custom_b2c_domain_ssl, args=(company.b2c_custom_domain,), daemon=True).start()
    except Exception:
        pass

    return {"message": "Configurações B2C atualizadas com sucesso!"}


@router.post("/settings/test-email")
def send_b2c_test_email(
    data: B2CTestEmailRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Dispara um e-mail real de teste síncrono para o destinatário informado usando o modelo do evento selecionado
    (WAITING_PAYMENT, PAID, SEPARATION, FINALIZED, DELIVERED ou CANCELLED), validando imediatamente o SMTP.
    """
    from app.core.email import send_smtp_email

    cid = _resolve_seller_company_id(current_user, company_id)
    to_email = (data.to_email or "").strip().lower()
    if not to_email or "@" not in to_email:
        raise HTTPException(status_code=400, detail="Informe um endereço de e-mail válido para o teste.")

    smtp_cfg = _resolve_smtp_settings(db, cid)
    if not smtp_cfg:
        raise HTTPException(
            status_code=400,
            detail="Nenhum servidor SMTP ativo encontrado. Configure o SMTP em Configurações da Empresa ou no Painel Master.",
        )

    company = db.query(Company).filter(Company.id == cid).first()
    seller_settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    email_cfg = _get_b2c_email_config(seller_settings)
    if data.email_notifications_config and isinstance(data.email_notifications_config, dict):
        email_cfg = {**email_cfg, **data.email_notifications_config}

    store_name = company.name if company and company.name else "Nossa Loja"
    norm_st = _normalize_b2c_order_status(data.event_status)

    # Se existir um pedido B2C real, usa os itens dele como exemplo; caso contrário monta exemplo demonstrativo
    sample_order = (
        db.query(Order)
        .filter(Order.company_id == cid, Order.origin == "b2c_storefront")
        .order_by(Order.id.desc())
        .first()
    )
    sample_id = sample_order.id if sample_order else 9999
    sample_total = float(sample_order.total or 89.90) if sample_order else 89.90
    valor_fmt = f"R$ {sample_total:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    cust_name = "Cliente Teste"
    if sample_order and sample_order.customer and sample_order.customer.name:
        cust_name = sample_order.customer.name

    vars_map = {
        "{cliente}": cust_name,
        "{nome_cliente}": cust_name,
        "{pedido}": str(sample_id),
        "{numero_pedido}": str(sample_id),
        "{loja}": store_name,
        "{nome_loja}": store_name,
        "{valor}": valor_fmt,
        "{valor_total}": valor_fmt,
    }

    def _apply_vars(text: str) -> str:
        out = text or ""
        for k, v in vars_map.items():
            out = out.replace(k, v)
        return out

    if norm_st == "WAITING_PAYMENT":
        subject = _apply_vars(email_cfg.get("waiting_payment_subject") or "")
        intro_text = _apply_vars(email_cfg.get("waiting_payment_message") or email_cfg.get("waiting_payment_body") or "")
        badge_bg, badge_color, badge_label = "#fef3c7", "#b45309", "⏳ Pedido Realizado • Aguardando Pagamento"
    elif norm_st == "PAID":
        subject = _apply_vars(email_cfg.get("paid_subject") or "")
        intro_text = _apply_vars(email_cfg.get("paid_message") or email_cfg.get("paid_body") or "")
        badge_bg, badge_color, badge_label = "#d1fae5", "#047857", "✅ Pagamento Aprovado"
    elif norm_st == "SEPARATION":
        subject = _apply_vars(email_cfg.get("separation_subject") or f"Seu pedido #{sample_id} está em separação | {store_name}")
        intro_text = _apply_vars(email_cfg.get("separation_message") or email_cfg.get("separation_body") or "")
        badge_bg, badge_color, badge_label = "#e0e7ff", "#4338ca", "📦 Pedido em Separação"
    elif norm_st == "FINALIZED":
        subject = _apply_vars(email_cfg.get("finalized_subject") or f"Pedido #{sample_id} finalizado e pronto para envio | {store_name}")
        intro_text = _apply_vars(email_cfg.get("finalized_message") or email_cfg.get("finalized_body") or "")
        badge_bg, badge_color, badge_label = "#dbeafe", "#1d4ed8", "🚚 Pedido Finalizado • Pronto para Envio"
    elif norm_st == "DELIVERED":
        subject = _apply_vars(email_cfg.get("delivered_subject") or f"Pedido #{sample_id} entregue! | {store_name}")
        intro_text = _apply_vars(email_cfg.get("delivered_message") or email_cfg.get("delivered_body") or "")
        badge_bg, badge_color, badge_label = "#dcfce7", "#15803d", "🎉 Pedido Entregue"
    elif norm_st in ("CANCELLED", "CANCELED"):
        subject = _apply_vars(email_cfg.get("canceled_subject") or "")
        intro_text = _apply_vars(email_cfg.get("canceled_message") or email_cfg.get("canceled_body") or "")
        badge_bg, badge_color, badge_label = "#fee2e2", "#b91c1c", "❌ Pedido Cancelado"
    else:
        st_label = B2C_STATUS_LABELS.get(norm_st, norm_st)
        subject = f"Atualização do Pedido #{sample_id}: {st_label} | {store_name}"
        intro_text = f"O status do seu pedido #{sample_id} na loja {store_name} foi atualizado para: {st_label}."
        badge_bg, badge_color, badge_label = "#e0e7ff", "#4338ca", f"📦 {st_label}"

    subject = f"[TESTE] {subject}"

    items_rows = ""
    if sample_order and sample_order.items:
        for it in sample_order.items:
            it_total = float(it.total_price or (float(it.unit_price or 0) * int(it.quantity or 1)))
            it_fmt = f"R$ {it_total:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            items_rows += (
                f"<tr><td style='padding:8px 0;border-bottom:1px solid #f1f5f9;color:#334155;font-size:13px;'>"
                f"<strong>{it.quantity}x</strong> {it.name}</td>"
                f"<td style='padding:8px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:13px;font-weight:bold;text-align:right;'>"
                f"{it_fmt}</td></tr>"
            )
    else:
        items_rows = (
            "<tr><td style='padding:8px 0;border-bottom:1px solid #f1f5f9;color:#334155;font-size:13px;'>"
            "<strong>1x</strong> Livro Demonstrativo de Teste</td>"
            f"<td style='padding:8px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:13px;font-weight:bold;text-align:right;'>"
            f"{valor_fmt}</td></tr>"
        )

    tracking_block = ""
    if norm_st in ("FINALIZED", "DELIVERED"):
        tracking_block = (
            "<div style='margin:16px 0;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;color:#334155;'>"
            "<div><strong>Nota Fiscal:</strong> 00012548</div>"
            "<div><strong>Código de Rastreio:</strong> AA123456789BR</div>"
            "</div>"
        )

    footer_text = _apply_vars(
        email_cfg.get("footer_note")
        or f"Você pode acompanhar todos os detalhes em Minha Conta → Meus Pedidos na loja {store_name}."
    )

    html_content = (
        f"<div style='font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;color:#0f172a;'>"
        f"<div style='border-bottom:1px solid #f1f5f9;padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;'>"
        f"<strong style='font-size:16px;color:#0f172a;'>{store_name}</strong>"
        f"<span style='font-size:12px;color:#64748b;'>Pedido #{sample_id}</span>"
        f"</div>"
        f"<div style='display:inline-block;background:{badge_bg};color:{badge_color};padding:6px 12px;border-radius:8px;font-weight:bold;font-size:13px;margin-bottom:14px;'>"
        f"{badge_label}</div>"
        f"<p style='font-size:15px;font-weight:bold;margin:0 0 8px 0;'>Olá, {cust_name}!</p>"
        f"<p style='font-size:14px;color:#475569;line-height:1.5;margin:0 0 16px 0;'>{intro_text}</p>"
        f"{tracking_block}"
        f"<div style='background:#f8fafc;padding:14px 16px;border-radius:12px;margin-top:16px;'>"
        f"<div style='font-size:11px;font-weight:bold;text-transform:uppercase;color:#64748b;margin-bottom:8px;'>Resumo do Pedido #{sample_id}</div>"
        f"<table style='width:100%;border-collapse:collapse;'>{items_rows}</table>"
        f"<div style='margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:14px;font-weight:bold;color:#0f172a;'>"
        f"<span>Total a Pagar / Pago: </span><span style='float:right;color:#047857;'>{valor_fmt}</span>"
        f"</div></div>"
        f"<p style='color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;'>{footer_text}</p>"
        f"</div>"
    )

    try:
        send_smtp_email(
            smtp_host=smtp_cfg.smtp_host,
            smtp_port=int(smtp_cfg.smtp_port or 587),
            smtp_username=smtp_cfg.smtp_username or "",
            smtp_password=smtp_cfg.smtp_password or "",
            smtp_from=smtp_cfg.smtp_from_email or smtp_cfg.smtp_username or "noreply@cronuz.com.br",
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            use_ssl=bool(smtp_cfg.smtp_use_ssl),
            bcc_email=None,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"O servidor SMTP ({smtp_cfg.smtp_host}:{smtp_cfg.smtp_port or 587}) recusou ou falhou no envio para {to_email}: {exc}",
        )

    return {
        "sent": True,
        "to_email": to_email,
        "event_status": norm_st,
        "subject": subject,
        "smtp_host": smtp_cfg.smtp_host,
        "message": f"E-mail de teste ({B2C_STATUS_LABELS.get(norm_st, norm_st)}) enviado com sucesso para {to_email}!",
    }


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


def _extract_horus_failures(raw_resp: Any) -> List[str]:
    """Extrai mensagens de erro/falha reais retornadas pela API do Horus ERP."""
    msgs: List[str] = []
    rows = raw_resp if isinstance(raw_resp, list) else ([raw_resp] if isinstance(raw_resp, dict) else [])
    for r in rows:
        if not isinstance(r, dict):
            continue
        if "Falha" in r or "FALHA" in r or "Erro" in r or "ERRO" in r:
            falha_lbl = str(r.get("Falha") or r.get("FALHA") or r.get("Erro") or r.get("ERRO") or "Falha Horus").strip()
            det_msg = str(r.get("Mensagem") or r.get("MENSAGEM") or r.get("mensagem") or "").strip()
            combined = f"{falha_lbl}: {det_msg}" if det_msg and det_msg != falha_lbl else falha_lbl
            if combined and combined not in msgs:
                msgs.append(combined)
    return msgs


def _is_horus_empty_result_message(msgs: List[str]) -> bool:
    """Identifica quando a mensagem de Falha do Horus significa apenas '0 registros no período'."""
    if not msgs:
        return False
    empty_keywords = (
        "não foi encontrado",
        "nao foi encontrado",
        "nenhum registro",
        "nenhum item",
        "sem moviment",
        "sem registro",
        "não existem",
        "nao existem",
        "registro não encontrado",
        "registro nao encontrado",
    )
    for m in msgs:
        low = m.lower()
        if not any(k in low for k in empty_keywords):
            return False
    return True


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
    _ensure_horus_situacao_column(db)
    local_count = db.query(func.count(Product.id)).filter(Product.company_id == cid).scalar() or 0
    fc_fe_count = (
        db.query(func.count(Product.id))
        .filter(Product.company_id == cid, Product.horus_situacao_item.in_(["FC", "FE"]))
        .scalar()
        or 0
    )
    zero_balance_sellable_count = (
        db.query(func.count(Product.id))
        .filter(
            Product.company_id == cid,
            Product.stock_quantity <= 0,
            or_(Product.horus_situacao_item.is_(None), ~Product.horus_situacao_item.in_(["FC", "FE"])),
        )
        .scalar()
        or 0
    )
    return {
        "company_id": cid,
        "horus_enabled": bool(getattr(settings, "horus_enabled", False)) if settings else False,
        "horus_url": getattr(settings, "horus_url", None) if settings else None,
        "horus_port": getattr(settings, "horus_port", None) if settings else None,
        "horus_company": getattr(settings, "horus_company", None) if settings else None,
        "horus_branch": getattr(settings, "horus_branch", None) if settings else None,
        "horus_stock_local": getattr(settings, "horus_stock_local", None) if settings else None,
        "horus_legacy_pagination": bool(getattr(settings, "horus_legacy_pagination", False)) if settings else False,
        "b2c_active": bool(
            (getattr(company, "module_b2c_storefront", False) if company else False)
            or (getattr(settings, "b2c_storefront_open", False) if settings else False)
        ),
        "local_products_count": local_count,
        "fc_fe_products_count": fc_fe_count,
        "zero_balance_sellable_count": zero_balance_sellable_count,
        "cod_tpo_caract": str(raw_sync.get("cod_tpo_caract") or ""),
        "cod_caract": str(raw_sync.get("cod_caract") or ""),
        "characteristic_type_name": str(raw_sync.get("characteristic_type_name") or ""),
        "characteristic_value": str(raw_sync.get("characteristic_value") or ""),
        "auto_collect_bookinfo_covers": bool(raw_sync.get("auto_collect_bookinfo_covers", False)),
        "allow_zero_balance_sale": _is_b2c_zero_balance_sale_enabled(settings),
        "last_sync_at": raw_sync.get("last_sync_at"),
        "last_sync_data_ini": raw_sync.get("last_sync_data_ini"),
        "last_sync_data_fim": raw_sync.get("last_sync_data_fim"),
        "last_sync_mode": raw_sync.get("last_sync_mode"),
        "last_synced_count": int(raw_sync.get("last_synced_count") or 0),
        "last_created_count": int(raw_sync.get("last_created_count") or 0),
        "last_updated_count": int(raw_sync.get("last_updated_count") or 0),
        "last_stock_updated_count": int(raw_sync.get("last_stock_updated_count") or 0),
        "last_horus_api_summary": raw_sync.get("last_horus_api_summary"),
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
    next_allow_zero = (
        bool(data.allow_zero_balance_sale)
        if data.allow_zero_balance_sale is not None
        else bool(prev_sync.get("allow_zero_balance_sale", False))
    )
    updated_sync = {
        **prev_sync,
        "cod_tpo_caract": str(data.cod_tpo_caract if data.cod_tpo_caract is not None else prev_sync.get("cod_tpo_caract") or "").strip(),
        "cod_caract": str(data.cod_caract if data.cod_caract is not None else prev_sync.get("cod_caract") or "").strip(),
        "auto_collect_bookinfo_covers": bool(data.auto_collect_bookinfo_covers),
        "allow_zero_balance_sale": next_allow_zero,
    }
    if data.custom_data_ini is not None:
        if str(data.custom_data_ini).strip() == "":
            updated_sync["last_sync_at"] = None
            updated_sync["last_sync_data_ini"] = None
        else:
            updated_sync["last_sync_at"] = str(data.custom_data_ini).strip()
    raw_cfg["horus_sync_config"] = updated_sync
    settings.b2c_showcases_config = raw_cfg
    flag_modified(settings, "b2c_showcases_config")
    _recompute_company_b2c_product_availability(db, cid, next_allow_zero)
    db.commit()
    _b2c_cache_clear(cid)
    return {
        "message": "Configuração de sincronização do Horus salva com sucesso!",
        **get_b2c_horus_sync_config(company_id=cid, db=db, current_user=current_user),
    }


@router.get("/products/horus-characteristics")
async def list_horus_characteristics(
    cod_tpo_caract: Optional[str] = Query(None, description="Código do Tipo de Característica (COD_TPO_CARACT)"),
    cod_caract: Optional[str] = Query(None, description="Código da Característica (COD_CARACT)"),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Testa e inspeciona diretamente na API do Horus ERP (`Busca_Caracteristicas` e `Busca_Acervo`)
    os parâmetros `COD_TPO_CARACT` e `COD_CARACT`, respeitando a configuração de OFFSET/LIMIT
    (`horus_legacy_pagination`) e `SD_*` do seller.
    Retorna exatamente o que o Horus responde na API para diagnóstico imediato.
    """
    cid = _resolve_seller_company_id(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    if not settings or not settings.horus_enabled:
        return {
            "ok": False,
            "items": [],
            "warning": "Integração Horus ERP não está habilitada nas configurações deste seller.",
            "horus_raw_response": None,
        }

    from app.integrators.horus_products import HorusProducts
    client = HorusProducts(db, cid)
    legacy_pag = bool(getattr(settings, "horus_legacy_pagination", False))

    tpo_str = str(cod_tpo_caract or "").strip()
    car_str = str(cod_caract or "").strip()

    params_caract: Dict[str, Any] = {}
    if tpo_str:
        params_caract["COD_TPO_CARACT"] = int(tpo_str) if tpo_str.isdigit() else tpo_str
    if car_str:
        params_caract["COD_CARACT"] = int(car_str) if car_str.isdigit() else car_str
    if not legacy_pag:
        params_caract["OFFSET"] = 0
        params_caract["LIMIT"] = 10

    params_acervo: Dict[str, Any] = {}
    if tpo_str:
        params_acervo["COD_TPO_CARACT"] = int(tpo_str) if tpo_str.isdigit() else tpo_str
    if car_str:
        params_acervo["COD_CARACT"] = int(car_str) if car_str.isdigit() else car_str
    if settings.horus_company:
        params_acervo["SD_COD_EMPRESA"] = settings.horus_company
    if settings.horus_branch:
        params_acervo["SD_COD_FILIAL"] = settings.horus_branch
    if getattr(settings, "horus_stock_local", None):
        params_acervo["SD_LOCAL_ESTOQUE"] = settings.horus_stock_local
    if not legacy_pag:
        params_acervo["OFFSET"] = 0
        params_acervo["LIMIT"] = 5

    try:
        resp_caract = await client.get("Busca_Caracteristicas", params=params_caract)
        resp_acervo = await client.get("Busca_Acervo", params=params_acervo)
        await client.close()

        caract_failures = _extract_horus_failures(resp_caract)
        acervo_failures = _extract_horus_failures(resp_acervo)

        raw_list = resp_caract if isinstance(resp_caract, list) else []
        detected_type_name = ""
        detected_char_value = ""
        items = []
        for row in raw_list:
            if not isinstance(row, dict) or "Falha" in row or "FALHA" in row:
                continue
            tpo_c = str(row.get("COD_TPO_CARACT") or "").strip()
            car_c = str(row.get("COD_CARACT") or "").strip()
            tpo_d = str(row.get("DESC_TPO_CARACT") or row.get("NOM_TPO_CARACT") or "").strip()
            car_d = str(row.get("DESC_CARACTERISTICA") or row.get("DESC_CARACT") or row.get("NOM_CARACT") or "").strip()
            if not detected_type_name and tpo_d:
                detected_type_name = tpo_d
            if not detected_char_value and car_d:
                detected_char_value = car_d
            items.append({
                "cod_item": row.get("COD_ITEM"),
                "nom_item": row.get("NOM_ITEM"),
                "cod_tpo_caract": tpo_c,
                "cod_caract": car_c,
                "characteristic_type_name": tpo_d,
                "characteristic_value": car_d,
                "dat_ult_atl": row.get("DAT_ULT_ATL"),
            })

        acervo_samples = []
        if isinstance(resp_acervo, list):
            for a_row in resp_acervo[:5]:
                if isinstance(a_row, dict) and not ("Falha" in a_row or "FALHA" in a_row):
                    acervo_samples.append({
                        "COD_ITEM": a_row.get("COD_ITEM"),
                        "NOM_ITEM": a_row.get("NOM_ITEM"),
                        "COD_BARRA_ITEM": a_row.get("COD_BARRA_ITEM") or a_row.get("BARRAS_ISBN"),
                        "SITUACAO_ITEM": a_row.get("SITUACAO_ITEM") or a_row.get("STA_ITEM") or a_row.get("COD_SITUACAO"),
                        "VLR_CAPA": a_row.get("VLR_CAPA"),
                        "SALDO_DISPONIVEL": a_row.get("SALDO_DISPONIVEL"),
                        "DAT_ULT_ATL": a_row.get("DAT_ULT_ATL"),
                    })

        all_warnings = caract_failures + [f for f in acervo_failures if f not in caract_failures]
        return {
            "ok": len(all_warnings) == 0,
            "pagination_mode": "SEM OFFSET/LIMIT (Modo Legado)" if legacy_pag else "COM OFFSET/LIMIT (Padrão Horus)",
            "params_sent": {
                "Busca_Caracteristicas": params_caract,
                "Busca_Acervo": params_acervo,
            },
            "detected_type_name": detected_type_name,
            "detected_char_value": detected_char_value,
            "horus_messages": all_warnings,
            "warning": " | ".join(all_warnings) if all_warnings else None,
            "items": items[:10],
            "acervo_sample": acervo_samples,
            "horus_raw_response": {
                "Busca_Caracteristicas": resp_caract[:5] if isinstance(resp_caract, list) else resp_caract,
                "Busca_Acervo": acervo_samples if acervo_samples else resp_acervo,
            },
        }
    except Exception as e:
        try:
            await client.close()
        except Exception:
            pass
        return {
            "ok": False,
            "items": [],
            "horus_messages": [str(e)],
            "warning": f"Erro ao consultar API do Horus: {str(e)}",
            "params_sent": {
                "Busca_Caracteristicas": params_caract,
                "Busca_Acervo": params_acervo,
            },
        }


@router.post("/products/sync-horus")
async def sync_horus_products_to_cronuz(
    data: B2CHorusSyncRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sincroniza produtos e estoques do Horus ERP para a tabela `prd_product` do Cronuz:
    1. Considera restrições de acervo por característica (`COD_TPO_CARACT` e `COD_CARACT`) quando configuradas.
    2. Respeita rigorosamente a configuração de paginação `OFFSET`/`LIMIT` (`horus_legacy_pagination`) e `SD_*` do seller.
    3. Utiliza a Data de Execução com Sucesso (`last_sync_at` -> `DATA_INI` até `DATA_FIM`):
       - Na 1ª execução (ou quando `full_sync=True`): realiza a carga completa dos produtos no `Busca_Acervo`.
       - Nas execuções seguintes (incremental):
         a) Consulta `Busca_Caracteristicas` (`COD_TPO_CARACT`, `COD_CARACT`, `DATA_INI`, `DATA_FIM`) para identificar produtos que receberam ou sofreram alteração na característica.
         b) Consulta `Busca_Acervo` (`COD_TPO_CARACT`, `COD_CARACT`, `SD_*`, `DATA_INI`, `DATA_FIM`) para trazer os produtos que sofreram alteração cadastral.
         c) Consulta `Estoque` (`COD_EMPRESA`, `COD_FILIAL`, `COD_LOCAL_ESTOQUE`, `COD_TPO_CARACT`, `COD_CARACT`, `DATA_INI`, `DATA_FIM`) para atualizar o saldo disponível dos produtos que tiveram movimentação de estoque.
         d) Coleta o cadastro em `Busca_Acervo` de quaisquer `COD_ITEM` apontados em `Busca_Caracteristicas` ou `Estoque` que ainda não estavam na base local.
    4. Retorna exatamente a mensagem da API do Horus caso o Horus aponte alguma falha de parâmetro/configuração, e grava `last_sync_at` apenas quando a execução tem sucesso.
    """
    from datetime import timedelta
    from sqlalchemy.orm.attributes import flag_modified
    from app.integrators.horus_products import HorusProducts
    from app.core.utils import parse_horus_price
    from app.models.catalog_support import Category, Brand, Characteristic, ProductCharacteristic
    from app.api.upload import STATIC_DIR, collect_bookinfo_cover_for_company

    cid = _resolve_seller_company_id(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    if not settings or not settings.horus_enabled:
        raise HTTPException(
            status_code=400,
            detail="A integração com o Horus ERP não está ativa nas configurações desta empresa.",
        )

    cod_tpo_str = str(data.cod_tpo_caract or "").strip()
    cod_caract_str = str(data.cod_caract or "").strip()

    # No Horus ERP, se informar COD_TPO_CARACT é obrigatório informar COD_CARACT (e vice-versa)
    if (cod_tpo_str and not cod_caract_str) or (cod_caract_str and not cod_tpo_str):
        raise HTTPException(
            status_code=400,
            detail=(
                "Parâmetros do Horus incompletos: sempre que COD_TPO_CARACT for informado, "
                "também é obrigatório preencher COD_CARACT (e vice-versa)."
            ),
        )

    cod_tpo_int = int(cod_tpo_str) if cod_tpo_str.isdigit() else None
    cod_caract_int = int(cod_caract_str) if cod_caract_str.isdigit() else None
    has_caract_filter = cod_tpo_int is not None and cod_caract_int is not None

    raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
    prev_sync = raw_cfg.get("horus_sync_config") if isinstance(raw_cfg.get("horus_sync_config"), dict) else {}
    raw_freight = raw_cfg.get("freight_config") if isinstance(raw_cfg.get("freight_config"), dict) else {}
    default_weight = float(raw_freight.get("default_book_weight_kg", 0.35) or 0.35)

    # Verificar se os filtros mudaram em relação à última sincronia (se mudou a característica, faz carga completa)
    prev_tpo = str(prev_sync.get("cod_tpo_caract") or "").strip()
    prev_car = str(prev_sync.get("cod_caract") or "").strip()
    filter_changed = (prev_tpo != cod_tpo_str) or (prev_car != cod_caract_str)

    local_existing_count = db.query(func.count(Product.id)).filter(Product.company_id == cid).scalar() or 0
    prev_last_sync_iso = prev_sync.get("last_sync_at") if not filter_changed else None

    # Fuso horário de Brasília (UTC-3) usado pelo banco SQL Server do Horus
    br_tz = timezone(timedelta(hours=-3))
    run_start_utc = datetime.now(timezone.utc)
    run_start_br = run_start_utc.astimezone(br_tz)

    is_incremental = bool(
        prev_last_sync_iso
        and not data.full_sync
        and local_existing_count > 0
    )

    data_ini_datetime_str: Optional[str] = None
    data_fim_datetime_str: Optional[str] = None
    data_ini_date_str: Optional[str] = None
    data_fim_date_str: Optional[str] = None

    if is_incremental:
        try:
            parsed_last = datetime.fromisoformat(str(prev_last_sync_iso).replace("Z", "+00:00"))
            if parsed_last.tzinfo is None:
                parsed_last = parsed_last.replace(tzinfo=timezone.utc)
            # Margem de segurança de 10 minutos para evitar perda por diferença de relógio com o servidor Horus
            safe_ini_br = parsed_last.astimezone(br_tz) - timedelta(minutes=10)
            safe_fim_br = run_start_br + timedelta(hours=1)
            data_ini_datetime_str = safe_ini_br.strftime("%d/%m/%Y %H:%M:%S")
            data_fim_datetime_str = safe_fim_br.strftime("%d/%m/%Y %H:%M:%S")
            data_ini_date_str = safe_ini_br.strftime("%d/%m/%Y")
            data_fim_date_str = safe_fim_br.strftime("%d/%m/%Y")
        except Exception:
            is_incremental = False

    legacy_pag = bool(getattr(settings, "horus_legacy_pagination", False))
    page_size = 500
    max_items = min(max(1, int(data.max_items or 10000)), 25000)

    horus_client = HorusProducts(db, cid)

    detected_type_name = str(prev_sync.get("characteristic_type_name") or "").strip()
    detected_char_val = str(prev_sync.get("characteristic_value") or "").strip()

    changed_caract_cod_items: set[int] = set()
    acervo_items_by_cod: Dict[int, Dict[str, Any]] = {}
    acervo_items_no_cod: List[Dict[str, Any]] = []
    estoque_changes_by_cod: Dict[int, int] = {}

    api_diagnostics: Dict[str, Any] = {
        "mode": "INCREMENTAL" if is_incremental else "FULL_LOAD",
        "pagination": "LEGACY_NO_OFFSET_LIMIT" if legacy_pag else f"OFFSET_LIMIT (page_size={page_size})",
        "cod_tpo_caract": cod_tpo_int,
        "cod_caract": cod_caract_int,
        "sd_empresa": settings.horus_company,
        "sd_filial": settings.horus_branch,
        "sd_local_estoque": getattr(settings, "horus_stock_local", None),
        "data_ini": data_ini_datetime_str,
        "data_fim": data_fim_datetime_str,
        "steps": {},
    }

    try:
        # ──────────────────────────────────────────────────────────────────────
        # PASSO 1: Busca_Caracteristicas
        # - Valida se COD_TPO_CARACT e COD_CARACT existem no Horus e descobre os nomes oficiais
        # - No modo INCREMENTAL, coleta todos os COD_ITEM cuja característica sofreu alteração no período
        # ──────────────────────────────────────────────────────────────────────
        if has_caract_filter:
            offset_c = 0
            caract_fetched = 0
            while True:
                p_car: Dict[str, Any] = {
                    "COD_TPO_CARACT": cod_tpo_int,
                    "COD_CARACT": cod_caract_int,
                }
                if is_incremental and data_ini_date_str and data_fim_date_str:
                    p_car["DATA_INI"] = data_ini_date_str
                    p_car["DATA_FIM"] = data_fim_date_str
                if not legacy_pag:
                    p_car["OFFSET"] = offset_c
                    p_car["LIMIT"] = page_size if is_incremental else 20

                resp_c = await horus_client.get("Busca_Caracteristicas", params=p_car)
                c_failures = _extract_horus_failures(resp_c)
                if c_failures:
                    if _is_horus_empty_result_message(c_failures):
                        api_diagnostics["steps"]["Busca_Caracteristicas"] = {
                            "status": "empty",
                            "horus_message": " | ".join(c_failures),
                            "items_count": caract_fetched,
                        }
                        break
                    raise HTTPException(
                        status_code=400,
                        detail=f"Retorno da API Horus em Busca_Caracteristicas: {' | '.join(c_failures)}",
                    )

                c_list = resp_c if isinstance(resp_c, list) else []
                valid_c = [r for r in c_list if isinstance(r, dict) and r.get("COD_ITEM")]
                for r in valid_c:
                    if not detected_type_name:
                        detected_type_name = str(r.get("DESC_TPO_CARACT") or r.get("NOM_TPO_CARACT") or "").strip()
                    if not detected_char_val:
                        detected_char_val = str(
                            r.get("DESC_CARACTERISTICA") or r.get("DESC_CARACT") or r.get("NOM_CARACT") or ""
                        ).strip()
                    if is_incremental:
                        raw_ci = r.get("COD_ITEM")
                        if str(raw_ci or "").strip().isdigit():
                            changed_caract_cod_items.add(int(raw_ci))
                caract_fetched += len(valid_c)

                # Na carga completa precisamos apenas de 1 chamada rápida para validar e obter a descrição;
                # o Busca_Acervo já traz todos os produtos filtrados por COD_TPO_CARACT + COD_CARACT.
                if not is_incremental or legacy_pag or len(valid_c) < page_size:
                    break
                offset_c += page_size

            api_diagnostics["steps"]["Busca_Caracteristicas"] = {
                "status": "ok",
                "detected_type_name": detected_type_name,
                "detected_char_value": detected_char_val,
                "changed_items_count": len(changed_caract_cod_items) if is_incremental else caract_fetched,
            }

        # ──────────────────────────────────────────────────────────────────────
        # PASSO 2: Busca_Acervo (Cadastro + SALDO_DISPONIVEL via SD_*)
        # - Carga Completa: traz todos os produtos (filtrados por COD_TPO_CARACT e COD_CARACT se informados)
        # - Incremental: traz os produtos cujo cadastro sofreu alteração entre DATA_INI e DATA_FIM
        # ──────────────────────────────────────────────────────────────────────
        offset_a = 0
        while (len(acervo_items_by_cod) + len(acervo_items_no_cod)) < max_items:
            cur_limit = min(page_size, max_items - (len(acervo_items_by_cod) + len(acervo_items_no_cod)))
            p_ac: Dict[str, Any] = {}
            if has_caract_filter:
                p_ac["COD_TPO_CARACT"] = cod_tpo_int
                p_ac["COD_CARACT"] = cod_caract_int
            if settings.horus_company:
                p_ac["SD_COD_EMPRESA"] = settings.horus_company
            if settings.horus_branch:
                p_ac["SD_COD_FILIAL"] = settings.horus_branch
            if getattr(settings, "horus_stock_local", None):
                p_ac["SD_LOCAL_ESTOQUE"] = settings.horus_stock_local
            if is_incremental and data_ini_datetime_str and data_fim_datetime_str:
                p_ac["DATA_INI"] = data_ini_datetime_str
                p_ac["DATA_FIM"] = data_fim_datetime_str
            if not legacy_pag:
                p_ac["OFFSET"] = offset_a
                p_ac["LIMIT"] = cur_limit

            resp_a = await horus_client.get("Busca_Acervo", params=p_ac)
            a_failures = _extract_horus_failures(resp_a)
            if a_failures:
                if _is_horus_empty_result_message(a_failures):
                    api_diagnostics["steps"]["Busca_Acervo"] = {
                        "status": "empty",
                        "horus_message": " | ".join(a_failures),
                        "items_count": len(acervo_items_by_cod) + len(acervo_items_no_cod),
                    }
                    break
                raise HTTPException(
                    status_code=400,
                    detail=f"Retorno da API Horus em Busca_Acervo: {' | '.join(a_failures)}",
                )

            a_list = []
            if isinstance(resp_a, list):
                a_list = resp_a
            elif isinstance(resp_a, dict):
                a_list = resp_a.get("item", resp_a.get("itens", resp_a.get("Acervo", [])))
                if isinstance(a_list, dict):
                    a_list = [a_list]

            valid_a = [
                r for r in a_list
                if isinstance(r, dict) and not ("Falha" in r or "FALHA" in r) and (r.get("COD_ITEM") or r.get("NOM_ITEM"))
            ]
            if not valid_a:
                break

            for r in valid_a:
                raw_ci = r.get("COD_ITEM")
                if str(raw_ci or "").strip().isdigit():
                    acervo_items_by_cod[int(raw_ci)] = r
                else:
                    acervo_items_no_cod.append(r)

            if legacy_pag or len(valid_a) < cur_limit:
                break
            offset_a += cur_limit

        api_diagnostics["steps"]["Busca_Acervo"] = {
            "status": "ok",
            "items_count": len(acervo_items_by_cod) + len(acervo_items_no_cod),
        }

        # ──────────────────────────────────────────────────────────────────────
        # PASSO 3 (Incremental): Estoque
        # - Consulta quais produtos com COD_TPO_CARACT e COD_CARACT sofreram alteração de saldo
        #   no período (DATA_INI .. DATA_FIM)
        # ──────────────────────────────────────────────────────────────────────
        if is_incremental:
            offset_e = 0
            while True:
                p_est: Dict[str, Any] = {}
                if settings.horus_company:
                    p_est["COD_EMPRESA"] = settings.horus_company
                if settings.horus_branch:
                    p_est["COD_FILIAL"] = settings.horus_branch
                if getattr(settings, "horus_stock_local", None):
                    p_est["COD_LOCAL_ESTOQUE"] = settings.horus_stock_local
                if has_caract_filter:
                    p_est["COD_TPO_CARACT"] = cod_tpo_int
                    p_est["COD_CARACT"] = cod_caract_int
                if data_ini_datetime_str and data_fim_datetime_str:
                    p_est["DATA_INI"] = data_ini_datetime_str
                    p_est["DATA_FIM"] = data_fim_datetime_str
                if not legacy_pag:
                    p_est["OFFSET"] = offset_e
                    p_est["LIMIT"] = page_size

                resp_e = await horus_client.get("Estoque", params=p_est)
                e_failures = _extract_horus_failures(resp_e)
                if e_failures:
                    if _is_horus_empty_result_message(e_failures):
                        api_diagnostics["steps"]["Estoque"] = {
                            "status": "empty",
                            "horus_message": " | ".join(e_failures),
                            "items_count": len(estoque_changes_by_cod),
                        }
                        break
                    # Se o endpoint Estoque retornar aviso não fatal, registra no diagnóstico e segue
                    api_diagnostics["steps"]["Estoque"] = {
                        "status": "warning",
                        "horus_message": " | ".join(e_failures),
                    }
                    break

                e_list = resp_e if isinstance(resp_e, list) else []
                valid_e = [
                    r for r in e_list
                    if isinstance(r, dict) and not ("Falha" in r or "FALHA" in r) and r.get("COD_ITEM")
                ]
                if not valid_e:
                    break

                for r in valid_e:
                    raw_ci = r.get("COD_ITEM")
                    if str(raw_ci or "").strip().isdigit():
                        ci_int = int(raw_ci)
                        try:
                            saldo_val = max(
                                0,
                                int(float(str(r.get("SALDO_DISPONIVEL", r.get("SALDO", 0)) or 0).replace(",", "."))),
                            )
                        except Exception:
                            saldo_val = 0
                        estoque_changes_by_cod[ci_int] = saldo_val

                if legacy_pag or len(valid_e) < page_size:
                    break
                offset_e += page_size

            if "Estoque" not in api_diagnostics["steps"]:
                api_diagnostics["steps"]["Estoque"] = {
                    "status": "ok",
                    "items_count": len(estoque_changes_by_cod),
                }

        # ──────────────────────────────────────────────────────────────────────
        # PASSO 4 (Incremental): Buscar no Busca_Acervo qualquer produto que:
        #   a) Sofreu alteração na característica (Busca_Caracteristicas) mas não veio no Busca_Acervo incremental
        #   b) Sofreu alteração de estoque (Estoque) mas ainda não existe na tabela local prd_product
        # ──────────────────────────────────────────────────────────────────────
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

        missing_cod_items_to_fetch: set[int] = set()
        for ci in changed_caract_cod_items:
            if ci not in acervo_items_by_cod:
                missing_cod_items_to_fetch.add(ci)
        for ci in estoque_changes_by_cod.keys():
            if ci not in acervo_items_by_cod and ci not in by_cod:
                missing_cod_items_to_fetch.add(ci)

        for ci in sorted(missing_cod_items_to_fetch):
            p_single: Dict[str, Any] = {
                "COD_ITEM_INI": ci,
                "COD_ITEM_FIM": ci,
            }
            if has_caract_filter:
                p_single["COD_TPO_CARACT"] = cod_tpo_int
                p_single["COD_CARACT"] = cod_caract_int
            if settings.horus_company:
                p_single["SD_COD_EMPRESA"] = settings.horus_company
            if settings.horus_branch:
                p_single["SD_COD_FILIAL"] = settings.horus_branch
            if getattr(settings, "horus_stock_local", None):
                p_single["SD_LOCAL_ESTOQUE"] = settings.horus_stock_local
            if not legacy_pag:
                p_single["OFFSET"] = 0
                p_single["LIMIT"] = 5

            try:
                r_single = await horus_client.get("Busca_Acervo", params=p_single)
                if isinstance(r_single, list):
                    for item_s in r_single:
                        if isinstance(item_s, dict) and not ("Falha" in item_s or "FALHA" in item_s) and item_s.get("COD_ITEM"):
                            acervo_items_by_cod[int(item_s["COD_ITEM"])] = item_s
            except Exception:
                pass
    finally:
        try:
            await horus_client.close()
        except Exception:
            pass

    horus_items: List[Dict[str, Any]] = list(acervo_items_by_cod.values()) + acervo_items_no_cod

    if not is_incremental and not horus_items:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Nenhum produto retornado pelo Horus ERP para os parâmetros informados "
                f"(COD_TPO_CARACT={cod_tpo_str or 'vazio'}, COD_CARACT={cod_caract_str or 'vazio'}). "
                f"Diagnóstico da API Horus: {api_diagnostics}"
            ),
        )

    # Preparar característica no Cronuz (prd_characteristic) com o nome oficial retornado pelo Horus
    eff_char_type = detected_type_name or (f"Característica Horus Tipo {cod_tpo_str}" if cod_tpo_str else "Origem Catálogo")
    eff_char_val = detected_char_val or (f"Código {cod_caract_str}" if cod_caract_str else "Horus ERP")

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
    existing_pcs = {
        pc.product_id: pc
        for pc in db.query(ProductCharacteristic)
        .filter(ProductCharacteristic.characteristic_id == char_obj.id)
        .all()
    }

    created_count = 0
    updated_count = 0
    stock_only_updated_count = 0
    covers_collected = 0
    sync_item_warnings: List[str] = []
    company_cover_dir = STATIC_DIR / str(cid)
    _ensure_horus_situacao_column(db)
    allow_zero_sale = (
        bool(data.allow_zero_balance_sale)
        if data.allow_zero_balance_sale is not None
        else bool(prev_sync.get("allow_zero_balance_sale", False))
    )

    for h_item in horus_items:
        try:
            with db.begin_nested():
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

                situacao_item = str(
                    h_item.get("SITUACAO_ITEM")
                    or h_item.get("STA_ITEM")
                    or h_item.get("COD_SITUACAO")
                    or ""
                ).strip().upper()[:20]

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
                    or h_item.get("NOM_GRUPO_ITEM")
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

                if cod_item and cod_item in estoque_changes_by_cod:
                    stock_qty = estoque_changes_by_cod[cod_item]
                else:
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

                # Verificar capa local em disco ou URL de capa retornada pelo Horus (IMAGEM_ITEM2)
                clean_isbn_file = re.sub(r"[^a-zA-Z0-9_\-]", "", isbn)
                local_cover_url = None
                if clean_isbn_file:
                    if (company_cover_dir / f"{clean_isbn_file}.jpg").exists():
                        local_cover_url = f"/uploads/covers/{cid}/{clean_isbn_file}.jpg"
                    elif (company_cover_dir / f"{clean_isbn_file}.png").exists():
                        local_cover_url = f"/uploads/covers/{cid}/{clean_isbn_file}.png"
                if not local_cover_url:
                    for img_field in ("IMAGEM_ITEM2", "IMAGEM_ITEM3", "IMAGEM_ITEM"):
                        raw_img = str(h_item.get(img_field) or "").strip()
                        if raw_img.startswith("http://") or raw_img.startswith("https://"):
                            local_cover_url = raw_img
                            break

                eff_situacao = situacao_item or (getattr(prod, "horus_situacao_item", None) if prod else None)
                allow_p, status_lbl = _can_sell_b2c_product(stock_qty, eff_situacao, allow_zero_sale)

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
                        is_pre_sale=(eff_situacao == "IP"),
                        is_out_of_print=(eff_situacao in ("FC", "FE", "ES")),
                        allow_purchase=allow_p,
                        stock_status_label=status_lbl,
                        cover_url=local_cover_url,
                        horus_cod_item=cod_item if cod_item > 0 else None,
                        horus_situacao_item=eff_situacao,
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
                    if eff_situacao:
                        prod.horus_situacao_item = eff_situacao
                        prod.is_pre_sale = (eff_situacao == "IP")
                        prod.is_out_of_print = (eff_situacao in ("FC", "FE", "ES"))
                    prod.allow_purchase = allow_p
                    prod.stock_status_label = status_lbl
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

                # Vincular característica (sem query N+1)
                item_char_val = str(
                    h_item.get("DESC_CARACTERISTICA")
                    or h_item.get("DESC_CARACT")
                    or h_item.get("NOM_CARACT")
                    or eff_char_val
                ).strip()[:150]
                existing_pc = existing_pcs.get(prod.id)
                if not existing_pc:
                    new_pc = ProductCharacteristic(
                        product_id=prod.id,
                        characteristic_id=char_obj.id,
                        value=item_char_val,
                    )
                    db.add(new_pc)
                    existing_pcs[prod.id] = new_pc
                else:
                    existing_pc.value = item_char_val

                # Coleta opcional na Bookinfo quando solicitado (limitado a 25 por lote síncrono para alta performance)
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
        except Exception as item_exc:
            if len(sync_item_warnings) < 10:
                sync_item_warnings.append(f"Item COD_ITEM={h_item.get('COD_ITEM')}: {str(item_exc)[:150]}")

    # Aplicar alterações de estoque (Passo 3 - Estoque) para produtos já existentes que não precisaram passar pelo Busca_Acervo
    for ci_est, new_saldo in estoque_changes_by_cod.items():
        if ci_est in acervo_items_by_cod:
            continue
        prod_est = by_cod.get(ci_est)
        if prod_est:
            prod_est.stock_quantity = new_saldo
            est_allow, est_lbl = _can_sell_b2c_product(
                new_saldo,
                getattr(prod_est, "horus_situacao_item", None),
                allow_zero_sale,
            )
            prod_est.allow_purchase = est_allow
            prod_est.stock_status_label = est_lbl
            stock_only_updated_count += 1

    # Garantir que todos os produtos locais reflitam a regra de venda com saldo zero (exceto FC/FE)
    _recompute_company_b2c_product_availability(db, cid, allow_zero_sale)

    if sync_item_warnings:
        api_diagnostics["item_warnings"] = sync_item_warnings

    # Gravar a data/hora de execução que teve sucesso (run_start_utc)
    success_sync_iso = run_start_utc.isoformat()
    total_processed = created_count + updated_count + stock_only_updated_count

    raw_cfg["horus_sync_config"] = {
        **prev_sync,
        "cod_tpo_caract": cod_tpo_str,
        "cod_caract": cod_caract_str,
        "characteristic_type_name": eff_char_type,
        "characteristic_value": eff_char_val,
        "auto_collect_bookinfo_covers": bool(data.auto_collect_bookinfo_covers),
        "allow_zero_balance_sale": allow_zero_sale,
        "last_sync_at": success_sync_iso,
        "last_sync_data_ini": data_ini_datetime_str or "CARGA COMPLETA",
        "last_sync_data_fim": data_fim_datetime_str or run_start_br.strftime("%d/%m/%Y %H:%M:%S"),
        "last_sync_mode": "INCREMENTAL" if is_incremental else "FULL_LOAD",
        "last_synced_count": total_processed,
        "last_created_count": created_count,
        "last_updated_count": updated_count,
        "last_stock_updated_count": stock_only_updated_count,
        "last_horus_api_summary": api_diagnostics,
    }
    settings.b2c_showcases_config = raw_cfg
    flag_modified(settings, "b2c_showcases_config")
    db.commit()
    _b2c_cache_clear(cid)

    mode_label = (
        f"Sincronização Incremental ({data_ini_datetime_str} → {data_fim_datetime_str})"
        if is_incremental
        else "Carga Completa do Horus ERP"
    )
    return {
        "message": (
            f"{mode_label} concluída com sucesso! "
            f"{created_count} novo(s) produto(s), {updated_count} cadastro(s) atualizado(s) "
            f"e {stock_only_updated_count} saldo(s) de estoque atualizado(s)."
        ),
        "mode": "INCREMENTAL" if is_incremental else "FULL_LOAD",
        "created_count": created_count,
        "updated_count": updated_count,
        "stock_only_updated_count": stock_only_updated_count,
        "total_processed": total_processed,
        "covers_collected": covers_collected,
        "characteristic_type_name": eff_char_type,
        "characteristic_value": eff_char_val,
        "last_sync_at": success_sync_iso,
        "last_sync_data_ini": data_ini_datetime_str or "CARGA COMPLETA",
        "last_sync_data_fim": data_fim_datetime_str or run_start_br.strftime("%d/%m/%Y %H:%M:%S"),
        "horus_api_summary": api_diagnostics,
    }


import threading
_B2C_HORUS_STOCK_JOB_LOCK = threading.Lock()


class B2CHorusStockJobConfigRequest(BaseModel):
    enabled: bool = True
    interval_minutes: int = 5


async def execute_company_horus_stock_only_sync(
    db: Session,
    company_id: int,
    trigger: str = "AUTO_JOB",
) -> Dict[str, Any]:
    """
    Executa sincronização leve e exclusiva de ESTOQUE (`Estoque`) no Horus ERP para uma empresa,
    atualizando apenas `stock_quantity`, `allow_purchase` e `stock_status_label` dos produtos
    já cadastrados em `prd_product`.
    Grava telemetria completa em `b2c_showcases_config['horus_stock_job']` e invalida o cache RAM B2C
    somente quando houver mudança de saldo.
    """
    from datetime import timedelta
    t0 = time.monotonic()
    br_tz = timezone(timedelta(hours=-3))
    run_start_utc = datetime.now(timezone.utc)
    run_start_br = run_start_utc.astimezone(br_tz)

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings or not getattr(settings, "horus_enabled", False):
        return {
            "status": "SKIPPED",
            "message": "Integração Horus ERP inativa para esta empresa.",
            "checked_count": 0,
            "updated_count": 0,
            "duration_ms": 0,
        }

    raw_cfg = dict(settings.b2c_showcases_config or {})
    sync_cfg = dict(raw_cfg.get("horus_sync_config") or {})
    job_cfg = dict(raw_cfg.get("horus_stock_job") or {})

    # Determinar janela incremental (DATA_INI -> DATA_FIM) com margem de segurança de 10 minutos
    last_ref_iso = str(job_cfg.get("last_success_at") or sync_cfg.get("last_sync_at") or "").strip()
    dt_ini_br = run_start_br - timedelta(minutes=60)
    if last_ref_iso:
        try:
            parsed_dt = datetime.fromisoformat(last_ref_iso.replace("Z", "+00:00"))
            if parsed_dt.tzinfo is None:
                parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
            dt_ini_br = parsed_dt.astimezone(br_tz) - timedelta(minutes=10)
            # Evitar janelas gigantescas no job leve de 5 min (máximo 48h retroativas)
            min_allowed_br = run_start_br - timedelta(hours=48)
            if dt_ini_br < min_allowed_br:
                dt_ini_br = min_allowed_br
        except Exception:
            dt_ini_br = run_start_br - timedelta(minutes=60)

    dt_fim_br = run_start_br + timedelta(hours=1)
    data_ini_str = dt_ini_br.strftime("%d/%m/%Y %H:%M:%S")
    data_fim_str = dt_fim_br.strftime("%d/%m/%Y %H:%M:%S")

    cod_tpo_str = str(sync_cfg.get("cod_tpo_caract") or "").strip()
    cod_caract_str = str(sync_cfg.get("cod_caract") or "").strip()
    use_pagination = not getattr(settings, "horus_legacy_pagination", False)

    estoque_changes_by_cod: Dict[int, int] = {}
    status_str = "SUCCESS"
    error_msg: Optional[str] = None
    horus_client = None

    try:
        horus_client = HorusClients(db, company_id)
        offset = 0
        limit = 500
        max_pages = 15 if use_pagination else 1

        for _ in range(max_pages):
            p_est: Dict[str, Any] = {
                "COD_EMPRESA": settings.horus_company or 1,
                "COD_FILIAL": settings.horus_branch or 1,
                "DATA_INI": data_ini_str,
                "DATA_FIM": data_fim_str,
            }
            if getattr(settings, "horus_stock_local", None):
                p_est["COD_LOCAL_ESTOQUE"] = settings.horus_stock_local
            if cod_tpo_str and cod_caract_str:
                p_est["COD_TPO_CARACT"] = cod_tpo_str
                p_est["COD_CARACT"] = cod_caract_str
            if use_pagination:
                p_est["OFFSET"] = offset
                p_est["LIMIT"] = limit

            res_est = await horus_client.get("Estoque", params=p_est)
            batch_est: List[Dict[str, Any]] = []
            if isinstance(res_est, list):
                batch_est = [
                    r for r in res_est
                    if isinstance(r, dict) and not r.get("Falha") and r.get("COD_ITEM")
                ]
            elif isinstance(res_est, dict) and not res_est.get("Falha") and res_est.get("COD_ITEM"):
                batch_est = [res_est]

            if not batch_est:
                break

            for row in batch_est:
                try:
                    ci = int(str(row.get("COD_ITEM")).strip())
                    raw_s = row.get("SALDO_DISPONIVEL")
                    if raw_s is None:
                        raw_s = row.get("SALDO") or 0
                    saldo_val = max(0, int(float(str(raw_s).replace(",", "."))))
                    estoque_changes_by_cod[ci] = saldo_val
                except Exception:
                    pass

            if not use_pagination or len(batch_est) < limit:
                break
            offset += limit

    except Exception as exc:
        status_str = "ERROR"
        error_msg = str(exc)[:300]
    finally:
        if horus_client:
            try:
                await horus_client.close()
            except Exception:
                pass

    checked_count = len(estoque_changes_by_cod)
    updated_count = 0

    if status_str == "SUCCESS" and estoque_changes_by_cod:
        allow_zero_sale_job = _is_b2c_zero_balance_sale_enabled(settings)
        target_cods = list(estoque_changes_by_cod.keys())
        target_skus = [str(c) for c in target_cods]
        matching_products = (
            db.query(Product)
            .filter(
                Product.company_id == company_id,
                or_(
                    Product.horus_cod_item.in_(target_cods),
                    Product.sku.in_(target_skus),
                ),
            )
            .all()
        )
        for prod in matching_products:
            ci_match = None
            if prod.horus_cod_item and int(prod.horus_cod_item) in estoque_changes_by_cod:
                ci_match = int(prod.horus_cod_item)
            elif prod.sku and prod.sku.strip().isdigit() and int(prod.sku.strip()) in estoque_changes_by_cod:
                ci_match = int(prod.sku.strip())
            if ci_match is None:
                continue

            new_saldo = estoque_changes_by_cod[ci_match]
            new_allow, new_label = _can_sell_b2c_product(
                new_saldo,
                getattr(prod, "horus_situacao_item", None),
                allow_zero_sale_job,
            )

            if (
                int(prod.stock_quantity or 0) != new_saldo
                or bool(prod.allow_purchase) != new_allow
                or (prod.stock_status_label or "") != new_label
            ):
                prod.stock_quantity = new_saldo
                prod.allow_purchase = new_allow
                prod.stock_status_label = new_label
                updated_count += 1

    duration_ms = int((time.monotonic() - t0) * 1000)
    run_iso = run_start_utc.isoformat()

    if status_str == "ERROR":
        summary_msg = f"Falha ao consultar Estoque no Horus: {error_msg}"
    elif updated_count > 0:
        summary_msg = f"Sucesso: {updated_count} produto(s) tiveram saldo atualizado (de {checked_count} movimentações no Horus)."
    elif checked_count > 0:
        summary_msg = f"Sucesso: {checked_count} item(ns) verificado(s) no Horus, todos já estavam com saldo atualizado."
    else:
        summary_msg = "Sucesso: Nenhuma movimentação de estoque no Horus na janela consultada."

    history_list = list(job_cfg.get("history") or [])
    history_entry = {
        "run_at": run_iso,
        "trigger": trigger,
        "status": status_str,
        "checked_count": checked_count,
        "updated_count": updated_count,
        "duration_ms": duration_ms,
        "window": f"{data_ini_str} → {data_fim_str}",
        "message": summary_msg,
    }
    history_list.insert(0, history_entry)
    history_list = history_list[:15]

    updated_job_cfg = {
        "enabled": bool(job_cfg.get("enabled", True)),
        "interval_minutes": max(5, int(job_cfg.get("interval_minutes") or 5)),
        "last_run_at": run_iso,
        "last_success_at": run_iso if status_str == "SUCCESS" else job_cfg.get("last_success_at"),
        "last_status": status_str,
        "last_trigger": trigger,
        "last_duration_ms": duration_ms,
        "last_checked_count": checked_count,
        "last_updated_count": updated_count,
        "last_window": f"{data_ini_str} → {data_fim_str}",
        "last_message": summary_msg,
        "history": history_list,
    }

    raw_cfg["horus_stock_job"] = updated_job_cfg
    settings.b2c_showcases_config = raw_cfg
    flag_modified(settings, "b2c_showcases_config")
    db.commit()

    if updated_count > 0:
        _b2c_cache_clear(company_id)

    return {
        **updated_job_cfg,
        "company_id": company_id,
    }


def run_b2c_horus_stock_sync_job():
    """
    Job agendado no APScheduler (a cada 5 minutos) com trava single-flight (`_B2C_HORUS_STOCK_JOB_LOCK`)
    para nunca sobrepor execuções nem gargalar o servidor.
    Sincroniza apenas empresas com Horus ativo, produtos locais cadastrados e intervalo atingido.
    """
    if not _B2C_HORUS_STOCK_JOB_LOCK.acquire(blocking=False):
        return

    from app.db.session import SessionLocal
    import asyncio
    from datetime import timedelta

    db = SessionLocal()
    try:
        active_settings = (
            db.query(CompanySettings)
            .filter(
                CompanySettings.horus_enabled == True,
                CompanySettings.company_id != 8,  # Regra de segurança WMF
            )
            .all()
        )
        if not active_settings:
            return

        now_utc = datetime.now(timezone.utc)

        for s in active_settings:
            cid = s.company_id
            raw_cfg = dict(s.b2c_showcases_config or {})
            job_cfg = dict(raw_cfg.get("horus_stock_job") or {})

            # Por padrão, job é habilitado automaticamente para empresas que possuem produtos no catálogo local
            is_enabled = bool(job_cfg.get("enabled", True))
            if not is_enabled:
                continue

            prod_count = db.query(func.count(Product.id)).filter(Product.company_id == cid).scalar() or 0
            if prod_count <= 0:
                continue

            interval_min = max(5, int(job_cfg.get("interval_minutes") or 5))
            last_run_iso = str(job_cfg.get("last_run_at") or "").strip()
            if last_run_iso:
                try:
                    last_dt = datetime.fromisoformat(last_run_iso.replace("Z", "+00:00"))
                    if last_dt.tzinfo is None:
                        last_dt = last_dt.replace(tzinfo=timezone.utc)
                    elapsed_sec = (now_utc - last_dt).total_seconds()
                    # Margem de 25 segundos para tolerar jitter natural do scheduler de 5 min
                    if elapsed_sec < (interval_min * 60 - 25):
                        continue
                except Exception:
                    pass

            loop = asyncio.new_event_loop()
            try:
                asyncio.set_event_loop(loop)
                loop.run_until_complete(
                    execute_company_horus_stock_only_sync(db=db, company_id=cid, trigger="AUTO_JOB")
                )
            except Exception:
                db.rollback()
            finally:
                loop.close()
    finally:
        db.close()
        _B2C_HORUS_STOCK_JOB_LOCK.release()


@router.get("/products/stock-job-status")
def get_b2c_horus_stock_job_status(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna o status, configurações, última execução e histórico das últimas 15 execuções
    do Job Automático de Sincronização de Estoque Horus (exibido em Configurações -> ERP & Catálogo).
    """
    cid = _resolve_seller_company_id(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    local_products_count = db.query(func.count(Product.id)).filter(Product.company_id == cid).scalar() or 0

    raw_cfg = dict((settings.b2c_showcases_config if settings else None) or {})
    sync_cfg = dict(raw_cfg.get("horus_sync_config") or {})
    job_cfg = dict(raw_cfg.get("horus_stock_job") or {})

    return {
        "company_id": cid,
        "horus_enabled": bool(getattr(settings, "horus_enabled", False)) if settings else False,
        "horus_company": getattr(settings, "horus_company", 1) if settings else 1,
        "horus_branch": getattr(settings, "horus_branch", 1) if settings else 1,
        "horus_stock_local": getattr(settings, "horus_stock_local", None) if settings else None,
        "horus_legacy_pagination": bool(getattr(settings, "horus_legacy_pagination", False)) if settings else False,
        "cod_tpo_caract": sync_cfg.get("cod_tpo_caract") or "",
        "cod_caract": sync_cfg.get("cod_caract") or "",
        "characteristic_type_name": sync_cfg.get("characteristic_type_name") or "",
        "characteristic_value": sync_cfg.get("characteristic_value") or "",
        "local_products_count": local_products_count,
        "enabled": bool(job_cfg.get("enabled", True)),
        "interval_minutes": max(5, int(job_cfg.get("interval_minutes") or 5)),
        "last_run_at": job_cfg.get("last_run_at"),
        "last_success_at": job_cfg.get("last_success_at"),
        "last_status": job_cfg.get("last_status") or "IDLE",
        "last_trigger": job_cfg.get("last_trigger"),
        "last_duration_ms": job_cfg.get("last_duration_ms") or 0,
        "last_checked_count": job_cfg.get("last_checked_count") or 0,
        "last_updated_count": job_cfg.get("last_updated_count") or 0,
        "last_window": job_cfg.get("last_window") or "",
        "last_message": job_cfg.get("last_message") or "Aguardando primeira execução do job.",
        "history": list(job_cfg.get("history") or []),
    }


@router.put("/products/stock-job-config")
def update_b2c_horus_stock_job_config(
    data: B2CHorusStockJobConfigRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Atualiza a configuração do Job Automático de Estoque Horus (ativar/pausar e intervalo em minutos).
    """
    cid = _resolve_seller_company_id(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    if not settings:
        settings = CompanySettings(company_id=cid)
        db.add(settings)
        db.flush()

    raw_cfg = dict(settings.b2c_showcases_config or {})
    job_cfg = dict(raw_cfg.get("horus_stock_job") or {})
    job_cfg["enabled"] = bool(data.enabled)
    job_cfg["interval_minutes"] = max(5, min(120, int(data.interval_minutes or 5)))
    raw_cfg["horus_stock_job"] = job_cfg
    settings.b2c_showcases_config = raw_cfg
    flag_modified(settings, "b2c_showcases_config")
    db.commit()

    return {
        "message": "Configuração do Job de Estoque atualizada com sucesso!",
        "enabled": job_cfg["enabled"],
        "interval_minutes": job_cfg["interval_minutes"],
    }


@router.post("/products/stock-job-run")
async def trigger_b2c_horus_stock_job_now(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Dispara manualmente uma execução imediata do Job de Estoque Horus para a empresa atual.
    """
    cid = _resolve_seller_company_id(current_user, company_id)
    result = await execute_company_horus_stock_only_sync(db=db, company_id=cid, trigger="MANUAL")
    return result



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
    if not slug or slug.isdigit():
        return f"loja-{company_id}"
    return slug


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
    _B2C_SLUG_CACHE.clear()
    removed = len(bucket)
    stats = _ensure_company_cache_stats(company_id)
    stats["last_cleared_at"] = datetime.now(timezone.utc).isoformat()
    return removed


def _apply_b2c_promotions_to_items(
    items: List[Dict[str, Any]],
    promotions: List[Dict[str, Any]],
    allow_zero_balance_sale: bool = False,
) -> List[Dict[str, Any]]:
    """
    Aplica regras de preço promocional B2C (De/Por) com validade por Categoria, Editora, Produtos (SKU/ISBN) ou Todo o Catálogo,
    e calcula `allow_purchase` e `stock_status_label` respeitando `allow_zero_balance_sale` e `horus_situacao_item` (FC/FE).
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
        item_qty = int(item.get("stock_quantity") or 0)
        item_sit = item.get("horus_situacao_item") or item.get("situacao_item")
        allow_p, status_lbl = _can_sell_b2c_product(
            item_qty,
            item_sit,
            allow_zero_balance_sale=allow_zero_balance_sale,
        )
        item["allow_purchase"] = allow_p
        item["stock_status_label"] = status_lbl

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

    raw_dom = re.sub(r"^https?://", "", (company.domain or "").strip().lower())
    raw_dom_no_www = re.sub(r"^www\.", "", raw_dom)
    dom_prefix = raw_dom_no_www.split("@")[0].split(".")[0] if raw_dom_no_www else ""
    default_slug = (
        dom_prefix
        if dom_prefix and dom_prefix not in ("www", "http", "https", "loja") and not dom_prefix.isdigit()
        else _slugify_store_name(company.name, company.id)
    )

    raw_branding = raw_cfg.get("branding") if isinstance(raw_cfg.get("branding"), dict) else {}
    saved_store_slug = str(raw_branding.get("store_slug") or "").strip().lower()
    if not saved_store_slug or saved_store_slug.isdigit():
        saved_store_slug = default_slug

    branding = {
        "store_slug": saved_store_slug,
        "theme_template": raw_branding.get("theme_template") or "editorial_modern",
        "primary_color": raw_branding.get("primary_color") or "#4f46e5",
        "secondary_color": raw_branding.get("secondary_color") or "#0f172a",
        "logo_url": raw_branding.get("logo_url") or company.logo or "",
        "hero_badge_text": (raw_branding.get("hero_badge_text") or "Destaques e Lançamentos").replace("&", "e"),
        "hero_title": raw_branding.get("hero_title") or f"Bem-vindo à {company.name}",
        "hero_subtitle": raw_branding.get("hero_subtitle") or "Explore nosso catálogo completo com entrega rápida e segura para todo o Brasil.",
        "hero_banner_url": raw_branding.get("hero_banner_url") or company.login_background_url or "",
        "show_voucher_simulator": False,
        "max_top_categories": int(raw_branding.get("max_top_categories") or 6),
        "more_categories_position": raw_branding.get("more_categories_position") if raw_branding.get("more_categories_position") in ("start", "end") else "end",
        "more_categories_label": raw_branding.get("more_categories_label") or "Outras",
    }

    banners = raw_cfg.get("banners") if isinstance(raw_cfg.get("banners"), list) else []
    promotions = raw_cfg.get("promotions") if isinstance(raw_cfg.get("promotions"), list) else []
    raw_showcases = raw_cfg.get("showcases") if isinstance(raw_cfg.get("showcases"), list) else []
    allow_zero_sale = _is_b2c_zero_balance_sale_enabled(settings)
    branding["allow_zero_balance_sale"] = allow_zero_sale

    # Map real-time stock_quantity and horus_situacao_item from local Product table so showcases reflect real stock & FC/FE rule
    local_stock_map: Dict[str, tuple[int, Optional[str]]] = {}
    try:
        _ensure_horus_situacao_column(db)
        local_prods = (
            db.query(Product.id, Product.sku, Product.ean_gtin, Product.stock_quantity, Product.horus_situacao_item)
            .filter(Product.company_id == company.id)
            .all()
        )
        for lp in local_prods:
            st_val = (max(0, int(lp.stock_quantity or 0)), lp.horus_situacao_item)
            if lp.id:
                local_stock_map[f"id:{lp.id}"] = st_val
            if lp.sku:
                local_stock_map[f"sku:{str(lp.sku).strip()}"] = st_val
            if lp.ean_gtin:
                local_stock_map[f"ean:{str(lp.ean_gtin).strip()}"] = st_val
    except Exception:
        pass

    showcases = []
    for idx_sc, sc in enumerate(raw_showcases):
        if isinstance(sc, dict):
            sc_copy = dict(sc)
            sc_copy["slug"] = sc_copy.get("slug") or _slugify_store_name(
                sc_copy.get("title") or f"vitrine-{idx_sc + 1}", idx_sc + 1
            )
            sc_copy["banner_url"] = sc_copy.get("banner_url") or ""
            sc_copy["description"] = sc_copy.get("description") or sc_copy.get("subtitle") or ""
            sc_items = sc_copy.get("items") if isinstance(sc_copy.get("items"), list) else []
            enriched_items = []
            for raw_it in sc_items:
                if not isinstance(raw_it, dict):
                    continue
                it_copy = dict(raw_it)
                pid = it_copy.get("id") or it_copy.get("product_id")
                sku_k = str(it_copy.get("sku") or "").strip()
                ean_k = str(it_copy.get("ean_gtin") or "").strip()
                real_info = None
                if pid and f"id:{pid}" in local_stock_map:
                    real_info = local_stock_map[f"id:{pid}"]
                elif sku_k and f"sku:{sku_k}" in local_stock_map:
                    real_info = local_stock_map[f"sku:{sku_k}"]
                elif ean_k and f"ean:{ean_k}" in local_stock_map:
                    real_info = local_stock_map[f"ean:{ean_k}"]
                if real_info is not None:
                    real_stock, real_sit = real_info
                    it_copy["stock_quantity"] = real_stock
                    it_copy["horus_situacao_item"] = real_sit
                    allow_p, status_lbl = _can_sell_b2c_product(real_stock, real_sit, allow_zero_sale)
                    it_copy["allow_purchase"] = allow_p
                    it_copy["stock_status_label"] = status_lbl
                enriched_items.append(it_copy)
            sc_copy["items"] = _apply_b2c_promotions_to_items(
                enriched_items, promotions, allow_zero_balance_sale=allow_zero_sale
            )
            showcases.append(sc_copy)

    raw_categories = raw_cfg.get("categories") if isinstance(raw_cfg.get("categories"), list) else []

    # Fallback: if no B2C categories configured yet, pull from Seller's NavigationMenuItem
    if not raw_categories:
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
                raw_categories.append({
                    "id": f"nav-{nav.id}",
                    "label": nav.label,
                    "code": nav.external_id,
                    "filter_type": "NOM_EDITORA" if item_type_str == "BRAND" else "COD_GENERO",
                    "active": True,
                })
        except Exception:
            pass

    categories = []
    for idx_cat, cat in enumerate(raw_categories):
        if isinstance(cat, dict):
            cat_copy = dict(cat)
            cat_copy["slug"] = cat_copy.get("slug") or _slugify_store_name(
                cat_copy.get("label") or cat_copy.get("code") or f"categoria-{idx_cat + 1}", idx_cat + 1
            )
            cat_copy["banner_url"] = cat_copy.get("banner_url") or ""
            cat_copy["headline"] = cat_copy.get("headline") or ""
            cat_copy["description"] = cat_copy.get("description") or ""
            categories.append(cat_copy)

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

    raw_seo = raw_cfg.get("seo_config") if isinstance(raw_cfg.get("seo_config"), dict) else {}
    seo_config = {
        "home_title": raw_seo.get("home_title") or f"{company.name} | Livraria e Loja Oficial",
        "home_description": raw_seo.get("home_description") or f"Compre livros na loja oficial {company.name}. Acervo completo com ISBN, lançamentos e entrega rápida para todo o Brasil.",
        "product_title_template": raw_seo.get("product_title_template") or "{nome} - ISBN {isbn} | {autor} | {loja}",
        "product_description_template": raw_seo.get("product_description_template") or "Compre o livro {nome} (ISBN {isbn}) de {autor}, editora {editora} na {loja}. Confira sinopse, preço e envio rápido para todo o Brasil.",
        "category_title_template": raw_seo.get("category_title_template") or "{categoria} - Livros em Oferta | {loja}",
        "category_description_template": raw_seo.get("category_description_template") or "Explore os melhores livros de {categoria} na {loja}. Obras selecionadas com pronta entrega.",
        "showcase_title_template": raw_seo.get("showcase_title_template") or "{vitrine} | Seleção Especial {loja}",
        "showcase_description_template": raw_seo.get("showcase_description_template") or "{subtitulo} - Confira a vitrine {vitrine} na {loja}.",
        "google_site_verification": raw_seo.get("google_site_verification") or "",
        "auto_json_ld": bool(raw_seo.get("auto_json_ld", True)),
    }

    return {
        "branding": branding,
        "banners": banners,
        "showcases": showcases,
        "categories": categories,
        "promotions": promotions,
        "footer_info": footer_info,
        "seo_config": seo_config,
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
    if data.seo_config is not None:
        current_cfg["seo_config"] = {**current_cfg.get("seo_config", {}), **data.seo_config}

    if data.b2c_custom_domain is not None:
        clean_dom = data.b2c_custom_domain.strip().lower()
        clean_dom = re.sub(r"^https?://", "", clean_dom).rstrip("/")
        company.b2c_custom_domain = clean_dom or None

    # Preserve all existing internal/payment/cache keys in b2c_showcases_config
    existing_raw = getattr(settings, "b2c_showcases_config", None)
    if isinstance(existing_raw, dict):
        appearance_keys = {"branding", "banners", "showcases", "categories", "promotions", "footer_info", "seo_config"}
        for k, v in existing_raw.items():
            if k not in appearance_keys:
                current_cfg[k] = v

    from sqlalchemy.orm.attributes import flag_modified
    settings.b2c_showcases_config = current_cfg
    flag_modified(settings, "b2c_showcases_config")
    db.commit()

    # Automatically clear B2C cache for this seller so changes appear immediately
    _b2c_cache_clear(cid)

    # Em produção, garante de forma assíncrona que o subdomínio e eventual domínio próprio B2C tenham SSL ativo
    try:
        import threading
        from app.core.ssl_authors import ensure_author_portal_ssl, ensure_custom_b2c_domain_ssl
        saved_slug = (current_cfg.get("branding") or {}).get("store_slug") or company.domain
        if saved_slug:
            threading.Thread(target=ensure_author_portal_ssl, args=(saved_slug,), daemon=True).start()
        if getattr(company, "b2c_custom_domain", None):
            threading.Thread(target=ensure_custom_b2c_domain_ssl, args=(company.b2c_custom_domain,), daemon=True).start()
    except Exception:
        pass

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
    seen_cats: set[str] = set()
    seen_brands: set[str] = set()

    # 1. Sempre carregar imediatamente as Categorias e Editoras já presentes no Catálogo Local do Seller (com contagem de produtos)
    try:
        from app.models.catalog_support import Category, Brand

        cat_counts = dict(
            db.query(Category.name, func.count(Product.id))
            .outerjoin(Product, and_(Product.category_id == Category.id, Product.company_id == cid, Product.status == "ACTIVE"))
            .filter(Category.company_id == cid)
            .group_by(Category.name)
            .all()
        )
        subj_counts = dict(
            db.query(Product.subject, func.count(Product.id))
            .filter(Product.company_id == cid, Product.status == "ACTIVE", Product.subject.isnot(None), Product.subject != "")
            .group_by(Product.subject)
            .all()
        )
        merged_local_cats: Dict[str, int] = {}
        for k_name, cnt in cat_counts.items():
            clean_n = str(k_name or "").strip()
            if clean_n and clean_n.lower() != "geral":
                merged_local_cats[clean_n] = max(merged_local_cats.get(clean_n, 0), int(cnt or 0))
        for s_name, cnt in subj_counts.items():
            clean_s = str(s_name or "").strip()
            if clean_s and clean_s.lower() != "geral":
                merged_local_cats[clean_s] = max(merged_local_cats.get(clean_s, 0), int(cnt or 0))

        for c_name, cnt in sorted(merged_local_cats.items(), key=lambda x: (-x[1], x[0].lower())):
            seen_cats.add(c_name.lower())
            categories.append({
                "code": c_name,
                "label": c_name.title() if c_name.isupper() else c_name,
                "products_count": cnt,
                "filter_type": "COD_GENERO",
                "source": "CATALOGO_LOCAL",
            })

        brand_counts = (
            db.query(Product.brand, func.count(Product.id))
            .filter(Product.company_id == cid, Product.status == "ACTIVE", Product.brand.isnot(None), Product.brand != "")
            .group_by(Product.brand)
            .order_by(func.count(Product.id).desc())
            .limit(120)
            .all()
        )
        for b_name, b_cnt in brand_counts:
            clean_b = str(b_name or "").strip()
            if clean_b and clean_b.lower() not in seen_brands:
                seen_brands.add(clean_b.lower())
                brands.append({
                    "code": clean_b,
                    "label": clean_b.title() if clean_b.isupper() else clean_b,
                    "products_count": int(b_cnt or 0),
                    "filter_type": "NOM_EDITORA",
                    "source": "CATALOGO_LOCAL",
                })
    except Exception as e_loc:
        logger.warning(f"[B2C Categories] Aviso ao ler categorias locais: {e_loc}")

    # 2. Complementar com árvore de gêneros do Horus ERP se houver categorias extras
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
                        clean_hn = str(cat_nome).strip()
                        if clean_hn.lower() not in seen_cats:
                            seen_cats.add(clean_hn.lower())
                            categories.append({
                                "code": clean_hn,
                                "raw_id": str(cat_id).strip(),
                                "label": clean_hn.title(),
                                "filter_type": "COD_GENERO",
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
                "horus_pedido_venda": o.horus_pedido_venda or meta.get("horus_pedido_venda") or "",
                "horus_cod_cli": meta.get("horus_cod_cli") or "",
                "horus_sent_at": meta.get("horus_sent_at"),
                "horus_status_erp": meta.get("horus_status_erp") or "",
                "horus_integration_log": meta.get("horus_integration_log") if isinstance(meta.get("horus_integration_log"), list) else [],
                "horus_warnings": meta.get("horus_warnings") if isinstance(meta.get("horus_warnings"), list) else [],
                "emails_sent": meta.get("emails_sent") if isinstance(meta.get("emails_sent"), list) else [],
                "last_email_sent_at": meta.get("last_email_sent_at"),
                "last_email_to": meta.get("last_email_to") or "",
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
async def update_b2c_order(
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
        if new_st == "PAID":
            if not order.confirmed_at:
                order.confirmed_at = datetime.utcnow()
            meta["vindi_status_name"] = "Aprovada / Pago"
            history = meta.get("payment_history") if isinstance(meta.get("payment_history"), list) else []
            now_iso = datetime.now(timezone.utc).isoformat()
            history.append(
                {
                    "event": "PAYMENT_APPROVED",
                    "timestamp": now_iso,
                    "at": now_iso,
                    "source": "PAINEL_SELLER",
                    "status_id": 6,
                    "status_name": "Aprovada / Pago",
                    "vindi_status_name": "Aprovada / Pago",
                    "payment_method": meta.get("payment_method") or "PAYMENT_LINK",
                    "token_transaction": meta.get("vindi_token_transaction") or order.external_id,
                    "message": "Pagamento confirmado no Painel do Pedido",
                }
            )
            meta["payment_history"] = history[-30:]
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

    # Dispara e-mail transacional automático respeitando os status habilitados em Configurações -> E-mails
    email_sent = False
    if (status_changed or data.tracking_code) and data.notify_customer:
        email_sent = _send_b2c_order_email(
            db, order, event_status=order.status, force=False, allow_resend=True
        )

    # Se alterou para PAID e envio automático ao Horus estiver ativo, integra automaticamente
    horus_auto_result: Optional[Dict[str, Any]] = None
    if _normalize_b2c_order_status(order.status) == "PAID" and not order.horus_pedido_venda:
        s_obj = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
        h_cfg = _get_b2c_horus_order_config(s_obj, db=db, company_id=cid)
        if h_cfg.get("enabled") and h_cfg.get("auto_send_on_paid"):
            try:
                horus_auto_result = await _send_b2c_order_to_horus(db, order, force=False)
            except Exception as e_horus:
                logger.warning(f"[B2C Auto Horus] Falha ao enviar pedido #{order.id}: {e_horus}")
                horus_auto_result = {"ok": False, "error": str(e_horus)}

    meta = _parse_order_meta(order)
    st_norm = _normalize_b2c_order_status(order.status)
    st_lbl = B2C_STATUS_LABELS.get(st_norm, order.status)
    msg_parts = [f"Pedido #{order.id} atualizado para '{st_lbl}'!"]
    if email_sent:
        msg_parts.append("E-mail de notificação disparado ao cliente.")
    if horus_auto_result and horus_auto_result.get("ok"):
        msg_parts.append(f"Integrado ao Horus ERP (#{order.horus_pedido_venda}).")

    return {
        "message": " ".join(msg_parts),
        "id": order.id,
        "status": st_norm,
        "status_label": st_lbl,
        "email_sent": email_sent,
        "invoice_number": order.invoice_number or "",
        "invoice_key": order.invoice_key or "",
        "tracking_code": order.tracking_code or "",
        "carrier_name": meta.get("carrier_name") or "",
        "tracking_url": meta.get("tracking_url") or "",
        "horus_pedido_venda": order.horus_pedido_venda or meta.get("horus_pedido_venda") or "",
        "horus_cod_cli": meta.get("horus_cod_cli") or "",
        "horus_sent_at": meta.get("horus_sent_at"),
        "horus_status_erp": meta.get("horus_status_erp") or "",
        "horus_integration_log": meta.get("horus_integration_log") if isinstance(meta.get("horus_integration_log"), list) else [],
        "emails_sent": meta.get("emails_sent") if isinstance(meta.get("emails_sent"), list) else [],
        "last_email_sent_at": meta.get("last_email_sent_at"),
        "last_email_to": meta.get("last_email_to") or "",
    }


@router.post("/orders/{order_id}/send-email")
def manual_send_b2c_order_email(
    order_id: int,
    data: B2COrderSendEmailRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Permite ao Seller disparar/reenviar manualmente o e-mail de notificação de qualquer status
    direto de dentro do pedido (com suporte a informar ou substituir o e-mail de destino).
    """
    cid = _resolve_seller_company_id(current_user, company_id)
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.company_id == cid, Order.origin == "b2c_storefront")
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido B2C não encontrado.")

    target_status = _normalize_b2c_order_status(data.event_status or order.status)
    sent_ok = _send_b2c_order_email(
        db=db,
        order=order,
        event_status=target_status,
        force=True,
        override_email=data.override_email,
        sync_send=True,
    )
    meta = _parse_order_meta(order)
    if not sent_ok:
        raise HTTPException(
            status_code=400,
            detail=(
                "Não foi possível enviar o e-mail para este pedido. "
                "Verifique se o cliente possui um e-mail válido cadastrado e se o servidor SMTP está ativo."
            ),
        )
    st_lbl = B2C_STATUS_LABELS.get(target_status, target_status)
    return {
        "sent": True,
        "order_id": order.id,
        "event_status": target_status,
        "status_label": st_lbl,
        "to_email": meta.get("last_email_to") or data.override_email or "",
        "emails_sent": meta.get("emails_sent") if isinstance(meta.get("emails_sent"), list) else [],
        "last_email_sent_at": meta.get("last_email_sent_at"),
        "message": f"E-mail do pedido #{order.id} ({st_lbl}) enviado com sucesso para {meta.get('last_email_to') or 'o cliente'}!",
    }


@router.post("/orders/{order_id}/send-to-horus")
async def manual_send_b2c_order_to_horus(
    order_id: int,
    data: B2CSendToHorusRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Integra manualmente um pedido da Loja B2C ao Horus ERP via API Aberta do Horus (sem necessidade de ID_GUID).
    Executa: Busca_Cliente -> InsAltCliente -> InsAltEndCliente -> Busca_Acervo -> InsPedidoVenda -> InsItensPedidoVenda -> AltStatus_Pedido.
    """
    cid = _resolve_seller_company_id(current_user, company_id)
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.company_id == cid, Order.origin == "b2c_storefront")
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido B2C não encontrado.")

    try:
        res = await _send_b2c_order_to_horus(db=db, order=order, force=bool(data.force))
        return res
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as exc:
        logger.warning(f"[B2C Send To Horus] Erro no pedido #{order_id}: {exc}")
        raise HTTPException(status_code=400, detail=f"Falha ao integrar pedido #{order_id} no Horus ERP: {exc}")


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

    from app.payments.catalog import provider_config_status
    from app.payments.registry import default_channel_modes, routes_map
    all_routes = routes_map(db, company.id)
    b2c_routes = dict(all_routes.get("B2C_STOREFRONT") or {})
    ch_modes = default_channel_modes(settings, all_routes)
    b2c_ch_mode = ch_modes.get("B2C_STOREFRONT") or {"mode": "PER_METHOD"}

    vindi_cfg_mode = (
        str((settings.b2c_showcases_config or {}).get("vindi_config", {}).get("integration_mode") or "TRANSPARENT").upper()
        if settings and isinstance(settings.b2c_showcases_config, dict)
        and isinstance(settings.b2c_showcases_config.get("vindi_config"), dict)
        else "TRANSPARENT"
    )
    is_payment_link_mode = b2c_ch_mode.get("mode") == "PAYMENT_LINK" or vindi_cfg_mode == "PAYMENT_LINK"
    effective_gateway_active = (
        str(b2c_ch_mode.get("link_provider") or "VINDI").upper()
        if is_payment_link_mode
        else (getattr(settings, "payment_gateway_active", "EFI") if settings else "EFI")
    )
    if is_payment_link_mode:
        b2c_routes["LINK"] = effective_gateway_active

    payload = {
        "company_id": company.id,
        "name": company.name,
        "document": company.document,
        "logo": appearance["branding"].get("logo_url") or company.logo,
        "favicon_url": company.favicon_url,
        "seo_title": company.seo_title or company.name,
        "seo_description": company.seo_description or f"Loja Oficial {company.name}",
        "cover_image_base_url": settings.cover_image_base_url if settings else None,
        "cover_image_secondary_base_url": settings.cover_image_secondary_base_url if settings else None,
        "uses_horus": bool(settings.horus_enabled) if settings else False,
        "b2c_checkout_mode": getattr(settings, "b2c_checkout_mode", "NATIVE_GATEWAY") if settings else "NATIVE_GATEWAY",
        "b2c_channel_mode": "PAYMENT_LINK" if is_payment_link_mode else b2c_ch_mode.get("mode", "PER_METHOD"),
        "b2c_method_providers": b2c_routes,
        "tray_enabled": bool(getattr(settings, "tray_enabled", False)) if settings else False,
        "tray_store_url": getattr(settings, "tray_store_url", None) if settings else None,
        "b2c_default_freight_value": float(getattr(settings, "b2c_default_freight_value", 0) or 0) if settings else 0.0,
        "b2c_free_shipping_min_value": float(getattr(settings, "b2c_free_shipping_min_value", 0) or 0) if settings else 0.0,
        "b2c_lgpd_terms_text": (getattr(settings, "b2c_lgpd_terms_text", None) if settings else None) or default_lgpd,
        "payment_gateway_active": effective_gateway_active,
        "vindi_integration_mode": "PAYMENT_LINK" if is_payment_link_mode else vindi_cfg_mode,
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
                (
                    effective_gateway_active == "VINDI"
                    and (
                        len((settings.vindi_api_key or "").strip()) >= 8
                        or bool(provider_config_status(db, company.id, "VINDI", settings).get("configured"))
                    )
                )
                or effective_gateway_active != "VINDI"
            )
        ),
        "appearance": appearance,
    }
    _b2c_cache_set(company.id, "store_info", payload, settings, label="Dados da Loja, Vitrines & Banners")
    return payload


_B2C_SLUG_CACHE: Dict[str, Any] = {}


@router.get("/public/resolve-slug")
def resolve_public_b2c_store_slug(
    slug: str = Query(..., description="Slug amigável, domínio ou ID da loja B2C"),
    db: Session = Depends(get_db),
):
    clean = re.sub(r"^https?://", "", (slug or "").strip().lower()).split("/")[0].split(":")[0]
    if not clean:
        raise HTTPException(status_code=404, detail="Loja não encontrada.")

    import time
    now_ts = time.time()
    cached_slug_entry = _B2C_SLUG_CACHE.get(clean)
    if cached_slug_entry and (now_ts - cached_slug_entry["ts"]) < 60:
        return get_public_b2c_storefront_info(company_id=cached_slug_entry["company_id"], db=db)

    # Suporte ao subdomínio oficial b2c.{seller}.horusb2b.com.br, b2c-{seller}.horusb2b.com.br ou b2c.{seller}.cronuzb2b.com.br
    b2c_sub_match = re.match(
        r"^b2c[.-]([a-z0-9_-]+)\.(horusb2b\.com\.br|cronuzb2b\.com\.br|cronuz\.com\.br|localhost|horusb2b\.localhost|cronuzb2b\.localhost)$",
        clean,
    )
    seller_slug = b2c_sub_match.group(1) if b2c_sub_match else clean

    # 1. If numeric ID
    if seller_slug.isdigit():
        comp = db.query(Company).filter(Company.id == int(seller_slug), Company.active == True).first()
        if comp:
            _B2C_SLUG_CACHE[clean] = {"company_id": comp.id, "ts": now_ts}
            return get_public_b2c_storefront_info(company_id=comp.id, db=db)

    # 2. Match by b2c_custom_domain, custom_domain, or domain
    comp = (
        db.query(Company)
        .filter(
            Company.active == True,
            or_(
                func.lower(Company.b2c_custom_domain) == clean,
                func.lower(Company.b2c_custom_domain) == seller_slug,
                func.lower(Company.custom_domain) == clean,
                func.lower(Company.custom_domain) == seller_slug,
                func.lower(Company.domain) == clean,
                func.lower(Company.domain) == seller_slug,
                func.lower(Company.custom_domain).like(f"{seller_slug}.%"),
                func.lower(Company.b2c_custom_domain).like(f"b2c.{seller_slug}.%"),
            ),
        )
        .first()
    )
    if comp:
        _B2C_SLUG_CACHE[clean] = {"company_id": comp.id, "ts": now_ts}
        return get_public_b2c_storefront_info(company_id=comp.id, db=db)

    # 3. Match by store_slug inside b2c_showcases_config or slugified company name (including compact match & domain prefix without www.)
    compact_target = re.sub(r"[^a-z0-9]", "", seller_slug)
    active_companies = db.query(Company).filter(Company.active == True).all()
    for c in active_companies:
        s = db.query(CompanySettings).filter(CompanySettings.company_id == c.id).first()
        cfg = _build_b2c_appearance_config(c, s, db)
        cfg_slug = (cfg.get("branding", {}).get("store_slug") or "").strip().lower()
        name_slug = _slugify_store_name(c.name, c.id)
        domain_slug = re.sub(r"^https?://", "", (c.domain or "").strip().lower())
        domain_no_www = re.sub(r"^www\.", "", domain_slug)
        domain_prefix = domain_no_www.split("@")[0].split(".")[0] if domain_no_www else ""
        candidates = [x for x in (cfg_slug, name_slug, domain_slug, domain_no_www, domain_prefix) if x]
        compact_candidates = [re.sub(r"[^a-z0-9]", "", x) for x in candidates]
        if seller_slug in candidates or (compact_target and compact_target in compact_candidates):
            _B2C_SLUG_CACHE[clean] = {"company_id": c.id, "ts": now_ts}
            return get_public_b2c_storefront_info(company_id=c.id, db=db)

    raise HTTPException(status_code=404, detail="Loja não encontrada para esta URL amigável.")



@router.get("/public/catalog")
async def get_public_b2c_catalog(
    company_id: int = Query(..., description="ID do Seller"),
    q: str = Query("", description="Termo de busca (Título, Autor, ISBN ou Editora)"),
    filter: str = Query("default", description="default, NOM_AUTOR, NOM_EDITORA, COD_GENERO"),
    only_promo: bool = Query(False, description="Filtrar apenas itens em promoção B2C"),
    brand: str = Query("", description="Filtro adicional por Editora/Marca"),
    author: str = Query("", description="Filtro adicional por Autor"),
    characteristic: str = Query("", description="Filtro adicional por característica (Nome:Valor)"),
    min_price: Optional[float] = Query(None, description="Preço mínimo"),
    max_price: Optional[float] = Query(None, description="Preço máximo"),
    in_stock: bool = Query(False, description="Apenas itens em estoque"),
    sort_by: str = Query("default", description="default, price_asc, price_desc, name_asc"),
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
    brand_filter = brand.strip() if brand else ""
    author_filter = author.strip() if author else ""
    char_filter = characteristic.strip() if characteristic else ""
    cache_key = (
        f"catalog:{search_term.lower()}:{filter}:{int(only_promo)}:"
        f"{brand_filter.lower()}:{author_filter.lower()}:{char_filter.lower()}:"
        f"{min_price}:{max_price}:{int(in_stock)}:{sort_by}:{skip}:{limit}"
    )
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

    allow_zero_sale = _is_b2c_zero_balance_sale_enabled(settings)

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
        items = _apply_b2c_promotions_to_items(items, promotions, allow_zero_balance_sale=allow_zero_sale)
        if only_promo:
            items = [
                it for it in items
                if it.get("promotional_price") is not None
                and float(it.get("promotional_price") or 0) < float(it.get("base_price") or 0)
            ]
        if brand_filter:
            items = [it for it in items if brand_filter.lower() in str(it.get("brand") or "").lower()]
        if author_filter:
            items = [it for it in items if author_filter.lower() in str(it.get("author") or "").lower()]
        if in_stock:
            items = [it for it in items if int(it.get("stock_quantity") or 0) > 0 or bool(it.get("allow_purchase"))]
        if min_price is not None:
            items = [it for it in items if float(it.get("promotional_price") or it.get("base_price") or 0) >= min_price]
        if max_price is not None:
            items = [it for it in items if float(it.get("promotional_price") or it.get("base_price") or 0) <= max_price]

        brands_set = sorted({str(it.get("brand") or "").strip() for it in items if str(it.get("brand") or "").strip()})[:20]
        authors_set = sorted({str(it.get("author") or "").strip() for it in items if str(it.get("author") or "").strip()})[:20]
        cats_set = sorted({
            str((it.get("category") or {}).get("name") or "").strip()
            for it in items
            if str((it.get("category") or {}).get("name") or "").strip()
            and str((it.get("category") or {}).get("name") or "").strip().lower() != "geral"
        })[:20]
        chars_facets: Dict[str, List[str]] = {}
        for it in items:
            filtered_it_chars = []
            for ch in (it.get("characteristics") or []):
                cn = str(ch.get("name") or "").strip()
                cv = str(ch.get("value") or "").strip()
                if not cn or not cv:
                    continue
                if "tray" in cn.lower() or "tray" in cv.lower() or f"{cn} {cv}".strip().lower() in ("tray sim", "tray: sim"):
                    continue
                filtered_it_chars.append({"name": cn, "value": cv})
                chars_facets.setdefault(cn, [])
                if cv not in chars_facets[cn]:
                    chars_facets[cn].append(cv)
            it["characteristics"] = filtered_it_chars

        current_page = (skip // limit) + 1
        estimated_pages = current_page if len(items) < limit else max(5, current_page + 3)
        res_payload = {
            "items": items,
            "total": skip + len(items),
            "page": current_page,
            "pages": estimated_pages,
            "source": "HORUS_ERP",
            "facets": {
                "categories": cats_set,
                "brands": brands_set,
                "authors": authors_set,
                "characteristics": chars_facets,
            },
        }
        if len(items) > 0:
            label_str = f"Catálogo Pág {current_page} ({search_term or 'Vitrine Inicial'})"
            _b2c_cache_set(company_id, cache_key, res_payload, settings, label=label_str)
        return res_payload

    # Catálogo Local do Cronuz (prd_product sincronizado do Horus ou cadastrado manualmente)
    from sqlalchemy import and_
    from sqlalchemy.orm import joinedload
    from app.models.catalog_support import Category, ProductCharacteristic, Characteristic

    raw_sync_cfg = (
        (settings.b2c_showcases_config or {}).get("horus_sync_config", {})
        if settings and isinstance(getattr(settings, "b2c_showcases_config", None), dict)
        else {}
    )
    sync_char_type_low = str(raw_sync_cfg.get("characteristic_type_name") or "").strip().lower()
    sync_char_val_low = str(raw_sync_cfg.get("characteristic_value") or "").strip().lower()

    def _is_internal_tray_or_sync_char(c_name: str, c_val: str = "") -> bool:
        cn_low = str(c_name or "").strip().lower()
        cv_low = str(c_val or "").strip().lower()
        combined = f"{cn_low} {cv_low}".strip()
        if "tray" in cn_low or "tray" in cv_low or combined in ("tray sim", "tray: sim", "tray=sim"):
            return True
        if cn_low.startswith("característica horus tipo") and cv_low in ("sim", "s", "true", "1"):
            return True
        if sync_char_type_low and cn_low == sync_char_type_low and cv_low in ("sim", "s", "true", "1", sync_char_val_low):
            return True
        return False

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

    if brand_filter:
        query = query.filter(Product.brand.ilike(f"%{brand_filter}%"))
    if author_filter:
        query = query.filter(Product.model.ilike(f"%{author_filter}%"))
    if in_stock:
        if allow_zero_sale:
            query = query.filter(
                or_(
                    Product.stock_quantity > 0,
                    or_(Product.horus_situacao_item.is_(None), ~Product.horus_situacao_item.in_(["FC", "FE"])),
                )
            )
        else:
            query = query.filter(Product.stock_quantity > 0)
    if min_price is not None:
        query = query.filter(Product.base_price >= min_price)
    if max_price is not None:
        query = query.filter(Product.base_price <= max_price)
    if char_filter:
        if ":" in char_filter:
            c_name_part, c_val_part = char_filter.split(":", 1)
            c_name_clean = c_name_part.strip()
            c_val_clean = c_val_part.strip()
            if c_name_clean.lower() in ("assunto", "gênero", "genero", "categoria"):
                query = query.outerjoin(Category, Product.category_id == Category.id).filter(
                    or_(Category.name.ilike(f"%{c_val_clean}%"), Product.subject.ilike(f"%{c_val_clean}%"))
                )
            else:
                query = query.filter(
                    Product.characteristics.any(
                        and_(
                            ProductCharacteristic.value.ilike(f"%{c_val_clean}%"),
                            ProductCharacteristic.characteristic.has(Characteristic.name.ilike(f"%{c_name_clean}%")),
                        )
                    )
                )
        else:
            query = query.filter(
                or_(
                    Product.characteristics.any(ProductCharacteristic.value.ilike(f"%{char_filter}%")),
                    Product.subject.ilike(f"%{char_filter}%"),
                )
            )

    total = query.count()
    if sort_by == "price_asc":
        order_clauses = [(Product.stock_quantity > 0).desc(), Product.base_price.asc(), Product.id.desc()]
    elif sort_by == "price_desc":
        order_clauses = [(Product.stock_quantity > 0).desc(), Product.base_price.desc(), Product.id.desc()]
    elif sort_by == "name_asc":
        order_clauses = [(Product.stock_quantity > 0).desc(), Product.name.asc()]
    else:
        order_clauses = [(Product.stock_quantity > 0).desc(), Product.id.desc()]

    products = (
        query.order_by(*order_clauses)
        .offset(skip)
        .limit(limit)
        .all()
    )
    allow_backorder = settings.allow_backorder if settings else False

    mapped = []
    for p in products:
        real_qty = max(0, int(p.stock_quantity or 0))
        prod_sit = getattr(p, "horus_situacao_item", None)
        allow_p, status_lbl = _can_sell_b2c_product(real_qty, prod_sit, allow_zero_sale)
        chars_list = []
        for pc in (getattr(p, "characteristics", None) or []):
            c_name = pc.characteristic.name if getattr(pc, "characteristic", None) else "Característica"
            c_val = str(pc.value or "").strip()
            if not c_val or _is_internal_tray_or_sync_char(c_name, c_val):
                continue
            chars_list.append({"name": c_name, "value": c_val})

        mapped.append(
            {
                "id": p.id,
                "company_id": p.company_id,
                "sku": p.sku,
                "ean_gtin": p.ean_gtin or "",
                "horus_situacao_item": prod_sit,
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
                "allow_purchase": allow_p,
                "stock_status_label": status_lbl,
                "cover_url": getattr(p, "image_url", None) or getattr(p, "cover_url", None),
            }
        )

    mapped = _apply_b2c_promotions_to_items(mapped, promotions, allow_zero_balance_sale=allow_zero_sale)
    if only_promo:
        mapped = [
            it for it in mapped
            if it.get("promotional_price") is not None
            and float(it.get("promotional_price") or 0) < float(it.get("base_price") or 0)
        ]

    # Build lightweight facets for top bar (categories) and left sidebar (brands, authors, characteristics) with RAM cache
    cached_facets = _b2c_cache_get(company_id, "facets_meta_v2", settings)
    if cached_facets is not None and isinstance(cached_facets, dict):
        facets_categories = cached_facets.get("categories", [])
        facets_brands = cached_facets.get("brands", [])
        facets_authors = cached_facets.get("authors", [])
        facets_chars = cached_facets.get("characteristics", {})
    else:
        facets_categories = []
        facets_brands = []
        facets_authors = []
        facets_chars = {}
        try:
            # 1. All active store categories (so top bar never loses categories when one is clicked)
            cat_rows = (
                db.query(Category.name)
                .join(Product, Product.category_id == Category.id)
                .filter(Product.company_id == company_id, Product.status == "ACTIVE", Category.name.isnot(None), Category.name != "")
                .distinct()
                .limit(30)
                .all()
            )
            cat_names_set = {
                str(r[0]).strip()
                for r in cat_rows
                if r and r[0] and str(r[0]).strip().lower() != "geral"
            }
            if len(cat_names_set) < 12:
                subj_rows = (
                    db.query(Product.subject)
                    .filter(Product.company_id == company_id, Product.status == "ACTIVE", Product.subject.isnot(None), Product.subject != "")
                    .distinct()
                    .limit(20)
                    .all()
                )
                for sr in subj_rows:
                    if sr and sr[0] and str(sr[0]).strip().lower() != "geral":
                        cat_names_set.add(str(sr[0]).strip())
            facets_categories = sorted(cat_names_set)[:20]

            # 2. Brands / Publishers
            brand_rows = (
                db.query(Product.brand)
                .filter(Product.company_id == company_id, Product.status == "ACTIVE", Product.brand.isnot(None), Product.brand != "")
                .distinct()
                .limit(30)
                .all()
            )
            facets_brands = sorted({str(r[0]).strip() for r in brand_rows if r and r[0]})[:25]

            # 3. Authors
            author_rows = (
                db.query(Product.model)
                .filter(Product.company_id == company_id, Product.status == "ACTIVE", Product.model.isnot(None), Product.model != "")
                .distinct()
                .limit(30)
                .all()
            )
            facets_authors = sorted({str(r[0]).strip() for r in author_rows if r and r[0]})[:25]

            # 4. Product Characteristics (excluding TRAY / TRAY SIM)
            char_rows = (
                db.query(Characteristic.name, ProductCharacteristic.value)
                .join(ProductCharacteristic, ProductCharacteristic.characteristic_id == Characteristic.id)
                .join(Product, Product.id == ProductCharacteristic.product_id)
                .filter(Product.company_id == company_id, Product.status == "ACTIVE")
                .distinct()
                .limit(120)
                .all()
            )
            for c_name, c_val in char_rows:
                cn = str(c_name or "").strip()
                cv = str(c_val or "").strip()
                if not cn or not cv or _is_internal_tray_or_sync_char(cn, cv):
                    continue
                facets_chars.setdefault(cn, [])
                if cv not in facets_chars[cn] and len(facets_chars[cn]) < 20:
                    facets_chars[cn].append(cv)

            # Also include any other Characteristic definitions created for the company in prd_characteristic (excluding TRAY)
            all_company_chars = (
                db.query(Characteristic)
                .filter(Characteristic.company_id == company_id)
                .all()
            )
            for ch_def in all_company_chars:
                cn = str(ch_def.name or "").strip()
                if not cn or _is_internal_tray_or_sync_char(cn, ""):
                    continue
                raw_opts = [o.strip() for o in str(ch_def.options or "").split(",") if o.strip()]
                for opt_val in raw_opts:
                    if _is_internal_tray_or_sync_char(cn, opt_val):
                        continue
                    facets_chars.setdefault(cn, [])
                    if opt_val not in facets_chars[cn] and len(facets_chars[cn]) < 20:
                        facets_chars[cn].append(opt_val)

            _b2c_cache_set(
                company_id,
                "facets_meta_v2",
                {
                    "categories": facets_categories,
                    "brands": facets_brands,
                    "authors": facets_authors,
                    "characteristics": facets_chars,
                },
                settings,
                label="Filtros Laterais & Categorias (Sem TRAY SIM)",
            )
        except Exception:
            pass

    current_page = (skip // limit) + 1
    res_payload = {
        "items": mapped,
        "total": total,
        "page": current_page,
        "pages": max(1, (total + limit - 1) // limit),
        "source": "LOCAL_DB",
        "facets": {
            "categories": facets_categories,
            "brands": facets_brands,
            "authors": facets_authors,
            "characteristics": facets_chars,
        },
    }
    if len(mapped) > 0:
        label_str = f"Catálogo Pág {current_page} ({search_term or 'Vitrine Inicial'})"
        _b2c_cache_set(company_id, cache_key, res_payload, settings, label=label_str)
    return res_payload


@router.get("/public/product/{product_code}")
async def get_public_b2c_product_detail(
    product_code: str,
    company_id: int = Query(..., description="ID do Seller"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional),
):
    """
    Busca a ficha completa de um produto específico do catálogo B2C por ISBN/EAN, SKU ou ID,
    permitindo URL direta de produto (/produto/{codigo}) e atualização via F5 com Cache em Memória.
    """
    clean_code = str(product_code or "").strip()
    if not clean_code:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    company = db.query(Company).filter(Company.id == company_id).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()

    prod_cache_key = f"prod:{clean_code.lower()}"
    cached_prod = _b2c_cache_get(company_id, prod_cache_key, settings)
    if cached_prod is not None:
        return cached_prod

    promotions = []
    if company and settings:
        raw_cfg = getattr(settings, "b2c_showcases_config", None)
        if isinstance(raw_cfg, dict) and isinstance(raw_cfg.get("promotions"), list):
            promotions = raw_cfg.get("promotions", [])

    from sqlalchemy.orm import joinedload
    query = (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.brand_rel), joinedload(Product.characteristics))
        .filter(Product.company_id == company_id, Product.status == "ACTIVE")
    )

    filters = [
        Product.ean_gtin == clean_code,
        Product.sku == clean_code,
    ]
    if clean_code.isdigit() and len(clean_code) <= 9:
        filters.append(Product.id == int(clean_code))

    product = query.filter(or_(*filters)).first()

    allow_zero_sale = _is_b2c_zero_balance_sale_enabled(settings)
    if product:
        real_qty = max(0, int(product.stock_quantity or 0))
        prod_sit = getattr(product, "horus_situacao_item", None)
        allow_p, status_lbl = _can_sell_b2c_product(real_qty, prod_sit, allow_zero_sale)
        chars_list = []
        for pc in (getattr(product, "characteristics", None) or []):
            c_name = pc.characteristic.name if getattr(pc, "characteristic", None) else "Característica"
            chars_list.append({"name": c_name, "value": pc.value})

        mapped_item = {
            "id": product.id,
            "company_id": product.company_id,
            "sku": product.sku,
            "ean_gtin": product.ean_gtin or "",
            "horus_situacao_item": prod_sit,
            "name": product.name,
            "author": getattr(product, "author", None) or getattr(product, "model", None) or "",
            "base_price": float(product.base_price or 0.0),
            "promotional_price": float(product.promotional_price) if getattr(product, "promotional_price", None) else None,
            "stock_quantity": real_qty,
            "weight_kg": float(product.weight_kg) if product.weight_kg else None,
            "width_cm": float(product.width_cm) if product.width_cm else None,
            "height_cm": float(product.height_cm) if product.height_cm else None,
            "length_cm": float(product.length_cm) if product.length_cm else None,
            "characteristics": chars_list,
            "status": product.status,
            "short_description": product.short_description or "",
            "long_description": product.long_description or product.short_description or "",
            "brand": (product.brand_rel.name if getattr(product, "brand_rel", None) else None) or product.brand or "",
            "category": (
                {"id": product.category.id, "name": product.category.name}
                if getattr(product, "category", None)
                else {"id": 0, "name": product.subject or "Geral"}
            ),
            "allow_purchase": allow_p,
            "stock_status_label": status_lbl,
            "cover_url": getattr(product, "image_url", None) or getattr(product, "cover_url", None),
        }
        enriched = _apply_b2c_promotions_to_items(
            [mapped_item], promotions, allow_zero_balance_sale=allow_zero_sale
        )[0]

        # Related products from same category or brand
        rel_query = (
            db.query(Product)
            .options(joinedload(Product.category), joinedload(Product.brand_rel))
            .filter(
                Product.company_id == company_id,
                Product.status == "ACTIVE",
                Product.id != product.id,
            )
        )
        if product.category_id:
            rel_query = rel_query.filter(Product.category_id == product.category_id)
        elif product.brand:
            rel_query = rel_query.filter(Product.brand == product.brand)

        rel_prods = rel_query.order_by((Product.stock_quantity > 0).desc(), Product.id.desc()).limit(6).all()
        related_list = []
        for rp in rel_prods:
            r_qty = max(0, int(rp.stock_quantity or 0))
            r_sit = getattr(rp, "horus_situacao_item", None)
            r_allow, r_lbl = _can_sell_b2c_product(r_qty, r_sit, allow_zero_sale)
            related_list.append({
                "id": rp.id,
                "company_id": rp.company_id,
                "sku": rp.sku,
                "ean_gtin": rp.ean_gtin or "",
                "horus_situacao_item": r_sit,
                "name": rp.name,
                "author": getattr(rp, "author", None) or getattr(rp, "model", None) or "",
                "base_price": float(rp.base_price or 0.0),
                "promotional_price": float(rp.promotional_price) if getattr(rp, "promotional_price", None) else None,
                "stock_quantity": r_qty,
                "brand": (rp.brand_rel.name if getattr(rp, "brand_rel", None) else None) or rp.brand or "",
                "category": (
                    {"id": rp.category.id, "name": rp.category.name}
                    if getattr(rp, "category", None)
                    else {"id": 0, "name": rp.subject or "Geral"}
                ),
                "allow_purchase": r_allow,
                "stock_status_label": r_lbl,
                "cover_url": getattr(rp, "image_url", None) or getattr(rp, "cover_url", None),
            })
        related_list = _apply_b2c_promotions_to_items(
            related_list, promotions, allow_zero_balance_sale=allow_zero_sale
        )
        prod_payload = {"product": enriched, "related": related_list}
        _b2c_cache_set(company_id, prod_cache_key, prod_payload, settings, label=f"Produto {clean_code}")
        return prod_payload

    # Check showcases in b2c_showcases_config if not in local DB
    if company and settings:
        cfg = _build_b2c_appearance_config(company, settings, db)
        for sc in (cfg.get("showcases") or []):
            for it in (sc.get("items") or []):
                if str(it.get("ean_gtin") or "").strip() == clean_code or str(it.get("sku") or "").strip() == clean_code or str(it.get("id") or "") == clean_code:
                    prod_payload = {"product": it, "related": (sc.get("items") or [])[:6]}
                    _b2c_cache_set(company_id, prod_cache_key, prod_payload, settings, label=f"Produto Vitrine {clean_code}")
                    return prod_payload

    # Fallback Horus ERP somente se a loja ainda não tiver nenhum produto sincronizado no banco local do Cronuz
    local_active_count = (
        db.query(func.count(Product.id))
        .filter(Product.company_id == company_id, Product.status == "ACTIVE")
        .scalar()
        or 0
    )
    if local_active_count == 0 and settings and settings.horus_enabled:
        items = await _fetch_from_horus_storefront(
            db=db,
            company_id=company_id,
            current_user=current_user,
            term=clean_code,
            search_type="SEARCH",
            skip=0,
            limit=5,
            settings=settings,
            search_filter="default",
        )
        items = _apply_b2c_promotions_to_items(items, promotions, allow_zero_balance_sale=allow_zero_sale)
        if items:
            prod_payload = {"product": items[0], "related": items[1:6]}
            _b2c_cache_set(company_id, prod_cache_key, prod_payload, settings, label=f"Produto Horus {clean_code}")
            return prod_payload

    raise HTTPException(status_code=404, detail="Produto não encontrado nesta loja.")


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


def _parse_b2c_customer_meta(cust: Customer) -> Dict[str, Any]:
    raw_txt = getattr(cust, "royalties_data", None)
    if raw_txt and str(raw_txt).strip().startswith("{"):
        try:
            parsed = _json.loads(raw_txt)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return {}


def _save_b2c_customer_meta(cust: Customer, meta: Dict[str, Any]) -> None:
    try:
        cust.royalties_data = _json.dumps(meta, ensure_ascii=False)
    except Exception:
        pass


def _append_b2c_customer_login_event(
    cust: Customer,
    event_type: str,
    request: Optional[Request] = None,
    detail: Optional[str] = None,
) -> None:
    meta = _parse_b2c_customer_meta(cust)
    meta["b2c_customer"] = True
    history = meta.get("login_history") if isinstance(meta.get("login_history"), list) else []
    now_iso = datetime.now(timezone.utc).isoformat()
    ip_addr = ""
    ua = ""
    if request:
        ip_addr = (
            request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (request.client.host if request.client else "")
        )
        ua = (request.headers.get("user-agent") or "")[:240]
    history.insert(
        0,
        {
            "at": now_iso,
            "event": event_type,
            "ip": ip_addr,
            "user_agent": ua,
            "detail": detail or "",
        },
    )
    meta["login_history"] = history[:50]
    meta["last_login_at"] = now_iso
    _save_b2c_customer_meta(cust, meta)


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

    # Coupon redemptions count per CPF/email/customer_id
    all_reds = db.query(B2CCouponRedemption).filter(B2CCouponRedemption.company_id == cid).all()
    reds_by_cpf: Dict[str, int] = {}
    for r in all_reds:
        rcpf = _clean_digits(r.customer_cpf)
        if rcpf:
            reds_by_cpf[rcpf] = reds_by_cpf.get(rcpf, 0) + 1

    # Customers who bought in B2C, have password_hash, were migrated/created in B2C, or match stock alerts
    all_customers = db.query(Customer).filter(Customer.company_id == cid).order_by(Customer.id.desc()).limit(1000).all()
    seen_emails = set()
    customer_rows: List[Dict[str, Any]] = []

    for c in all_customers:
        em = (c.email or "").strip().lower()
        c_orders = orders_by_cust.get(c.id, [])
        c_alerts = alerts_by_email.get(em, []) if em else []
        c_meta = _parse_b2c_customer_meta(c)
        is_b2c = bool(
            c.password_hash
            or len(c_orders) > 0
            or len(c_alerts) > 0
            or c_meta.get("b2c_customer")
            or getattr(c, "segment", "") in ("B2C_STOREFRONT", "B2C_MIGRATED")
        )
        if not is_b2c:
            continue
        if em:
            seen_emails.add(em)

        pending_alerts = [a for a in c_alerts if a.get("status") == "PENDING"]
        if only_stock_alerts and len(pending_alerts) == 0:
            continue

        cpf_clean = _clean_digits(getattr(c, "document", ""))
        login_hist = c_meta.get("login_history") if isinstance(c_meta.get("login_history"), list) else []
        addr = c.addresses[0] if getattr(c, "addresses", None) else None

        row = {
            "id": f"cust-{c.id}",
            "customer_id": c.id,
            "name": c.name,
            "cpf": getattr(c, "document", "") or "",
            "email": c.email or "",
            "phone": c.phone or "",
            "city": (getattr(addr, "city", "") if addr else "") or (c.city or ""),
            "state": (getattr(addr, "state", "") if addr else "") or (c.state or ""),
            "has_password": bool(c.password_hash),
            "origin": c_meta.get("origin") or getattr(c, "segment", "") or ("B2C_STOREFRONT" if c.password_hash else "CHECKOUT"),
            "logins_count": len(login_hist),
            "last_login_at": c_meta.get("last_login_at") or (login_hist[0].get("at") if login_hist else None),
            "coupons_used_count": reds_by_cpf.get(cpf_clean, 0),
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
                "has_password": False,
                "origin": "LEAD_AVISE_ME",
                "logins_count": 0,
                "last_login_at": None,
                "coupons_used_count": 0,
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

    # Sort: customers with active "Avise-me" first, then most orders, then most recent
    customer_rows.sort(
        key=lambda x: (
            1 if x.get("has_avise_me") else 0,
            x.get("orders_count") or 0,
            x.get("customer_id") or 0,
        ),
        reverse=True,
    )

    return {
        "customers": customer_rows,
        "stock_notifications": enriched_notifications,
        "pending_alerts_count": sum(1 for n in enriched_notifications if n.get("status") == "PENDING"),
    }


@router.get("/customers/import-template")
def download_b2c_customers_import_template(
    current_user: User = Depends(get_current_user),
):
    """
    Gera planilha Excel (.xlsx) modelo para importação/migração de clientes B2C (com CPF e E-mail obrigatórios).
    """
    import io
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Clientes B2C"

    headers = [
        "NOME COMPLETO",
        "CPF (OBRIGATORIO)",
        "EMAIL (OBRIGATORIO)",
        "TELEFONE / CELULAR",
        "CEP",
        "ENDERECO / RUA",
        "NUMERO",
        "COMPLEMENTO",
        "BAIRRO",
        "CIDADE",
        "UF",
    ]
    ws.append(headers)
    header_fill = PatternFill(start_color="312E81", end_color="312E81", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=10)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    ws.append(
        [
            "MARIA SILVA EXEMPLO",
            "123.456.789-01",
            "maria.silva@exemplo.com.br",
            "(11) 99999-8888",
            "01310-100",
            "AVENIDA PAULISTA",
            "1000",
            "CONJ 101",
            "BELA VISTA",
            "SAO PAULO",
            "SP",
        ]
    )

    widths = [30, 20, 32, 20, 14, 30, 12, 18, 22, 22, 8]
    for idx, w in enumerate(widths, start=1):
        col_letter = openpyxl.utils.get_column_letter(idx)
        ws.column_dimensions[col_letter].width = w

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Modelo_Importacao_Clientes_B2C.xlsx"'},
    )


@router.post("/customers")
def create_or_update_b2c_customer_manual(
    data: B2CCustomerManualUpsertRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cadastra ou atualiza manualmente um cliente no ambiente B2C (com CPF e E-mail obrigatórios).
    """
    cid = _resolve_seller_company_id(current_user, company_id)
    cpf_digits = _clean_digits(data.cpf)
    if len(cpf_digits) != 11:
        raise HTTPException(status_code=400, detail="Informe um CPF válido com 11 dígitos.")
    email_clean = (data.email or "").strip().lower()
    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=400, detail="Informe um e-mail válido (obrigatório para recuperação de senha e notificações).")
    name_clean = (data.name or "").strip().upper()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Informe o nome completo do cliente.")

    cust = (
        db.query(Customer)
        .filter(
            Customer.company_id == cid,
            or_(Customer.document == cpf_digits, func.lower(Customer.email) == email_clean),
        )
        .first()
    )
    created_new = False
    if not cust:
        cust = Customer(
            company_id=cid,
            name=name_clean,
            corporate_name=name_clean,
            document=cpf_digits,
            email=email_clean,
            phone=(data.phone or "").strip(),
            customer_type="PF",
            crm_status="ACTIVE",
            segment="B2C_STOREFRONT",
            city=(data.city or "").strip().upper(),
            state=(data.state or "")[:2].upper(),
        )
        db.add(cust)
        db.flush()
        created_new = True
    else:
        cust.name = name_clean
        cust.corporate_name = name_clean
        cust.document = cpf_digits
        cust.email = email_clean
        if data.phone is not None:
            cust.phone = data.phone.strip()
        if data.city is not None:
            cust.city = data.city.strip().upper()
        if data.state is not None:
            cust.state = data.state.strip()[:2].upper()
        if not cust.segment:
            cust.segment = "B2C_STOREFRONT"

    if data.password and len(data.password.strip()) >= 6:
        cust.password_hash = security.get_password_hash(data.password.strip())

    meta = _parse_b2c_customer_meta(cust)
    meta["b2c_customer"] = True
    if created_new:
        meta["origin"] = "MANUAL_PANEL"
        meta["created_by_seller_at"] = datetime.now(timezone.utc).isoformat()
    _save_b2c_customer_meta(cust, meta)

    if data.zip_code or data.street or data.city:
        addr = db.query(Address).filter(Address.customer_id == cust.id).first()
        if not addr:
            addr = Address(
                customer_id=cust.id,
                street=(data.street or "").strip().upper(),
                number=(data.number or "S/N").strip().upper(),
                complement=(data.complement or "").strip().upper() if data.complement else None,
                neighborhood=(data.neighborhood or "").strip().upper(),
                city=(data.city or cust.city or "").strip().upper(),
                state=((data.state or cust.state or "SP")[:2]).upper(),
                zip_code=_clean_digits(data.zip_code),
                type="MAIN",
            )
            db.add(addr)
        else:
            if data.street is not None:
                addr.street = data.street.strip().upper()
            if data.number is not None:
                addr.number = (data.number or "S/N").strip().upper()
            if data.complement is not None:
                addr.complement = data.complement.strip().upper() or None
            if data.neighborhood is not None:
                addr.neighborhood = data.neighborhood.strip().upper()
            if data.city is not None:
                addr.city = data.city.strip().upper()
            if data.state is not None:
                addr.state = (data.state or "SP")[:2].upper()
            if data.zip_code is not None:
                addr.zip_code = _clean_digits(data.zip_code)

    db.commit()
    db.refresh(cust)
    return {
        "message": (
            f"Cliente {cust.name} cadastrado com sucesso no B2C!"
            if created_new
            else f"Cadastro de {cust.name} atualizado com sucesso!"
        ),
        "customer_id": cust.id,
        "created": created_new,
    }


@router.post("/customers/import")
async def import_b2c_customers_spreadsheet(
    file: UploadFile = File(...),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Importa planilha Excel (.xlsx) ou CSV de clientes para migração de outra loja para o Cronuz B2C.
    Regra mandatória: Limite máximo de 10 MB para planilhas e validação de CPF + E-mail obrigatórios.
    Clientes importados ficam prontos para recuperar/criar senha via 'Esqueci minha senha' ou Primeiro Acesso.
    """
    import io
    import csv

    cid = _resolve_seller_company_id(current_user, company_id)
    MAX_SHEET_BYTES = 10 * 1024 * 1024  # 10 MB
    file_bytes = await file.read()
    if len(file_bytes) > MAX_SHEET_BYTES:
        raise HTTPException(
            status_code=413,
            detail="O arquivo excede o limite máximo permitido de 10 MB para este tipo de envio.",
        )
    if not file_bytes:
        raise HTTPException(status_code=400, detail="O arquivo enviado está vazio.")

    filename = (file.filename or "").lower()
    raw_rows: List[List[Any]] = []

    if filename.endswith(".csv") or filename.endswith(".txt"):
        text_content = ""
        for enc in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                text_content = file_bytes.decode(enc)
                break
            except Exception:
                continue
        delimiter = ";" if text_content.count(";") >= text_content.count(",") else ","
        reader = csv.reader(io.StringIO(text_content), delimiter=delimiter)
        for r in reader:
            raw_rows.append(r)
    else:
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
            ws = wb.active
            for r in ws.iter_rows(values_only=True):
                raw_rows.append(list(r))
            wb.close()
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Não foi possível ler a planilha Excel. Envie um arquivo .xlsx ou .csv válido ({exc}).",
            )

    if len(raw_rows) < 2:
        raise HTTPException(status_code=400, detail="A planilha não possui linhas de dados para importar.")

    header_row = [str(c or "").strip().upper() for c in raw_rows[0]]

    def _find_col(keywords: List[str], default_idx: Optional[int] = None) -> Optional[int]:
        for idx, col_name in enumerate(header_row):
            for kw in keywords:
                if kw in col_name:
                    return idx
        return default_idx

    idx_name = _find_col(["NOME", "CLIENTE", "NAME"], 0)
    idx_cpf = _find_col(["CPF", "DOCUMENTO", "DOC"], 1)
    idx_email = _find_col(["EMAIL", "E-MAIL"], 2)
    idx_phone = _find_col(["TEL", "CEL", "FONE", "WHATS", "PHONE"], 3)
    idx_cep = _find_col(["CEP", "ZIP"], 4)
    idx_street = _find_col(["ENDERECO", "ENDEREÇO", "RUA", "LOGRADOURO"], 5)
    idx_number = _find_col(["NUMERO", "NÚMERO", "NUM"], 6)
    idx_comp = _find_col(["COMPLEMENTO", "COMPL"], 7)
    idx_neigh = _find_col(["BAIRRO"], 8)
    idx_city = _find_col(["CIDADE", "MUNICIPIO", "MUNICÍPIO"], 9)
    idx_uf = _find_col(["UF", "ESTADO"], 10)

    def _cell(row_vals: List[Any], col_i: Optional[int]) -> str:
        if col_i is None or col_i >= len(row_vals):
            return ""
        val = row_vals[col_i]
        if val is None:
            return ""
        if isinstance(val, float) and val.is_integer():
            return str(int(val)).strip()
        return str(val).strip()

    existing_customers = db.query(Customer).filter(Customer.company_id == cid).all()
    by_cpf: Dict[str, Customer] = {}
    by_email: Dict[str, Customer] = {}
    for ec in existing_customers:
        d = _clean_digits(ec.document)
        if d:
            by_cpf[d] = ec
        em = (ec.email or "").strip().lower()
        if em:
            by_email[em] = ec

    created_count = 0
    updated_count = 0
    skipped_rows: List[Dict[str, Any]] = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for line_num, r in enumerate(raw_rows[1:], start=2):
        if not any(r):
            continue
        raw_name = _cell(r, idx_name).upper()
        raw_cpf = _clean_digits(_cell(r, idx_cpf))
        if 0 < len(raw_cpf) < 11:
            raw_cpf = raw_cpf.zfill(11)
        raw_email = _cell(r, idx_email).lower()

        if not raw_cpf and not raw_email and not raw_name:
            continue

        if len(raw_cpf) != 11:
            skipped_rows.append({"row": line_num, "name": raw_name or "—", "reason": f"CPF inválido ou ausente ({_cell(r, idx_cpf)})"})
            continue
        if not raw_email or "@" not in raw_email:
            skipped_rows.append({"row": line_num, "name": raw_name or raw_cpf, "reason": "E-mail obrigatório ausente ou inválido"})
            continue

        final_name = raw_name or raw_email.split("@")[0].upper()
        phone_val = _cell(r, idx_phone)
        cep_val = _clean_digits(_cell(r, idx_cep))
        street_val = _cell(r, idx_street).upper()
        num_val = _cell(r, idx_number).upper() or "S/N"
        comp_val = _cell(r, idx_comp).upper()
        neigh_val = _cell(r, idx_neigh).upper()
        city_val = _cell(r, idx_city).upper()
        uf_val = _cell(r, idx_uf).upper()[:2]

        cust = by_cpf.get(raw_cpf) or by_email.get(raw_email)
        if not cust:
            cust = Customer(
                company_id=cid,
                name=final_name,
                corporate_name=final_name,
                document=raw_cpf,
                email=raw_email,
                phone=phone_val,
                customer_type="PF",
                crm_status="ACTIVE",
                segment="B2C_MIGRATED",
                city=city_val,
                state=uf_val,
            )
            meta = {
                "b2c_customer": True,
                "origin": "EXCEL_MIGRATION",
                "migrated_at": now_iso,
            }
            _save_b2c_customer_meta(cust, meta)
            db.add(cust)
            db.flush()
            by_cpf[raw_cpf] = cust
            by_email[raw_email] = cust
            created_count += 1
        else:
            if final_name and (not cust.name or cust.name.upper().startswith("CLIENTE CPF")):
                cust.name = final_name
                cust.corporate_name = final_name
            elif final_name:
                cust.name = final_name
            cust.document = raw_cpf
            cust.email = raw_email
            if phone_val:
                cust.phone = phone_val
            if city_val:
                cust.city = city_val
            if uf_val:
                cust.state = uf_val
            if not cust.segment:
                cust.segment = "B2C_MIGRATED"
            meta = _parse_b2c_customer_meta(cust)
            meta["b2c_customer"] = True
            meta["origin"] = meta.get("origin") or "EXCEL_MIGRATION"
            meta["last_imported_at"] = now_iso
            _save_b2c_customer_meta(cust, meta)
            updated_count += 1

        if cep_val or street_val or city_val:
            addr = db.query(Address).filter(Address.customer_id == cust.id).first()
            if not addr:
                addr = Address(
                    customer_id=cust.id,
                    street=street_val or "ENDEREÇO NÃO INFORMADO",
                    number=num_val,
                    complement=comp_val or None,
                    neighborhood=neigh_val or "",
                    city=city_val or "",
                    state=uf_val or "SP",
                    zip_code=cep_val or "",
                    type="MAIN",
                )
                db.add(addr)
            else:
                if street_val:
                    addr.street = street_val
                if num_val:
                    addr.number = num_val
                if comp_val:
                    addr.complement = comp_val
                if neigh_val:
                    addr.neighborhood = neigh_val
                if city_val:
                    addr.city = city_val
                if uf_val:
                    addr.state = uf_val
                if cep_val:
                    addr.zip_code = cep_val

    db.commit()
    return {
        "message": (
            f"Importação concluída: {created_count} novo(s) cliente(s) cadastrado(s) e "
            f"{updated_count} atualizado(s) com sucesso!"
        ),
        "created_count": created_count,
        "updated_count": updated_count,
        "skipped_count": len(skipped_rows),
        "skipped_rows": skipped_rows[:30],
    }


@router.get("/customers/{customer_id}/details")
def get_b2c_customer_360_details(
    customer_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Ficha 360º do Cliente B2C:
    - Dados cadastrais completos e endereço de entrega;
    - Histórico de Pedidos e Últimos Pedidos do cliente;
    - Cupons utilizados (auditoria de resgates + saldo residual) e cupons disponíveis atribuídos ao CPF/E-mail;
    - Histórico de Logins, Acessos, Recuperações de Senha e Aceites LGPD;
    - Alertas 'Avise-me' solicitados pelo cliente.
    """
    cid = _resolve_seller_company_id(current_user, company_id)
    cust = db.query(Customer).filter(Customer.id == customer_id, Customer.company_id == cid).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    cpf_digits = _clean_digits(cust.document)
    email_clean = (cust.email or "").strip().lower()
    addr = cust.addresses[0] if getattr(cust, "addresses", None) else None
    cust_meta = _parse_b2c_customer_meta(cust)

    # 1. Pedidos do Cliente no B2C
    order_filters = [Order.customer_id == cust.id]
    orders = (
        db.query(Order)
        .filter(Order.company_id == cid, Order.origin == "b2c_storefront", or_(*order_filters))
        .order_by(Order.created_at.desc())
        .all()
    )
    order_ids = [o.id for o in orders]
    reds_by_order: Dict[int, B2CCouponRedemption] = {}
    if order_ids:
        for r in (
            db.query(B2CCouponRedemption)
            .filter(B2CCouponRedemption.company_id == cid, B2CCouponRedemption.order_id.in_(order_ids))
            .all()
        ):
            if r.order_id:
                reds_by_order[r.order_id] = r

    serialized_orders = []
    for o in orders:
        norm_st = _normalize_b2c_order_status(o.status)
        o_meta = _parse_order_meta(o)
        red = reds_by_order.get(o.id)
        serialized_orders.append(
            {
                "id": o.id,
                "status": norm_st,
                "status_label": B2C_STATUS_LABELS.get(norm_st, norm_st),
                "subtotal": float(o.subtotal or 0),
                "freight": float(red.order_freight or 0) if red else float(o_meta.get("freight_value") or 0),
                "discount_applied": float(red.discount_applied or 0) if red else float(o.discount or 0),
                "difference_paid": float(red.difference_paid or 0) if red else float(o.total or 0),
                "total": float(o.total or 0),
                "coupon_code": (red.coupon_code if red else None) or o_meta.get("coupon_code") or "",
                "residual_coupon_code": (red.residual_coupon_code if red else None) or o_meta.get("residual_coupon_code") or "",
                "payment_method": o_meta.get("payment_method") or o.payment_condition or "PIX",
                "payment_gateway": o_meta.get("payment_gateway") or "",
                "horus_pedido_venda": o.horus_pedido_venda or o_meta.get("horus_pedido_venda") or "",
                "invoice_number": o.invoice_number or "",
                "tracking_code": o.tracking_code or "",
                "items_count": sum(int(it.quantity or 0) for it in (o.items or [])),
                "items": [
                    {
                        "id": it.id,
                        "sku": it.sku,
                        "ean_isbn": it.ean_isbn or it.sku,
                        "name": it.name,
                        "quantity": it.quantity,
                        "unit_price": float(it.unit_price or 0),
                        "total_price": float(it.total_price or 0),
                    }
                    for it in (o.items or [])
                ],
                "created_at": o.created_at.isoformat() if o.created_at else None,
            }
        )

    # 2. Cupons Utilizados (Redemptions) e Cupons Atribuídos ao Cliente
    red_filters = [B2CCouponRedemption.customer_id == cust.id]
    if len(cpf_digits) == 11:
        red_filters.append(B2CCouponRedemption.customer_cpf == cpf_digits)
    if email_clean:
        red_filters.append(func.lower(B2CCouponRedemption.customer_email) == email_clean)

    redemptions = (
        db.query(B2CCouponRedemption)
        .filter(B2CCouponRedemption.company_id == cid, or_(*red_filters))
        .order_by(B2CCouponRedemption.created_at.desc())
        .all()
    )
    serialized_redemptions = [
        {
            "id": r.id,
            "order_id": r.order_id,
            "coupon_code": r.coupon_code,
            "batch_name": r.batch.name if r.batch else None,
            "partner_company_name": r.batch.partner_company_name if r.batch else None,
            "order_subtotal": float(r.order_subtotal or 0),
            "order_freight": float(r.order_freight or 0),
            "discount_applied": float(r.discount_applied or 0),
            "previous_balance": float(r.previous_balance or 0),
            "remaining_balance": float(r.remaining_balance or 0),
            "residual_coupon_code": r.residual_coupon_code,
            "difference_paid": float(r.difference_paid or 0),
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in redemptions
    ]

    cp_filters = []
    if len(cpf_digits) == 11:
        cp_filters.append(B2CCoupon.assigned_cpf == cpf_digits)
    if email_clean:
        cp_filters.append(func.lower(B2CCoupon.assigned_email) == email_clean)

    assigned_coupons = []
    if cp_filters:
        for c in (
            db.query(B2CCoupon)
            .filter(B2CCoupon.company_id == cid, or_(*cp_filters))
            .order_by(B2CCoupon.created_at.desc())
            .all()
        ):
            assigned_coupons.append(
                {
                    "id": c.id,
                    "code": c.code,
                    "coupon_mode": c.coupon_mode,
                    "batch_name": c.batch.name if c.batch else "Cupom Avulso",
                    "discount_type": getattr(c, "discount_type", "FIXED_BRL") or "FIXED_BRL",
                    "initial_value": float(c.initial_value or 0),
                    "current_balance": float(c.current_balance or 0),
                    "used_amount": float(c.used_amount or 0),
                    "status": c.status,
                    "generated_child_code": c.generated_child_code,
                    "valid_until": c.valid_until.isoformat() if c.valid_until else None,
                    "used_at": c.used_at.isoformat() if c.used_at else None,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
            )

    # 3. Histórico de Logins / Acessos + Aceites LGPD
    login_history = list(cust_meta.get("login_history") if isinstance(cust_meta.get("login_history"), list) else [])
    lgpd_filters = [B2CLgpdConsent.customer_id == cust.id]
    if len(cpf_digits) == 11:
        lgpd_filters.append(B2CLgpdConsent.customer_cpf == cpf_digits)
    if email_clean:
        lgpd_filters.append(func.lower(B2CLgpdConsent.customer_email) == email_clean)

    lgpd_rows = (
        db.query(B2CLgpdConsent)
        .filter(B2CLgpdConsent.company_id == cid, or_(*lgpd_filters))
        .order_by(B2CLgpdConsent.accepted_at.desc())
        .limit(30)
        .all()
    )
    lgpd_consents = [
        {
            "id": l.id,
            "ip_address": l.ip_address or "",
            "user_agent": l.user_agent or "",
            "terms_version": l.terms_version or "v1.0",
            "marketing_opt_in": bool(l.marketing_opt_in),
            "accepted_at": l.accepted_at.isoformat() if l.accepted_at else None,
        }
        for l in lgpd_rows
    ]

    # 4. Alertas Avise-me
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    raw_cfg = getattr(settings, "b2c_showcases_config", None) if settings else None
    notifications = (
        raw_cfg.get("stock_notifications", [])
        if isinstance(raw_cfg, dict) and isinstance(raw_cfg.get("stock_notifications"), list)
        else []
    )
    cust_alerts = [
        n
        for n in notifications
        if isinstance(n, dict) and email_clean and str(n.get("email") or "").strip().lower() == email_clean
    ]

    return {
        "customer": {
            "id": cust.id,
            "name": cust.name,
            "cpf": cust.document or "",
            "email": cust.email or "",
            "phone": cust.phone or "",
            "has_password": bool(cust.password_hash),
            "origin": cust_meta.get("origin") or cust.segment or "B2C_STOREFRONT",
            "horus_cod_cli": cust.horus_cod_cli,
            "created_at": cust.created_at.isoformat() if cust.created_at else None,
            "updated_at": cust.updated_at.isoformat() if cust.updated_at else None,
            "last_login_at": cust_meta.get("last_login_at"),
            "address": {
                "zip_code": getattr(addr, "zip_code", "") if addr else "",
                "street": getattr(addr, "street", "") if addr else "",
                "number": getattr(addr, "number", "") if addr else "",
                "complement": getattr(addr, "complement", "") if addr else "",
                "neighborhood": getattr(addr, "neighborhood", "") if addr else "",
                "city": (getattr(addr, "city", "") if addr else "") or (cust.city or ""),
                "state": (getattr(addr, "state", "") if addr else "") or (cust.state or ""),
            },
        },
        "metrics": {
            "orders_count": len(serialized_orders),
            "total_spent": round(sum(float(o["total"] or 0) for o in serialized_orders), 2),
            "total_discount_coupons": round(sum(float(r["discount_applied"] or 0) for r in serialized_redemptions), 2),
            "coupons_used_count": len(serialized_redemptions),
            "assigned_coupons_count": len(assigned_coupons),
            "logins_count": len(login_history),
            "lgpd_consents_count": len(lgpd_consents),
        },
        "orders": serialized_orders,
        "coupon_redemptions": serialized_redemptions,
        "assigned_coupons": assigned_coupons,
        "login_history": login_history,
        "lgpd_consents": lgpd_consents,
        "stock_alerts": cust_alerts,
    }


@router.post("/customers/{customer_id}/send-password-reset")
def seller_send_b2c_customer_password_reset(
    customer_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Dispara diretamente pelo painel do Seller o e-mail de Recuperação / Criação de Senha para o cliente B2C.
    Ideal para clientes migrados via planilha Excel.
    """
    cid = _resolve_seller_company_id(current_user, company_id)
    cust = db.query(Customer).filter(Customer.id == customer_id, Customer.company_id == cid).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    if not cust.email or "@" not in cust.email:
        raise HTTPException(status_code=400, detail="Este cliente não possui um e-mail válido cadastrado.")

    req_data = B2CAuthForgotPasswordRequest(company_id=cid, identifier=cust.email)
    res = forgot_b2c_customer_password(data=req_data, db=db)
    _append_b2c_customer_login_event(
        cust,
        event_type="PASSWORD_RESET_SENT_BY_SELLER",
        detail=f"Token de acesso/recuperação enviado pelo painel para {cust.email}",
    )
    db.commit()
    return res


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
                smtp_from=settings.smtp_from_email or settings.smtp_username,
                to_email=target_alert["email"],
                subject=f"[{store_name}] {prod_title} voltou ao estoque!",
                html_content=html_body,
                use_ssl=bool(settings.smtp_use_ssl),
                bcc_email=settings.smtp_bcc_email,
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
    Verifica se o E-mail ou CPF já possui conta na loja do Seller ou dados vinculados a Cupom Corporativo,
    retornando prefill automático (nome, e-mail, telefone e endereço) para evitar digitação repetida.
    """
    cust = _find_b2c_customer_by_identifier(db, data.company_id, data.identifier)
    digits = _clean_digits(data.identifier)

    # Busca complementar em Cupons Corporativos nominais por CPF caso o cliente ainda não tenha cadastro completo
    coupon_name = ""
    coupon_email = ""
    if len(digits) == 11:
        cp = (
            db.query(B2CCoupon)
            .filter(
                B2CCoupon.company_id == data.company_id,
                B2CCoupon.assigned_cpf == digits,
            )
            .order_by(B2CCoupon.id.desc())
            .first()
        )
        if cp:
            coupon_name = (cp.assigned_name or "").strip()
            coupon_email = (cp.assigned_email or "").strip().lower()
        if not coupon_name or not coupon_email:
            batches = (
                db.query(B2CCouponBatch)
                .filter(B2CCouponBatch.company_id == data.company_id, B2CCouponBatch.active == True)
                .all()
            )
            for b in batches:
                if isinstance(b.eligible_cpfs_json, list):
                    for row in b.eligible_cpfs_json:
                        if isinstance(row, dict) and _clean_digits(row.get("cpf")) == digits:
                            coupon_name = coupon_name or str(row.get("name") or "").strip()
                            coupon_email = coupon_email or str(row.get("email") or "").strip().lower()
                            break

    if not cust:
        return {
            "exists": False,
            "has_password": False,
            "prefill": {
                "name": coupon_name,
                "email": coupon_email or (data.identifier.strip().lower() if "@" in data.identifier else ""),
                "cpf": digits if len(digits) == 11 else "",
                "phone": "",
            },
        }

    masked_email = ""
    if cust.email and "@" in cust.email:
        u_part, d_part = cust.email.split("@", 1)
        masked_email = f"{u_part[:2]}***@{d_part}"

    serialized = _serialize_b2c_customer(cust)
    clean_name = serialized.get("name") or ""
    if clean_name.upper().startswith("CLIENTE CPF"):
        clean_name = coupon_name
    clean_email = serialized.get("email") or ""
    if "@compraexpressa" in clean_email or "@checkout.vindi" in clean_email:
        clean_email = coupon_email

    return {
        "exists": True,
        "has_password": bool(cust.password_hash),
        "customer_name": clean_name or cust.name,
        "masked_email": masked_email,
        "prefill": {
            "name": clean_name,
            "email": clean_email,
            "cpf": serialized.get("cpf") or (digits if len(digits) == 11 else ""),
            "phone": serialized.get("phone") or "",
            "address": serialized.get("address") or {},
        },
        "customer": serialized if not cust.password_hash else None,
    }


@router.post("/public/auth/login")
def login_b2c_customer(
    data: B2CAuthLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    cust = _find_b2c_customer_by_identifier(db, data.company_id, data.identifier)
    if not cust:
        raise HTTPException(status_code=404, detail="Cadastro não encontrado para este E-mail ou CPF.")

    if cust.password_hash:
        if not security.verify_password(data.password, cust.password_hash):
            raise HTTPException(status_code=401, detail="Senha incorreta. Tente novamente ou clique em 'Esqueci minha senha'.")
        _append_b2c_customer_login_event(cust, event_type="LOGIN", request=request, detail="Login realizado com senha na Loja B2C")
    else:
        # First password definition for legacy B2C customer without password_hash
        if len(data.password.strip()) < 6:
            raise HTTPException(status_code=400, detail="Crie uma senha com pelo menos 6 caracteres.")
        cust.password_hash = security.get_password_hash(data.password.strip())
        _append_b2c_customer_login_event(cust, event_type="FIRST_ACCESS_PASSWORD_SET", request=request, detail="Definição de senha no Primeiro Acesso B2C")
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
    request: Request,
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
            segment="B2C_STOREFRONT",
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

    _append_b2c_customer_login_event(cust, event_type="REGISTER", request=request, detail="Cadastro / Ativação de conta na Loja B2C")

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
    raw_identifier = (data.identifier or "").strip()
    digits = _clean_digits(raw_identifier)
    cust = _find_b2c_customer_by_identifier(db, data.company_id, raw_identifier)

    # Se o cliente ainda não tiver ficha Customer ou estiver com e-mail sintético, busca em Cupons Corporativos / Lotes
    coupon_name = ""
    coupon_email = ""
    coupon_cpf = digits if len(digits) == 11 else ""
    if not cust or not cust.email or "@compraexpressa" in (cust.email or "") or "@checkout.vindi" in (cust.email or ""):
        cp_query = db.query(B2CCoupon).filter(B2CCoupon.company_id == data.company_id)
        if len(digits) == 11:
            cp_row = cp_query.filter(B2CCoupon.assigned_cpf == digits).order_by(B2CCoupon.id.desc()).first()
        elif "@" in raw_identifier:
            cp_row = (
                cp_query.filter(func.lower(B2CCoupon.assigned_email) == raw_identifier.lower())
                .order_by(B2CCoupon.id.desc())
                .first()
            )
        else:
            cp_row = None
        if cp_row:
            coupon_name = (cp_row.assigned_name or "").strip()
            coupon_email = (cp_row.assigned_email or "").strip().lower()
            coupon_cpf = _clean_digits(cp_row.assigned_cpf or coupon_cpf)

        if not coupon_email:
            batches = (
                db.query(B2CCouponBatch)
                .filter(B2CCouponBatch.company_id == data.company_id, B2CCouponBatch.active == True)
                .all()
            )
            for b in batches:
                if isinstance(b.eligible_cpfs_json, list):
                    for row in b.eligible_cpfs_json:
                        if not isinstance(row, dict):
                            continue
                        r_cpf = _clean_digits(row.get("cpf"))
                        r_email = str(row.get("email") or "").strip().lower()
                        if (len(digits) == 11 and r_cpf == digits) or (
                            "@" in raw_identifier and r_email == raw_identifier.lower()
                        ):
                            coupon_name = coupon_name or str(row.get("name") or "").strip()
                            coupon_email = coupon_email or r_email
                            coupon_cpf = coupon_cpf or r_cpf
                            break

        if coupon_email and "@" in coupon_email:
            if not cust:
                cust = Customer(
                    company_id=data.company_id,
                    name=coupon_name or "Cliente",
                    corporate_name=coupon_name or "Cliente",
                    document=coupon_cpf or digits or "00000000000",
                    email=coupon_email,
                    phone="",
                    customer_type="PF",
                    crm_status="ACTIVE",
                )
                db.add(cust)
                db.commit()
                db.refresh(cust)
            else:
                cust.email = coupon_email
                if coupon_name and cust.name.upper().startswith("CLIENTE CPF"):
                    cust.name = coupon_name
                db.commit()
                db.refresh(cust)

    if not cust or not cust.email or "@compraexpressa" in cust.email or "@checkout.vindi" in cust.email:
        raise HTTPException(
            status_code=404,
            detail="Nenhuma conta com e-mail válido foi encontrada para este CPF ou E-mail.",
        )

    recovery_code = "".join(secrets.choice(string.digits) for _ in range(6))
    key = f"{data.company_id}:{cust.id}"
    _B2C_PASSWORD_RESET_CODES[key] = {
        "code": recovery_code,
        "expires_at": _time.time() + 1800,  # 30 minutes
        "email": cust.email,
    }

    company = db.query(Company).filter(Company.id == data.company_id).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == data.company_id).first()
    store_name = company.name if company and company.name else "Loja Virtual"

    # Resolve canonical B2C store link for direct 1-click recovery
    b2c_domain = (getattr(company, "b2c_custom_domain", None) or "").strip()
    if not b2c_domain:
        slug = _slugify_store_name(store_name, data.company_id)
        tenant_base = "horusb2b.com.br" if getattr(company, "tenant_id", "") == "horus" else "cronuzb2b.com.br"
        b2c_domain = f"b2c-{slug}.{tenant_base}"
    if not b2c_domain.startswith("http"):
        b2c_domain = f"https://{b2c_domain}"
    recovery_link = f"{b2c_domain.rstrip('/')}/recuperar-senha?id={raw_identifier}&token={recovery_code}"

    u_part, d_part = cust.email.split("@", 1) if "@" in cust.email else (cust.email, "")
    masked_email = f"{u_part[:2]}***@{d_part}" if d_part else cust.email

    smtp_cfg = _resolve_smtp_settings(db, data.company_id)
    sent_via_smtp = False

    if smtp_cfg:
        try:
            from app.core.email import send_smtp_email
            send_smtp_email(
                smtp_host=smtp_cfg.smtp_host,
                smtp_port=int(smtp_cfg.smtp_port or 587),
                smtp_username=smtp_cfg.smtp_username,
                smtp_password=smtp_cfg.smtp_password,
                smtp_from=smtp_cfg.smtp_from_email or smtp_cfg.smtp_username,
                to_email=cust.email,
                subject=f"Token de Recuperação de Senha - {store_name}",
                html_content=(
                    f"<div style='font-family:sans-serif;max-width:560px;margin:0 auto;padding:28px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;'>"
                    f"<h2 style='color:#0f172a;margin-top:0;font-size:20px;'>Recuperação de Senha • {store_name}</h2>"
                    f"<p style='color:#475569;font-size:14px;line-height:1.6;'>Olá, <strong>{cust.name}</strong>! Recebemos uma solicitação para redefinir a senha da sua conta na loja <strong>{store_name}</strong>.</p>"
                    f"<p style='color:#475569;font-size:14px;'>Utilize o <strong>Token de Segurança de 6 dígitos</strong> abaixo na tela de recuperação:</p>"
                    f"<div style='background:#f8fafc;border:2px dashed #4f46e5;padding:18px;text-align:center;font-size:30px;font-weight:bold;letter-spacing:8px;color:#4f46e5;border-radius:12px;margin:20px 0;'>{recovery_code}</div>"
                    f"<div style='text-align:center;margin:22px 0;'>"
                    f"<a href='{recovery_link}' style='display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold;font-size:13px;'>Redefinir Minha Senha Agora</a>"
                    f"</div>"
                    f"<div style='background:#f1f5f9;border-radius:12px;padding:14px 16px;margin:18px 0;'>"
                    f"<p style='margin:0 0 6px 0;font-size:12px;font-weight:bold;color:#1e293b;'>🔒 Regras de Segurança para sua Nova Senha:</p>"
                    f"<ul style='margin:0;padding-left:18px;color:#475569;font-size:12px;line-height:1.6;'>"
                    f"<li>Mínimo de <strong>6 caracteres</strong>;</li>"
                    f"<li>Deve conter <strong>letras e números</strong> (combinação alfanumérica);</li>"
                    f"<li>Este token é de uso único e expira em <strong>30 minutos</strong>.</li>"
                    f"</ul>"
                    f"</div>"
                    f"<p style='color:#94a3b8;font-size:11px;margin-top:20px;'>Se você não solicitou a recuperação de senha, ignore este e-mail com segurança. Sua senha atual permanecerá inalterada.</p>"
                    f"</div>"
                ),
                use_ssl=bool(smtp_cfg.smtp_use_ssl),
                bcc_email=smtp_cfg.smtp_bcc_email,
            )
            sent_via_smtp = True
        except Exception as e:
            logger.warning(f"[B2C Forgot Password] Erro ao enviar SMTP: {e}")

    return {
        "status": "OK",
        "sent_via_smtp": sent_via_smtp,
        "email": masked_email,
        "dev_recovery_code": None if sent_via_smtp else recovery_code,
        "security_rules": [
            "Mínimo de 6 caracteres",
            "Pelo menos 1 letra (A-Z)",
            "Pelo menos 1 número (0-9)",
        ],
        "message": (
            f"Enviamos um Token de Segurança de 6 dígitos para o e-mail {masked_email}."
            if sent_via_smtp
            else f"Token de segurança gerado para {masked_email} (Ambiente Local / SMTP não configurado: {recovery_code})."
        ),
    }


@router.post("/public/auth/reset-password")
def reset_b2c_customer_password(
    data: B2CAuthResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    cust = _find_b2c_customer_by_identifier(db, data.company_id, data.identifier)
    if not cust:
        raise HTTPException(status_code=404, detail="Conta não encontrada para este CPF ou E-mail.")
    new_pwd = data.new_password.strip()
    if len(new_pwd) < 6 or not any(c.isalpha() for c in new_pwd) or not any(c.isdigit() for c in new_pwd):
        raise HTTPException(
            status_code=400,
            detail="Por segurança, a nova senha deve ter no mínimo 6 caracteres e conter pelo menos uma letra e um número.",
        )

    key = f"{data.company_id}:{cust.id}"
    entry = _B2C_PASSWORD_RESET_CODES.get(key)
    if not entry or _time.time() > float(entry.get("expires_at", 0)):
        raise HTTPException(
            status_code=400,
            detail="Token de recuperação expirado ou inválido. Solicite um novo token.",
        )
    if str(entry.get("code")).strip() != str(data.recovery_code).strip():
        raise HTTPException(status_code=400, detail="Token de segurança incorreto. Verifique os 6 dígitos enviados por e-mail.")

    cust.password_hash = security.get_password_hash(new_pwd)
    _append_b2c_customer_login_event(cust, event_type="PASSWORD_RESET_COMPLETED", request=request, detail="Senha redefinida via Token de Segurança")
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
        "assigned_name": coupon.assigned_name or "",
        "assigned_email": coupon.assigned_email or "",
        "assigned_cpf": coupon.assigned_cpf or "",
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
        final_email = req_email or f"cliente.{cpf_digits}@compraexpressa.com.br"
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
            street=req_street or "INFORMADO NA ETAPA DE PAGAMENTO",
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

    vindi_cfg_checkout_mode = (
        str((settings.b2c_showcases_config or {}).get("vindi_config", {}).get("integration_mode") or "").upper()
        if settings and isinstance(settings.b2c_showcases_config, dict)
        and isinstance(settings.b2c_showcases_config.get("vindi_config"), dict)
        else ""
    )

    if b2c_ch_mode.get("mode") == "PAYMENT_LINK" or vindi_cfg_checkout_mode == "PAYMENT_LINK" or req_payment_method == "PAYMENT_LINK":
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

    allow_zero_sale = _is_b2c_zero_balance_sale_enabled(settings)
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
            prod_sit = str(getattr(local_prod, "horus_situacao_item", None) or "").strip().upper()
            can_sell_zero = allow_zero_sale and (prod_sit not in _BLOCKED_B2C_SITUACOES)
            if avail_stock < req_qty and not can_sell_zero:
                sit_reason = f" (Situação no acervo: {prod_sit})" if prod_sit in _BLOCKED_B2C_SITUACOES else ""
                raise HTTPException(
                    status_code=400,
                    detail=f"O produto '{item.name}' não possui estoque suficiente (Saldo disponível: {avail_stock}){sit_reason}.",
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
                logger.warning(f"[B2C Checkout Vindi] Empresa {company.id}: {ve.message} | diag={ve.diagnostics}")
                raise HTTPException(
                    status_code=402,
                    detail=ve.friendly_customer_message(req_payment_method),
                )

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
            now_iso = datetime.now(timezone.utc).isoformat()
            init_status_label = "Pago / Aprovado" if order.status == "PAID" else "Aguardando Pagamento no Link Vindi"
            order_meta["payment_history"] = [
                {
                    "event": "PAYMENT_APPROVED" if order.status == "PAID" else "CHECKOUT_CREATED",
                    "timestamp": now_iso,
                    "at": now_iso,
                    "source": "CHECKOUT_LOJA",
                    "status_name": init_status_label,
                    "vindi_status_name": init_status_label,
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
    # Dispara e-mail automático de Pedido Realizado (WAITING_PAYMENT) ou Pagamento Aprovado (PAID)
    _send_b2c_order_email(db, order, event_status=norm_st)
    if norm_st == "PAID" and not order.horus_pedido_venda:
        h_cfg = _get_b2c_horus_order_config(settings, db=db, company_id=company.id)
        if h_cfg.get("enabled") and h_cfg.get("auto_send_on_paid"):
            try:
                await _send_b2c_order_to_horus(db, order, force=False)
            except Exception as e_horus:
                logger.warning(f"[B2C Checkout Auto Horus] Pedido #{order.id}: {e_horus}")
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
                "Pagamento aprovado! Seu pedido já foi confirmado com sucesso."
                if norm_st == "PAID"
                else (
                    "Sacola preparada! Redirecionando você para finalizar o pagamento..."
                    if effective_mode == "TRAY_REDIRECT"
                    else (
                        f"Pedido #{order.id} recebido com sucesso! Redirecionando para o ambiente seguro de pagamento..."
                        if vindi_payment_url
                        else (
                            f"Pedido #{order.id} recebido! Seu pagamento no cartão está sendo processado pela operadora."
                            if req_payment_method == "CREDIT_CARD"
                            else f"Pedido #{order.id} recebido! Utilize o QR Code ou código PIX abaixo para concluir o pagamento."
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
  <title>Redirecionando para o Ambiente Seguro de Pagamento...</title>
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
    <h3 style="margin:0 0 8px;font-size:16px;">Conectando ao Ambiente Seguro de Pagamento</h3>
    <p style="margin:0;font-size:13px;color:#64748b;">Aguarde um instante enquanto preparamos sua página de pagamento (R$ {float(amount):.2f})...</p>
    <form id="vindiForm" method="POST" action="{_html.escape(action_url)}">
      {inputs}
      <noscript><button type="submit">Continuar para o Pagamento</button></noscript>
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
        raise HTTPException(status_code=400, detail="A chave da operadora de pagamento ainda não foi preenchida para esta loja.")

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
        notification_url=vindi.resolve_webhook_url(base_url),
        return_url=vindi.resolve_store_home_url(base_url),
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
        raise HTTPException(status_code=404, detail="Pedido não localizado.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == order.company_id).first()
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    vindi_cfg = read_vindi_config(settings)
    vindi = VindiCheckoutClient(db, order.company_id)
    if not vindi.is_configured:
        raise HTTPException(status_code=400, detail="O ambiente de pagamento desta loja está temporariamente indisponível. Tente novamente em instantes.")

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
        notification_url=vindi.resolve_webhook_url(base_url),
        return_url=vindi.resolve_store_home_url(base_url),
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

    # Se o pedido já foi confirmado como PAGO e a consulta por token temporário (t...) retornou status_id=0, preserva o status aprovado
    already_paid = _normalize_b2c_order_status(order.status) in ("PAID", "SEPARATION", "FINALIZED", "DELIVERED")
    if already_paid and status_id == 0 and not tx_info.get("paid"):
        status_id = 6
        status_name = str(meta.get("vindi_status_name") or "Aprovada")
        tx_info = {**tx_info, "status_id": 6, "status_name": status_name, "paid": True}

    if token_tx:
        meta["vindi_token_transaction"] = str(token_tx)
        if not str(token_tx).startswith("t") or not order.external_id:
            order.external_id = str(token_tx)
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
            if v_email and (not cust_obj.email or "@checkout.vindi" in cust_obj.email or "@compraexpressa" in cust_obj.email):
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
                    v_num = str(va.get("number") or "S/N").strip()
                    v_comp = str(va.get("completion") or "").strip()
                    v_neigh = str(va.get("neighborhood") or "").strip()
                    v_city = str(va.get("city") or "").strip()
                    v_state = str(va.get("state") or "")[:2].upper()
                    v_zip = _clean_digits(str(va.get("postal_code") or ""))
                    meta["shipping_address"] = {
                        "street": v_street,
                        "number": v_num,
                        "complement": v_comp,
                        "neighborhood": v_neigh,
                        "city": v_city,
                        "state": v_state,
                        "zip_code": v_zip,
                    }
                    if v_city:
                        cust_obj.city = v_city
                    if v_state:
                        cust_obj.state = v_state
                    addr_obj = db.query(Address).filter(Address.customer_id == cust_obj.id).first()
                    if addr_obj:
                        addr_obj.street = v_street
                        addr_obj.number = v_num or addr_obj.number
                        addr_obj.complement = v_comp or addr_obj.complement
                        addr_obj.neighborhood = v_neigh or addr_obj.neighborhood
                        addr_obj.city = v_city or addr_obj.city
                        addr_obj.state = v_state or addr_obj.state
                        if v_zip:
                            addr_obj.zip_code = v_zip

    history: List[Dict[str, Any]] = meta.get("payment_history") if isinstance(meta.get("payment_history"), list) else []
    last_entry = history[-1] if history else {}
    sig = f"{status_id}:{resolved_pm}:{tx_info.get('paid')}"
    now_iso = datetime.now(timezone.utc).isoformat()
    ev_type = (
        "PAYMENT_APPROVED"
        if tx_info.get("paid")
        else ("PAYMENT_CANCELED" if tx_info.get("declined") else "STATUS_UPDATE")
    )
    if last_entry.get("sig") != sig:
        history.append(
            {
                "event": ev_type,
                "timestamp": now_iso,
                "at": now_iso,
                "source": source,
                "status_id": status_id,
                "status_name": status_name,
                "vindi_status_name": status_name,
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

    status_transitioned_to: Optional[str] = None
    if tx_info.get("paid") and _normalize_b2c_order_status(order.status) != "PAID":
        order.status = "PAID"
        order.confirmed_at = datetime.utcnow()
        status_transitioned_to = "PAID"
        red = (
            db.query(B2CCouponRedemption)
            .filter(B2CCouponRedemption.order_id == order.id)
            .first()
        )
        if red and red.status == "PENDING_PAYMENT":
            red.status = "COMPLETED"
    elif tx_info.get("declined") and _normalize_b2c_order_status(order.status) == "WAITING_PAYMENT":
        order.status = "CANCELED"
        status_transitioned_to = "CANCELED"

    _save_order_meta(order, meta)
    db.commit()
    _b2c_cache_clear(order.company_id)

    if status_transitioned_to in ("PAID", "CANCELED"):
        _send_b2c_order_email(db, order, event_status=status_transitioned_to)
    return {
        "order_id": order.id,
        "status": _normalize_b2c_order_status(order.status),
        "paid": bool(tx_info.get("paid")),
        "gateway_status": status_name,
        "payment_method": meta.get("payment_method"),
        "payment_history": meta.get("payment_history") or [],
    }


def _build_friendly_store_return_html(store_url: str, store_name: str = "Loja Oficial") -> str:
    import html as _html
    safe_url = _html.escape(store_url or "https://app.horusb2b.com.br")
    safe_name = _html.escape(store_name or "Loja Oficial")
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="2;url={safe_url}" />
  <title>Pagamento Recebido • {safe_name}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }}
    .card {{ background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 36px 28px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 12px 30px -8px rgba(15, 23, 42, 0.08); }}
    .icon {{ width: 56px; height: 56px; background: #ecfdf5; color: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; margin: 0 auto 16px; }}
    h2 {{ margin: 0 0 8px; font-size: 20px; font-weight: 800; color: #0f172a; }}
    p {{ margin: 0 0 24px; font-size: 14px; line-height: 1.5; color: #475569; }}
    .btn {{ display: inline-block; background: #059669; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 12px; transition: background 0.2s; }}
    .btn:hover {{ background: #047857; }}
  </style>
  <script>
    setTimeout(function() {{
      window.location.replace("{safe_url}");
    }}, 1500);
  </script>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h2>Obrigado pela sua compra!</h2>
    <p>Seu pagamento foi registrado com sucesso. Estamos redirecionando você de volta para a página inicial da <strong>{safe_name}</strong>...</p>
    <a class="btn" href="{safe_url}">Voltar para a Página Inicial</a>
  </div>
</body>
</html>"""


@router.api_route("/webhooks/vindi", methods=["GET", "POST"])
async def vindi_b2c_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Recebe notificações automáticas de pagamento (POST Webhook) e também redirecionamentos de retorno
    do navegador do consumidor final (GET/POST), atualizando o pedido B2C para PAID e redirecionando
    o cliente de forma amigável de volta para a página inicial da loja.
    """
    from fastapi.responses import HTMLResponse
    from app.integrators.vindi_checkout import VindiCheckoutClient

    payload: Dict[str, Any] = dict(request.query_params)
    if request.method == "POST":
        try:
            content_type = (request.headers.get("content-type") or "").lower()
            if "application/json" in content_type:
                body_data = await request.json()
                if isinstance(body_data, dict):
                    payload.update(body_data)
            else:
                form = await request.form()
                payload.update(dict(form))
        except Exception:
            pass

    # 1. Formato Vindi API v1: {"event": {"type": "bill_paid", "data": {"bill": {"code": "B2C-ORD-123-..."}}}}
    event = payload.get("event") if isinstance(payload.get("event"), dict) else {}
    ev_type = str(event.get("type") or "").lower()
    bill = ((event.get("data") or {}).get("bill") or {}) if isinstance(event.get("data"), dict) else {}
    bill_code = str(bill.get("code") or "")

    # 2. Formato Vindi Commerce / Yapay (suporta JSON aninhado, query string e POST form)
    tx_dict = payload.get("transaction") if isinstance(payload.get("transaction"), dict) else {}
    pay_dict = tx_dict.get("payment") if isinstance(tx_dict.get("payment"), dict) else {}
    order_number = str(
        payload.get("transaction[order_number]")
        or payload.get("order_number")
        or tx_dict.get("order_number")
        or payload.get("transaction[free]")
        or ""
    )
    status_id = str(
        payload.get("transaction[status_id]")
        or payload.get("status_id")
        or tx_dict.get("status_id")
        or ""
    ).strip()
    status_name_wh = str(
        payload.get("transaction[status_name]")
        or payload.get("status_name")
        or tx_dict.get("status_name")
        or ""
    ).strip()
    transaction_id_wh = (
        payload.get("transaction[transaction_id]")
        or payload.get("transaction_id")
        or tx_dict.get("transaction_id")
    )
    pm_name_wh = str(
        payload.get("transaction[payment][payment_method_name]")
        or payload.get("payment_method_name")
        or pay_dict.get("payment_method_name")
        or ""
    ).strip()
    pm_id_wh = str(
        payload.get("transaction[payment][payment_method_id]")
        or payload.get("payment_method_id")
        or pay_dict.get("payment_method_id")
        or ""
    ).strip()
    token_transaction = str(
        payload.get("token_transaction")
        or payload.get("transaction[token_transaction]")
        or payload.get("transaction[transaction_token]")
        or tx_dict.get("token_transaction")
        or tx_dict.get("transaction_token")
        or ""
    ).strip()

    logger.info(
        f"[Vindi Webhook] method={request.method} order_id_param={payload.get('order_id')} "
        f"order_number={order_number} status_id={status_id} token_transaction={token_transaction} "
        f"transaction_id={transaction_id_wh}"
    )

    target_order_id: Optional[int] = None
    is_paid = False

    raw_oid_param = str(payload.get("order_id") or "").strip()
    if raw_oid_param.isdigit():
        target_order_id = int(raw_oid_param)

    if ev_type == "bill_paid" or str(bill.get("status") or "").lower() == "paid":
        is_paid = True
        m = re.search(r"B2C-ORD-(\d+)", bill_code)
        if m and not target_order_id:
            target_order_id = int(m.group(1))
    else:
        m = re.search(r"CRZ-(\d+)", order_number)
        if m and not target_order_id:
            target_order_id = int(m.group(1))
        if status_id in ("6", "87"):
            is_paid = True

    order: Optional[Order] = None
    if target_order_id:
        order = db.query(Order).filter(Order.id == target_order_id, Order.origin == "b2c_storefront").first()
    if not order and token_transaction:
        order = (
            db.query(Order)
            .filter(Order.origin == "b2c_storefront", Order.external_id == token_transaction)
            .first()
        )

    sync_res: Optional[Dict[str, Any]] = None
    # 3. Consulta oficial por token_transaction na API Vindi Commerce (get_by_token)
    if order:
        meta = _parse_order_meta(order)
        if token_transaction:
            meta["vindi_token_transaction"] = token_transaction
            order.external_id = token_transaction
            _save_order_meta(order, meta)
            db.flush()

        tok_to_check = token_transaction or str(meta.get("vindi_token_transaction") or "").strip()
        tx_info: Dict[str, Any] = {}
        if tok_to_check:
            try:
                vindi = VindiCheckoutClient(db, order.company_id)
                if vindi.is_configured and vindi.credential_type == "VINDI_PAGAMENTOS":
                    tx_info = await vindi.get_transaction_by_token(tok_to_check)
            except Exception as e:
                logger.warning(f"[Vindi Webhook] Falha ao consultar get_by_token ({tok_to_check}): {e}")

        # Se o webhook enviou status explícito (ex: status_id=6 Aprovada) e get_by_token ainda não refletiu ou usou token temporário
        if status_id.isdigit() and int(status_id) > 0 and int(tx_info.get("status_id") or 0) == 0:
            resolved_wh_pm = "PAYMENT_LINK"
            if pm_id_wh == "27" or "pix" in pm_name_wh.lower():
                resolved_wh_pm = "PIX"
            elif pm_id_wh == "6" or "boleto" in pm_name_wh.lower():
                resolved_wh_pm = "BOLETO"
            elif pm_name_wh:
                resolved_wh_pm = f"CREDIT_CARD ({pm_name_wh})"
            tx_info = {
                **tx_info,
                "status_id": int(status_id),
                "status_name": status_name_wh or ("Aprovada" if is_paid else f"Status {status_id}"),
                "paid": is_paid,
                "declined": int(status_id) in (7, 24, 89),
                "transaction_id": transaction_id_wh or tx_info.get("transaction_id"),
                "token_transaction": tok_to_check,
                "resolved_payment_method": resolved_wh_pm,
            }
        elif is_paid and not tx_info.get("paid"):
            tx_info = {
                **tx_info,
                "status_id": int(status_id) if status_id.isdigit() else 6,
                "status_name": status_name_wh or "Aprovada",
                "paid": True,
                "transaction_id": transaction_id_wh or tx_info.get("transaction_id"),
                "token_transaction": tok_to_check,
            }

        if tx_info:
            sync_res = _sync_order_with_vindi_tx(db, order, tx_info, source="WEBHOOK_VINDI")
            if sync_res.get("paid") and not order.horus_pedido_venda:
                s_wh = db.query(CompanySettings).filter(CompanySettings.company_id == order.company_id).first()
                h_cfg_wh = _get_b2c_horus_order_config(s_wh, db=db, company_id=order.company_id)
                if h_cfg_wh.get("enabled") and h_cfg_wh.get("auto_send_on_paid"):
                    try:
                        await _send_b2c_order_to_horus(db, order, force=False)
                    except Exception as e_hw:
                        logger.warning(f"[Vindi Webhook Auto Horus] Pedido #{order.id}: {e_hw}")
    else:
        # Se o cliente foi redirecionado via GET sem parâmetros, sincroniza os pedidos B2C recentes pendentes
        recent_pending = (
            db.query(Order)
            .filter(Order.origin == "b2c_storefront", Order.status == "WAITING_PAYMENT")
            .order_by(Order.id.desc())
            .limit(5)
            .all()
        )
        for pending_ord in recent_pending:
            p_meta = _parse_order_meta(pending_ord)
            p_tok = str(p_meta.get("vindi_token_transaction") or "").strip()
            if p_tok:
                try:
                    vindi_p = VindiCheckoutClient(db, pending_ord.company_id)
                    if vindi_p.is_configured and vindi_p.credential_type == "VINDI_PAGAMENTOS":
                        tx_info_p = await vindi_p.get_transaction_by_token(p_tok)
                        _sync_order_with_vindi_tx(db, pending_ord, tx_info_p, source="RETORNO_CHECKOUT")
                except Exception:
                    pass
            if not order:
                order = pending_ord

    accept_hdr = (request.headers.get("accept") or "").lower()
    is_browser_redirect = request.method == "GET" or "text/html" in accept_hdr
    if is_browser_redirect:
        target_company_id = order.company_id if order else None
        if not target_company_id:
            last_b2c = (
                db.query(Order)
                .filter(Order.origin == "b2c_storefront")
                .order_by(Order.id.desc())
                .first()
            )
            if last_b2c:
                target_company_id = last_b2c.company_id
        vindi_nav = VindiCheckoutClient(db, target_company_id) if target_company_id else None
        store_url = (
            vindi_nav.resolve_store_home_url("https://app.horusb2b.com.br")
            if vindi_nav
            else "https://app.horusb2b.com.br"
        )
        store_name = vindi_nav.company_name if (vindi_nav and vindi_nav.company_name) else "Loja Oficial"
        return HTMLResponse(content=_build_friendly_store_return_html(store_url, store_name))

    if sync_res:
        return {"received": True, **sync_res}
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
        raise HTTPException(
            status_code=400,
            detail="A integração de pagamento ainda não está configurada para esta loja. Verifique a chave de acesso nas Configurações.",
        )

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
            f"Verificação concluída: {checked} pedido(s) consultado(s), {approved} pagamento(s) confirmado(s)!"
            if checked > 0
            else "Nenhum pedido pendente de confirmação de pagamento foi encontrado."
        ),
    }


# ==============================================================================
# PROXY HTTPS PARA LINKS ALTERNATIVOS DE CAPAS HTTP COM PORTA (ex: http://host:8060/capas)
# E MOTOR DE SEO DINÂMICO PARA O GOOGLE (SSR METADATA + JSON-LD + SITEMAP XML)
# ==============================================================================
@router.get("/public/cover-proxy")
async def proxy_external_cover_image(url: str = Query(..., description="URL HTTP/HTTPS da capa externa")):
    """
    Evita bloqueio de Mixed Content nos navegadores quando o Seller configura um servidor
    de capas em HTTP puro ou com porta customizada (ex: http://ip:8060/capas/97885...jpg).
    Tenta também variações de extensão (.jpg, .JPG, .png) caso o servidor IIS/Horus seja case-sensitive.
    """
    from fastapi.responses import Response
    import httpx

    raw_url = str(url or "").strip()
    if not raw_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL de capa inválida.")

    candidate_urls = [raw_url]
    if raw_url.endswith(".jpg"):
        base_no_ext = raw_url[:-4]
        candidate_urls.append(f"{base_no_ext}.JPG")
        candidate_urls.append(f"{base_no_ext}.png")
    elif raw_url.endswith(".JPG"):
        base_no_ext = raw_url[:-4]
        candidate_urls.append(f"{base_no_ext}.jpg")
        candidate_urls.append(f"{base_no_ext}.png")

    try:
        async with httpx.AsyncClient(timeout=7.0, follow_redirects=True, verify=False) as client:
            for cand in candidate_urls:
                try:
                    resp = await client.get(cand)
                    if resp.status_code == 200 and resp.content and len(resp.content) > 100:
                        ctype = (resp.headers.get("content-type") or "image/jpeg").lower()
                        if "text/html" in ctype:
                            continue
                        if not ctype.startswith("image/"):
                            ctype = "image/jpeg"
                        return Response(
                            content=resp.content,
                            media_type=ctype,
                            headers={"Cache-Control": "public, max-age=86400"},
                        )
                except Exception:
                    continue
    except Exception:
        pass

    raise HTTPException(status_code=404, detail="Capa não encontrada no servidor externo.")


def _resolve_b2c_company_by_host_or_slug(
    db: Session, hostname: Optional[str] = None, slug: Optional[str] = None, company_id: Optional[int] = None
) -> Optional[Company]:
    if company_id:
        return db.query(Company).filter(Company.id == company_id).first()

    clean_host = (hostname or "").split(":")[0].lower().strip()
    clean_slug = (slug or "").lower().strip()

    if clean_host and clean_host not in ("localhost", "127.0.0.1", "app.horusb2b.com.br", "cronuzb2b.com.br"):
        comp = (
            db.query(Company)
            .filter(func.lower(Company.b2c_custom_domain) == clean_host)
            .first()
        )
        if comp:
            return comp
        comp = (
            db.query(Company)
            .filter(
                (func.lower(Company.custom_domain) == clean_host)
                | (func.lower(Company.domain) == clean_host)
            )
            .first()
        )
        if comp:
            return comp
        if clean_host.startswith("b2c-"):
            clean_slug = clean_host.split(".")[0].replace("b2c-", "")

    target_slug = clean_slug or clean_host
    if target_slug:
        if target_slug.isdigit():
            comp = db.query(Company).filter(Company.id == int(target_slug)).first()
            if comp:
                return comp
        all_Wait = db.query(Company).filter(Company.active == True).all()
        for c in all_Wait:
            c_settings = db.query(CompanySettings).filter(CompanySettings.company_id == c.id).first()
            cfg = _build_b2c_appearance_config(c, c_settings, db)
            st_slug = (cfg.get("branding") or {}).get("store_slug") or _slugify_store_name(c.name, c.id)
            if st_slug.lower() == target_slug:
                return c
    return None


def _render_seo_template(tpl: str, mapping: Dict[str, str]) -> str:
    out = str(tpl or "")
    for k, v in mapping.items():
        out = out.replace(f"{{{k}}}", str(v or "").strip())
    out = re.sub(r"\s+\|\s+\|", " |", out)
    out = re.sub(r"\(\s*ISBN\s*\)", "", out)
    out = re.sub(r"\s{2,}", " ", out).strip(" |-")
    return out


@router.get("/public/seo-metadata")
def get_public_b2c_seo_metadata(
    hostname: Optional[str] = Query(None),
    slug: Optional[str] = Query(None),
    company_id: Optional[int] = Query(None),
    path: Optional[str] = Query(""),
    db: Session = Depends(get_db),
):
    """
    Gera metadados de SEO dinâmicos para o Google Search (Title, Description, Canonical, OpenGraph e Schema.org JSON-LD)
    para a Home, Páginas de Produto (com ISBN/EAN, Autor, Editora, Preço e Estoque), Categorias e Vitrines.
    """
    company = _resolve_b2c_company_by_host_or_slug(db, hostname=hostname, slug=slug, company_id=company_id)
    if not company:
        return {
            "title": "Loja Virtual Oficial",
            "description": "Catálogo completo de livros com envio para todo o Brasil.",
            "json_ld": None,
        }

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company.id).first()
    cfg = _build_b2c_appearance_config(company, settings, db)
    seo_cfg = cfg.get("seo_config") or {}
    branding = cfg.get("branding") or {}
    store_name = company.name

    base_url = (
        f"https://{company.b2c_custom_domain}"
        if getattr(company, "b2c_custom_domain", None)
        else f"https://app.horusb2b.com.br/loja/{branding.get('store_slug') or company.id}"
    )

    clean_path = str(path or "").strip("/")
    segments = [s for s in clean_path.split("/") if s]
    first = segments[0].lower() if len(segments) >= 1 else ""
    second = segments[1] if len(segments) >= 2 else ""

    title = _render_seo_template(seo_cfg.get("home_title") or f"{store_name} | Livraria e Loja Oficial", {"loja": store_name})
    description = _render_seo_template(
        seo_cfg.get("home_description") or f"Compre livros na loja oficial {store_name}.",
        {"loja": store_name},
    )
    og_image = branding.get("logo_url") or branding.get("hero_banner_url") or ""
    canonical_url = f"{base_url}/{clean_path}".rstrip("/") if clean_path else base_url

    json_ld: Any = {
        "@context": "https://schema.org",
        "@type": "BookStore",
        "name": store_name,
        "url": base_url,
        "potentialAction": {
            "@type": "SearchAction",
            "target": f"{base_url}/busca?q={{search_term_string}}",
            "query-input": "required name=search_term_string",
        },
    }

    if first in ("produto", "p") and second:
        clean_code = second.strip()
        prod = (
            db.query(Product)
            .filter(
                Product.company_id == company.id,
                (Product.ean_gtin == clean_code) | (Product.sku == clean_code),
            )
            .first()
        )
        if not prod and clean_code.isdigit():
            prod = db.query(Product).filter(Product.company_id == company.id, Product.id == int(clean_code)).first()

        if prod:
            isbn_val = str(prod.ean_gtin or prod.sku or "").strip()
            author_val = str(getattr(prod, "author", None) or prod.brand or store_name).strip()
            brand_val = str(prod.brand or store_name).strip()
            cat_val = str(prod.category.name if getattr(prod, "category", None) else (getattr(prod, "subject", None) or "Livros")).strip()
            price_val = float(prod.promotional_price or prod.base_price or 0)
            stock_qty = int(prod.stock_quantity or 0)
            synopsis = re.sub(r"<[^>]+>", " ", str(prod.short_description or prod.long_description or "")).strip()

            mapping = {
                "nome": prod.name,
                "isbn": isbn_val,
                "autor": author_val,
                "editora": brand_val,
                "categoria": cat_val,
                "preco": f"R$ {price_val:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
                "loja": store_name,
            }
            title = _render_seo_template(
                seo_cfg.get("product_title_template") or "{nome} - ISBN {isbn} | {autor} | {loja}",
                mapping,
            )
            desc_tpl = seo_cfg.get("product_description_template") or "Compre o livro {nome} (ISBN {isbn}) de {autor}, editora {editora} na {loja}."
            rendered_desc = _render_seo_template(desc_tpl, mapping)
            if synopsis:
                description = f"{rendered_desc} Sinopse: {synopsis[:180]}"
            else:
                description = rendered_desc

            if prod.cover_url:
                og_image = prod.cover_url

            canonical_url = f"{base_url}/produto/{isbn_val or prod.sku}"
            json_ld = {
                "@context": "https://schema.org",
                "@type": ["Product", "Book"],
                "name": prod.name,
                "sku": str(prod.sku or isbn_val),
                "isbn": isbn_val,
                "gtin13": isbn_val if len(isbn_val) == 13 and isbn_val.isdigit() else undefined_or_none(isbn_val),
                "description": description[:300],
                "image": og_image or undefined_or_none(None),
                "author": {"@type": "Person", "name": author_val},
                "publisher": {"@type": "Organization", "name": brand_val},
                "brand": {"@type": "Brand", "name": brand_val},
                "offers": {
                    "@type": "Offer",
                    "url": canonical_url,
                    "priceCurrency": "BRL",
                    "price": f"{price_val:.2f}",
                    "availability": "https://schema.org/InStock" if stock_qty > 0 else "https://schema.org/OutOfStock",
                    "seller": {"@type": "Organization", "name": store_name},
                },
            }
            json_ld = {k: v for k, v in json_ld.items() if v is not None}

    elif first in ("categoria", "c") and second:
        target_slug = _slugify_store_name(second, 0)
        cat_label = second.replace("-", " ").title()
        cat_desc = ""
        for c in (cfg.get("categories") or []):
            if str(c.get("slug") or "").lower() == target_slug or _slugify_store_name(c.get("label"), 0) == target_slug:
                cat_label = c.get("headline") or c.get("label") or cat_label
                cat_desc = c.get("description") or ""
                if c.get("banner_url"):
                    og_image = c.get("banner_url")
                break
        mapping = {"categoria": cat_label, "loja": store_name}
        title = _render_seo_template(
            seo_cfg.get("category_title_template") or "{categoria} - Livros em Oferta | {loja}",
            mapping,
        )
        description = cat_desc or _render_seo_template(
            seo_cfg.get("category_description_template") or "Explore os melhores livros de {categoria} na {loja}.",
            mapping,
        )

    elif first == "vitrine" and second:
        target_slug = _slugify_store_name(second, 0)
        sc_title = second.replace("-", " ").title()
        sc_sub = ""
        for sc in (cfg.get("showcases") or []):
            if str(sc.get("slug") or "").lower() == target_slug or str(sc.get("id") or "").lower() == second.lower():
                sc_title = sc.get("title") or sc_title
                sc_sub = sc.get("description") or sc.get("subtitle") or ""
                if sc.get("banner_url"):
                    og_image = sc.get("banner_url")
                break
        mapping = {"vitrine": sc_title, "subtitulo": sc_sub or sc_title, "loja": store_name}
        title = _render_seo_template(
            seo_cfg.get("showcase_title_template") or "{vitrine} | Seleção Especial {loja}",
            mapping,
        )
        description = sc_sub or _render_seo_template(
            seo_cfg.get("showcase_description_template") or "Confira a seleção especial {vitrine} na {loja}.",
            mapping,
        )

    return {
        "company_id": company.id,
        "store_name": store_name,
        "title": title,
        "description": description,
        "canonical_url": canonical_url,
        "og_image": og_image,
        "google_site_verification": seo_cfg.get("google_site_verification") or "",
        "json_ld": json_ld if seo_cfg.get("auto_json_ld", True) else None,
    }


def undefined_or_none(val: Any) -> Optional[Any]:
    return val if val else None


@router.get("/public/sitemap.xml")
def get_public_b2c_sitemap_xml(
    hostname: Optional[str] = Query(None),
    slug: Optional[str] = Query(None),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Gera o Sitemap XML dinâmico da Loja B2C com a Home, Categorias, Vitrines e todos os Produtos ativos (por ISBN/SKU)
    para indexação automática no Google Search Console.
    """
    from fastapi.responses import Response
    from xml.sax.saxutils import escape as xml_escape

    company = _resolve_b2c_company_by_host_or_slug(db, hostname=hostname, slug=slug, company_id=company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Loja não encontrada.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company.id).first()
    cfg = _build_b2c_appearance_config(company, settings, db)
    branding = cfg.get("branding") or {}
    base_url = (
        f"https://{company.b2c_custom_domain}"
        if getattr(company, "b2c_custom_domain", None)
        else f"https://app.horusb2b.com.br/loja/{branding.get('store_slug') or company.id}"
    ).rstrip("/")

    today_iso = date.today().isoformat()
    urls: List[tuple[str, str, str]] = [(base_url, "daily", "1.0")]

    for cat in (cfg.get("categories") or []):
        if isinstance(cat, dict) and cat.get("active") is not False:
            c_slug = cat.get("slug") or _slugify_store_name(cat.get("label") or cat.get("code"), 0)
            if c_slug:
                urls.append((f"{base_url}/categoria/{c_slug}", "daily", "0.9"))

    for sc in (cfg.get("showcases") or []):
        if isinstance(sc, dict) and sc.get("active") is not False:
            s_slug = sc.get("slug") or sc.get("id")
            if s_slug:
                urls.append((f"{base_url}/vitrine/{s_slug}", "daily", "0.8"))

    prods = (
        db.query(Product.sku, Product.ean_gtin)
        .filter(Product.company_id == company.id, Product.status == ProductStatus.ACTIVE)
        .limit(10000)
        .all()
    )
    for p in prods:
        code = str(p.ean_gtin or p.sku or "").strip()
        if code:
            urls.append((f"{base_url}/produto/{code}", "weekly", "0.8"))

    xml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for loc, freq, prio in urls:
        xml_lines.append(
            f"  <url><loc>{xml_escape(loc)}</loc><lastmod>{today_iso}</lastmod><changefreq>{freq}</changefreq><priority>{prio}</priority></url>"
        )
    xml_lines.append("</urlset>")

    return Response(content="\n".join(xml_lines), media_type="application/xml")

