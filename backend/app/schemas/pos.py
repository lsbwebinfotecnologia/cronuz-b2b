from pydantic import BaseModel, Field, model_validator
from typing import List, Optional, Any
from datetime import datetime
import json


class POSSessionCreate(BaseModel):
    title: str
    catalog_source: Optional[str] = "GENERAL"  # CONSIGNMENT, HORUS_CATALOG, CRONUZ_CATALOG, SPREADSHEET, HORUS_REALTIME, GENERAL
    source_reference: Optional[str] = None
    branch_id: Optional[int] = None
    validate_stock: Optional[bool] = True
    initial_cash_amount: Optional[float] = 0.00
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_document: Optional[str] = None
    notes: Optional[str] = None


class POSSessionCloseRequest(BaseModel):
    closed_cash_amount: Optional[float] = None  # Dinheiro apurado na gaveta
    closing_notes: Optional[str] = None


class POSSessionReopenRequest(BaseModel):
    supervisor_password: str


class POSSaleCancelRequest(BaseModel):
    supervisor_password: str
    reason: Optional[str] = None


class POSSessionResponse(BaseModel):
    id: int
    code: str
    title: str
    status: str
    catalog_source: str
    source_reference: Optional[str] = None
    branch_id: Optional[int] = None
    branch_name: Optional[str] = None
    validate_stock: bool = True
    initial_cash_amount: float = 0.00
    closed_cash_amount: Optional[float] = None
    expected_cash_amount: Optional[float] = None
    cash_difference: Optional[float] = None
    closing_notes: Optional[str] = None
    closed_by_user_id: Optional[int] = None
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_document: Optional[str] = None
    total_sales_count: int
    total_sales_amount: float
    products_count: Optional[int] = 0
    opened_at: datetime
    closed_at: Optional[datetime] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class POSSessionProductOut(BaseModel):
    id: Optional[int] = None
    session_id: Optional[int] = None
    barcode: str
    sku: Optional[str] = None
    title: str
    publisher: Optional[str] = None
    price: float
    stock: float
    horus_item_code: Optional[str] = None
    product_id: Optional[int] = None
    cover_url: Optional[str] = None
    source: Optional[str] = "SPREADSHEET"

    class Config:
        from_attributes = True


class POSSessionProductsListResponse(BaseModel):
    session_id: int
    count: int
    total: Optional[int] = None
    page: Optional[int] = 1
    total_pages: Optional[int] = 1
    catalog_source: Optional[str] = "GENERAL"
    items: List[POSSessionProductOut]


class POSSaleItemSchema(BaseModel):
    barcode: str = "SEM_BARRAS"
    sku: Optional[str] = None
    title: str = "Item PDV"
    publisher: Optional[str] = None
    quantity: float = 1.0
    unit_price: float = 0.0
    total_price: float = 0.0
    horus_item_code: Optional[str] = None
    product_id: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def _normalize_desktop_item_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if not d.get("barcode"):
            d["barcode"] = str(
                d.get("isbn")
                or d.get("ean")
                or d.get("sku")
                or d.get("product_id")
                or "SEM_BARRAS"
            ).strip()
        if not d.get("title"):
            d["title"] = str(d.get("name") or d.get("description") or "Item PDV").strip()
        if not d.get("publisher") and d.get("brand"):
            d["publisher"] = str(d.get("brand")).strip()
        if not d.get("horus_item_code"):
            sku_val = d.get("sku") or d.get("product_id")
            if sku_val is not None and str(sku_val).strip():
                d["horus_item_code"] = str(sku_val).strip()
        raw_pid = d.get("product_id")
        if raw_pid is not None:
            if isinstance(raw_pid, int):
                d["product_id"] = raw_pid
            elif isinstance(raw_pid, str) and raw_pid.strip().isdigit():
                d["product_id"] = int(raw_pid.strip())
            else:
                d["product_id"] = None
        if d.get("total_price") is None:
            try:
                d["total_price"] = round(float(d.get("unit_price") or 0.0) * float(d.get("quantity") or 1.0), 2)
            except Exception:
                d["total_price"] = 0.0
        return d


class POSSaleCreate(BaseModel):
    client_sale_uuid: str
    sale_number: Optional[str] = None
    session_id: Optional[int] = None
    customer_name: Optional[str] = "Consumidor Final"
    customer_document: Optional[str] = None
    customer_id: Optional[int] = None
    payment_method: str = "DINHEIRO"
    payment_details: Optional[str] = None
    subtotal: float
    discount: float = 0.0
    total_amount: float
    items_count: int = 1
    sold_at: datetime
    origin: str = "pdv_offline"
    sale_status: Optional[str] = "COMPLETED"
    notes: Optional[str] = None
    items: List[POSSaleItemSchema]

    @model_validator(mode="before")
    @classmethod
    def _normalize_desktop_sale_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        raw_st = str(d.get("sale_status") or d.get("status") or "").strip().upper()
        if raw_st in ("CANCELLED", "CANCELED", "CANCELADA"):
            d["sale_status"] = "CANCELLED"
        else:
            d["sale_status"] = "COMPLETED"
        if not d.get("sold_at"):
            d["sold_at"] = d.get("created_at") or datetime.utcnow().isoformat()
        if d.get("discount") is None and d.get("discount_amount") is not None:
            try:
                d["discount"] = float(d.get("discount_amount") or 0.0)
            except Exception:
                d["discount"] = 0.0
        if d.get("items_count") is None:
            items_list = d.get("items") or []
            try:
                cnt = int(sum(float(i.get("quantity") or 1) for i in items_list if isinstance(i, dict)))
                d["items_count"] = max(1, cnt) if items_list else 0
            except Exception:
                d["items_count"] = len(items_list)
        if not d.get("payment_details"):
            extra_details = {}
            if d.get("installments") is not None:
                extra_details["installments"] = d.get("installments")
            if d.get("payment_splits"):
                extra_details["payments"] = d.get("payment_splits")
            if d.get("cash_received") is not None:
                extra_details["cash_received"] = d.get("cash_received")
            if d.get("change_amount") is not None:
                extra_details["change_amount"] = d.get("change_amount")
            if extra_details:
                try:
                    d["payment_details"] = json.dumps(extra_details, ensure_ascii=False)
                except Exception:
                    pass
        return d


class POSSyncBatchRequest(BaseModel):
    sales: List[POSSaleCreate]
    session_id: Optional[int] = None


class POSSyncBatchResponse(BaseModel):
    status: str = "ok"
    total_received: int
    success_count: int
    already_synced_count: int
    synced: int = 0
    skipped_duplicates: int = 0
    failed_count: int
    synced_uuids: List[str]
    errors: List[dict]


class POSHorusSyncSendRequest(BaseModel):
    sale_ids: List[int] = Field(..., description="IDs das vendas do PDV selecionadas para sintetizar e enviar ao Horus")
    session_id: Optional[int] = None
    cod_cli: str = Field(..., description="Código do Cliente no Horus ERP (COD_CLI)")
    cod_transp: Optional[str] = Field(None, description="Código da Transportadora no Horus (opcional)")
    cod_param_fiscal: Optional[str] = Field(None, description="Código do Parâmetro Fiscal / CFOP no Horus")
    tipo_pedido: Optional[str] = Field("L", description="Tipo do pedido no Horus (L = Logística/B2C, V = Venda)")
    cod_metodo: Optional[str] = Field(None, description="Código do Método de Pagamento/Cobrança no Horus (opcional)")
    cod_tpo_end: Optional[str] = Field(None, description="Código do Tipo de Endereço do Cliente no Horus (opcional)")
    frete_emit_dest: Optional[str] = Field(None, description="Frete Emitente/Destinatário (E ou D, opcional)")
    status_envio_erp: Optional[str] = Field(None, description="Status para avançar o pedido após criação (ex: LEX, LAP)")
    max_order_amount: float = Field(10000.0, description="Valor máximo por pedido enviado ao Horus (padrão R$ 10.000,00)")
    obs_extra: Optional[str] = Field(None, description="Observação adicional para o pedido no Horus")


class POSHorusSyncDefaultsUpdateRequest(BaseModel):
    session_id: Optional[int] = Field(None, description="Se informado, salva parâmetros específicos para esta sessão; caso contrário, salva como padrão geral do seller")
    cod_cli: Optional[str] = Field(None, description="Código do Cliente padrão no Horus ERP (COD_CLI)")
    client_name: Optional[str] = Field(None, description="Nome do cliente validado no Horus")
    cod_transp: Optional[str] = Field(None, description="Código da Transportadora padrão no Horus (COD_TRANSP)")
    cod_param_fiscal: Optional[str] = Field("1", description="Código do Parâmetro Fiscal / CFOP no Horus")
    tipo_pedido: Optional[str] = Field("L", description="Tipo do pedido no Horus (L ou V)")
    cod_metodo: Optional[str] = Field(None, description="Código do Método de Pagamento/Cobrança no Horus")
    cod_tpo_end: Optional[str] = Field("1", description="Código do Tipo de Endereço do Cliente no Horus")
    frete_emit_dest: Optional[str] = Field("E", description="Frete Emitente/Destinatário (E ou D)")
    status_envio_erp: Optional[str] = Field(None, description="Status para avançar o pedido após criação (ex: LEX, LAP)")
    obs_extra: Optional[str] = Field(None, description="Observação adicional padrão para o pedido no Horus")



