from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from decimal import Decimal


# ─── Mesas ───────────────────────────────────────────────────────────────────

class CAFTableBase(BaseModel):
    number: str
    area: Optional[str] = "Salão Principal"
    capacity: Optional[int] = 4
    active: Optional[bool] = True


class CAFTableCreate(CAFTableBase):
    pass


class CAFTableUpdate(BaseModel):
    number: Optional[str] = None
    area: Optional[str] = None
    capacity: Optional[int] = None
    status: Optional[str] = None
    active: Optional[bool] = None


class CAFTableResponse(CAFTableBase):
    id: int
    company_id: int
    table_token: Optional[str] = None
    status: str
    active_tab_id: Optional[int] = None
    active_tab_number: Optional[str] = None
    active_tab_total: Optional[Decimal] = None
    has_kitchen_alert: Optional[bool] = False
    opened_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Modificadores / Opcionais ──────────────────────────────────────────────

class CAFModifierOptionBase(BaseModel):
    name: str
    additional_price: Decimal = Decimal("0.00")
    active: bool = True


class CAFModifierOptionCreate(CAFModifierOptionBase):
    pass


class CAFModifierOptionResponse(CAFModifierOptionBase):
    id: int
    group_id: int
    company_id: int

    class Config:
        from_attributes = True


class CAFModifierGroupBase(BaseModel):
    name: str
    min_selectable: int = 0
    max_selectable: int = 1
    active: bool = True


class CAFModifierGroupCreate(CAFModifierGroupBase):
    options: Optional[List[CAFModifierOptionCreate]] = []


class CAFModifierGroupResponse(CAFModifierGroupBase):
    id: int
    company_id: int
    options: List[CAFModifierOptionResponse] = []

    class Config:
        from_attributes = True


class CAFProductModifierLink(BaseModel):
    product_id: int
    group_ids: List[int]


# ─── Cadastro de Produtos do Cardápio ───────────────────────────────────────

class CAFMenuProductCreate(BaseModel):
    name: str
    category_name: Optional[str] = None
    category_id: Optional[int] = None
    base_price: Decimal
    cost_price: Optional[Decimal] = None
    stock_quantity: Optional[int] = 999
    sku: Optional[str] = None
    ean_gtin: Optional[str] = None
    cover_url: Optional[str] = None
    short_description: Optional[str] = None
    modifier_group_ids: Optional[List[int]] = []


class CAFMenuProductUpdate(BaseModel):
    name: Optional[str] = None
    category_name: Optional[str] = None
    category_id: Optional[int] = None
    base_price: Optional[Decimal] = None
    cost_price: Optional[Decimal] = None
    stock_quantity: Optional[int] = None
    sku: Optional[str] = None
    ean_gtin: Optional[str] = None
    cover_url: Optional[str] = None
    short_description: Optional[str] = None
    status: Optional[str] = None
    modifier_group_ids: Optional[List[int]] = None


class CAFMenuProductItemResponse(BaseModel):
    id: int
    company_id: int
    name: str
    sku: str
    ean_gtin: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    base_price: Decimal
    cost_price: Optional[Decimal] = None
    stock_quantity: int = 0
    cover_url: Optional[str] = None
    short_description: Optional[str] = None
    status: str
    modifier_group_ids: List[int] = []
    modifier_groups: List[CAFModifierGroupResponse] = []

    class Config:
        from_attributes = True


class CAFCategoryItemResponse(BaseModel):
    id: int
    name: str
    product_count: int = 0



# ─── Itens do Pedido ─────────────────────────────────────────────────────────

class SelectedModifier(BaseModel):
    group_id: int
    group_name: str
    option_id: int
    option_name: str
    price: Decimal = Decimal("0.00")


class CAFOrderItemCreate(BaseModel):
    product_id: Optional[int] = None
    barcode: Optional[str] = None
    sku: Optional[str] = None
    title: str
    quantity: Decimal = Decimal("1.00")
    unit_price: Decimal = Decimal("0.00")
    source: str = "CRONUZ"  # "CRONUZ" ou "HORUS"
    horus_item_code: Optional[str] = None
    selected_modifiers: Optional[List[SelectedModifier]] = []
    notes: Optional[str] = None
    requires_preparation: bool = True
    category_name: Optional[str] = None
    prep_sector: Optional[str] = None  # "BEVERAGE", "KITCHEN", "OTHER"
    send_now: Optional[bool] = True  # Se False, inicia como DRAFT


class CAFOrderItemResponse(BaseModel):
    id: int
    company_id: int
    tab_id: int
    product_id: Optional[int] = None
    barcode: Optional[str] = None
    sku: Optional[str] = None
    title: str
    source: str
    horus_item_code: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    modifiers_price: Decimal
    total_price: Decimal
    modifiers_json: Optional[List[Any]] = []
    notes: Optional[str] = None
    category_name: Optional[str] = None
    prep_sector: Optional[str] = "BEVERAGE"
    requires_preparation: bool
    prep_status: str
    prep_started_at: Optional[datetime] = None
    prep_finished_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    kitchen_alert: Optional[str] = None
    kitchen_alert_at: Optional[datetime] = None
    kitchen_alert_acknowledged: Optional[bool] = False
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CAFItemAlertRequest(BaseModel):
    message: str


class CAFDispatchSectorRequest(BaseModel):
    sector: Optional[str] = "ALL"  # "BEVERAGE", "KITCHEN", "OTHER", "ALL"


# ─── Comandas ────────────────────────────────────────────────────────────────

class CAFTabCreate(BaseModel):
    table_id: Optional[int] = None
    tab_number: str
    customer_name: Optional[str] = None
    customer_document: Optional[str] = None
    notes: Optional[str] = None


class CAFTabCancelRequest(BaseModel):
    reason: Optional[str] = None


class CAFTabResponse(BaseModel):
    id: int
    company_id: int
    table_id: Optional[int] = None
    table_number: Optional[str] = None
    tab_number: str
    customer_name: Optional[str] = None
    customer_document: Optional[str] = None
    waiter_user_id: Optional[int] = None
    waiter_name: Optional[str] = None
    status: str
    subtotal: Decimal
    discount: Decimal
    total_amount: Decimal
    opened_at: datetime
    closed_at: Optional[datetime] = None
    items: List[CAFOrderItemResponse] = []

    class Config:
        from_attributes = True


# ─── KDS (Fila do Barista) ──────────────────────────────────────────────────

class CAFKdsItemResponse(BaseModel):
    id: int
    tab_id: int
    tab_number: str
    table_number: Optional[str] = None
    customer_name: Optional[str] = None
    title: str
    quantity: Decimal
    notes: Optional[str] = None
    modifiers: Optional[List[Any]] = []
    category_name: Optional[str] = None
    prep_sector: Optional[str] = "BEVERAGE"
    prep_status: str
    created_at: datetime
    prep_started_at: Optional[datetime] = None
    prep_finished_at: Optional[datetime] = None
    elapsed_minutes: Optional[int] = None
    kitchen_alert: Optional[str] = None
    kitchen_alert_at: Optional[datetime] = None
    kitchen_alert_acknowledged: Optional[bool] = False


class CAFKdsUpdateStatus(BaseModel):
    prep_status: str  # PREPARING, READY, DELIVERED, CANCELLED
    cancel_reason: Optional[str] = None


# ─── Checkout PDV ────────────────────────────────────────────────────────────

class CAFCheckoutPaymentSplit(BaseModel):
    method: str  # DINHEIRO, PIX, DEBITO, CREDITO
    amount: Decimal


class CAFCheckoutRequest(BaseModel):
    session_id: int  # ID da sessão de caixa do PDV aberta
    payment_method: str = "PIX"  # DINHEIRO, PIX, DEBITO, CREDITO, MISTO
    payment_details: Optional[str] = None
    splits: Optional[List[CAFCheckoutPaymentSplit]] = []
    discount: Decimal = Decimal("0.00")
    customer_name: Optional[str] = None
    customer_document: Optional[str] = None


class CAFCheckoutResponse(BaseModel):
    tab_id: int
    sale_id: int
    sale_number: str
    total_amount: Decimal
    status: str
    message: str


# ─── Busca Híbrida ───────────────────────────────────────────────────────────

class CAFProductItem(BaseModel):
    id: Optional[int] = None
    source: str  # CRONUZ ou HORUS
    barcode: str
    sku: Optional[str] = None
    title: str
    price: Decimal
    stock: Decimal
    category: Optional[str] = None
    requires_preparation: bool = False
    modifier_groups: List[CAFModifierGroupResponse] = []


# ─── Cardápio Digital Público ────────────────────────────────────────────────

class CAFPublicModifierOption(BaseModel):
    id: int
    name: str
    additional_price: Decimal


class CAFPublicModifierGroup(BaseModel):
    id: int
    name: str
    min_options: int
    max_options: int
    is_required: bool
    options: List[CAFPublicModifierOption] = []


class CAFPublicProductItem(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    price: Decimal
    cover_url: Optional[str] = None
    category: Optional[str] = None
    is_available: bool = True
    modifier_groups: List[CAFPublicModifierGroup] = []


class CAFPublicCompanyInfo(BaseModel):
    id: int
    name: str
    trade_name: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None


class CAFPublicTableInfo(BaseModel):
    id: int
    number: str
    table_token: Optional[str] = None
    area: Optional[str] = None
    status: str


class CAFPublicMenuResponse(BaseModel):
    company: CAFPublicCompanyInfo
    table: Optional[CAFPublicTableInfo] = None
    categories: List[str] = []
    products: List[CAFPublicProductItem] = []


class CAFCallWaiterRequest(BaseModel):
    company_id: int
    table_token: str
    table_number: Optional[str] = None
    customer_name: Optional[str] = None
    notes: Optional[str] = None


class CAFCallWaiterResponse(BaseModel):
    success: bool
    message: str
