from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class InventoryStatusEnum(str, Enum):
    EM_ANDAMENTO = "EM_ANDAMENTO"
    AUDITANDO = "AUDITANDO"
    FINALIZADO = "FINALIZADO"
    CANCELADO = "CANCELADO"

class SessionStatusEnum(str, Enum):
    ABERTA = "ABERTA"
    CONCLUIDA = "CONCLUIDA"
    CANCELADA = "CANCELADA"

class SessionTypeEnum(str, Enum):
    CONTAGEM = "CONTAGEM"
    RECONTAGEM_AUDITORIA = "RECONTAGEM_AUDITORIA"

# --- Inventory Schemas ---
class InventoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    code: Optional[str] = None

class InventoryCreate(InventoryBase):
    supervisor_pin: Optional[str] = "1234"

class InventoryResponse(InventoryBase):
    id: int
    company_id: int
    code: str
    status: InventoryStatusEnum
    total_expected_skus: int
    total_scanned_items: Optional[int] = 0
    total_sessions: Optional[int] = 0
    open_sessions: Optional[int] = 0
    access_token: Optional[str] = None
    is_public_access_enabled: Optional[bool] = True
    supervisor_pin: Optional[str] = "1234"
    require_third_count: Optional[bool] = False
    created_by_user_id: Optional[int] = None
    finalized_by_user_id: Optional[int] = None
    finalized_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class PinVerifyRequest(BaseModel):
    pin: str

class PinVerifyResponse(BaseModel):
    success: bool
    message: str

class SessionItemSummary(BaseModel):
    isbn: str
    title: str
    publisher: Optional[str] = None
    category: Optional[str] = None
    total_quantity: int
    count_1_qty: int = 0
    count_2_qty: int = 0
    count_3_qty: int = 0
    has_divergence: bool = False
    last_scanned_at: Optional[datetime] = None

class SessionItemUpdateRequest(BaseModel):
    pin: str
    new_quantity: int

class SessionItemDeleteRequest(BaseModel):
    pin: str

# --- Inventory Item (Catalog / Expected) Schemas ---
class InventoryItemBase(BaseModel):
    isbn: str
    title: str
    publisher: Optional[str] = None
    category: Optional[str] = None
    default_location: Optional[str] = None

class InventoryItemResponse(InventoryItemBase):
    id: int
    inventory_id: int
    is_unregistered: bool = False
    scanned_quantity: Optional[int] = 0

    class Config:
        from_attributes = True

# --- Session Schemas ---
class InventorySessionCreate(BaseModel):
    location: str
    operator_name: Optional[str] = None
    is_audit: Optional[bool] = False
    mode: Optional[str] = None  # "continue" or "recount"

class PublicSessionCreate(BaseModel):
    location: str
    operator_name: str
    is_audit: Optional[bool] = False
    mode: Optional[str] = None  # "continue" or "recount"

class PublicInventoryInfo(BaseModel):
    id: int
    company_id: int
    company_name: str
    code: str
    name: str
    description: Optional[str] = None
    status: str
    total_expected_skus: int

class InventorySessionResponse(BaseModel):
    id: int
    inventory_id: int
    company_id: int
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    operator_name: Optional[str] = None
    location: str
    session_type: SessionTypeEnum
    round_number: int
    status: SessionStatusEnum
    total_scans: int
    started_at: datetime
    closed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class LocationCheckResponse(BaseModel):
    location: str
    exists: bool
    status: Optional[str] = None # "ABERTA", "CONCLUIDA", etc.
    last_operator_name: Optional[str] = None
    last_operator_id: Optional[int] = None
    last_counted_at: Optional[datetime] = None
    total_scans_previous: int = 0
    session_id: Optional[int] = None

# --- Scan Schemas ---
class InventoryScanItem(BaseModel):
    client_uuid: str
    isbn: str
    location: str
    quantity: int = 1
    operator_name: Optional[str] = None
    scanned_at: datetime
    title: Optional[str] = None
    publisher: Optional[str] = None

class InventoryScanBatchRequest(BaseModel):
    scans: List[InventoryScanItem]

class InventoryScanBatchResponse(BaseModel):
    synced_count: int
    ignored_duplicate_count: int
    session_total_scans: int

# --- Discrepancy / Auditoria Schemas ---
class DiscrepancyItemResponse(BaseModel):
    isbn: str
    title: str
    publisher: Optional[str] = None
    category: Optional[str] = None
    default_location: Optional[str] = None
    location: str
    count_1_qty: int = 0
    count_2_qty: int = 0
    count_3_qty: int = 0
    difference: int = 0
    has_divergence: bool = False
    validated_qty: int = 0
    operator_name: Optional[str] = None

class SkuSummaryResponse(BaseModel):
    isbn: str
    title: str
    publisher: Optional[str] = None
    category: Optional[str] = None
    default_location: Optional[str] = None
    locations_list: List[str] = []
    total_count_1: int = 0
    total_count_2: int = 0
    total_count_3: int = 0
    total_validated_qty: int = 0
    has_divergence: bool = False

class ToggleThirdCountRequest(BaseModel):
    require_third_count: bool

class AuditAdjustmentRequest(BaseModel):
    pin: str
    location: str
    isbn: str
    round_number: Optional[int] = None
    new_quantity: int

class InventoryItemUpdateRequest(BaseModel):
    title: Optional[str] = None
    publisher: Optional[str] = None
    category: Optional[str] = None

class InventoryStatusUpdateRequest(BaseModel):
    status: str
    password: str

class SkuQuantityAdjustRequest(BaseModel):
    new_quantity: int
    location: Optional[str] = None
    pin: Optional[str] = None

class SessionCancelRequest(BaseModel):
    pin_or_password: str
    reason: Optional[str] = None

class BulkCancelEmptySessionsRequest(BaseModel):
    pin_or_password: str

class SkuCancelScansRequest(BaseModel):
    pin_or_password: str



