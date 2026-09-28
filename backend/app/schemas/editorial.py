from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime, date

# ── Pipeline Schemas ──────────────────────────────────────────────────────────

class PipelineBase(BaseModel):
    name: str = Field(..., max_length=150)
    description: Optional[str] = None
    color: str = Field("#6366f1", max_length=30)
    is_default: bool = False
    is_active: bool = True

class PipelineCreate(PipelineBase):
    pass

class PipelineUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=150)
    description: Optional[str] = None
    color: Optional[str] = Field(None, max_length=30)
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None

class StageResponse(BaseModel):
    id: int
    company_id: int
    pipeline_id: int
    name: str
    description: Optional[str] = None
    color: str
    order_index: int
    sla_days: int
    is_initial: bool
    is_final: bool
    created_at: Optional[datetime] = None
    projects_count: Optional[int] = 0

    class Config:
        from_attributes = True

class PipelineResponse(PipelineBase):
    id: int
    company_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    stages: List[StageResponse] = []
    projects_count: Optional[int] = 0

    class Config:
        from_attributes = True

# ── Stage Schemas ─────────────────────────────────────────────────────────────

class StageCreate(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    color: str = Field("#3b82f6", max_length=30)
    order_index: Optional[int] = 0
    sla_days: int = 0
    is_initial: bool = False
    is_final: bool = False

class StageUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    color: Optional[str] = Field(None, max_length=30)
    order_index: Optional[int] = None
    sla_days: Optional[int] = None
    is_initial: Optional[bool] = None
    is_final: Optional[bool] = None

class StageReorderItem(BaseModel):
    stage_id: int
    order_index: int

class StageReorderPayload(BaseModel):
    stages: List[StageReorderItem]

# ── Task Schemas ──────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str = Field(..., max_length=255)
    stage_id: Optional[int] = None
    order_index: Optional[int] = 0

class TaskResponse(BaseModel):
    id: int
    project_id: int
    stage_id: Optional[int] = None
    title: str
    is_completed: bool
    completed_at: Optional[datetime] = None
    completed_by_user_id: Optional[int] = None
    completed_by_name: Optional[str] = None
    order_index: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ── File Schemas ──────────────────────────────────────────────────────────────

class FileResponse(BaseModel):
    id: int
    project_id: int
    stage_id: Optional[int] = None
    file_name: str
    file_path: str
    file_size: int
    file_type: Optional[str] = None
    uploaded_by_user_id: Optional[int] = None
    uploaded_by_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ── History Schemas ───────────────────────────────────────────────────────────

class HistoryResponse(BaseModel):
    id: int
    project_id: int
    from_stage_id: Optional[int] = None
    from_stage_name: Optional[str] = None
    to_stage_id: Optional[int] = None
    to_stage_name: Optional[str] = None
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    action: str
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ── Professional Schemas ──────────────────────────────────────────────────────

class ProfessionalCreate(BaseModel):
    name: str = Field(..., max_length=150)
    specialty: str = Field(..., max_length=50) # REVISAO, DIAGRAMACAO, CAPA, ILUSTRACAO, LEITURA_CRITICA, TRADUCAO, GRAFICA, OUTRO
    email: Optional[str] = None
    phone: Optional[str] = None
    pix_key: Optional[str] = None
    pix_type: Optional[str] = "ALEATORIA"
    rate_type: Optional[str] = "UNITARIO"
    default_rate: float = 0.0
    rating: int = 5
    portfolio_url: Optional[str] = None
    notes: Optional[str] = None

class ProfessionalUpdate(BaseModel):
    name: Optional[str] = None
    specialty: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    pix_key: Optional[str] = None
    pix_type: Optional[str] = None
    rate_type: Optional[str] = None
    default_rate: Optional[float] = None
    rating: Optional[int] = None
    portfolio_url: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

class ProfessionalResponse(BaseModel):
    id: int
    company_id: int
    name: str
    specialty: str
    email: Optional[str] = None
    phone: Optional[str] = None
    pix_key: Optional[str] = None
    pix_type: Optional[str] = None
    rate_type: Optional[str] = None
    default_rate: float = 0.0
    rating: int = 5
    portfolio_url: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    projects_count: int = 0
    total_paid: float = 0.0

    class Config:
        from_attributes = True

# ── Project Cost / Service Schemas ────────────────────────────────────────────

class ProjectCostCreate(BaseModel):
    stage_id: Optional[int] = None
    professional_id: Optional[int] = None
    service_type: str = Field(..., max_length=50)
    description: str = Field(..., max_length=255)
    unit_type: str = "FECHADO" # PAGINA, LAUDA, EXEMPLAR, FECHADO, HORA
    quantity: float = 1.0
    unit_value: float = 0.0
    payment_status: Optional[str] = "ORCADO"
    notes: Optional[str] = None

class ProjectCostUpdate(BaseModel):
    stage_id: Optional[int] = None
    professional_id: Optional[int] = None
    service_type: Optional[str] = None
    description: Optional[str] = None
    unit_type: Optional[str] = None
    quantity: Optional[float] = None
    unit_value: Optional[float] = None
    actual_total: Optional[float] = None
    payment_status: Optional[str] = None
    paid_at: Optional[datetime] = None
    invoice_number: Optional[str] = None
    notes: Optional[str] = None

class ProjectCostResponse(BaseModel):
    id: int
    project_id: int
    stage_id: Optional[int] = None
    stage_name: Optional[str] = None
    professional_id: Optional[int] = None
    professional_name: Optional[str] = None
    professional_pix: Optional[str] = None
    service_type: str
    description: str
    unit_type: str
    quantity: float
    unit_value: float
    estimated_total: float
    actual_total: float
    payment_status: str
    paid_at: Optional[datetime] = None
    invoice_number: Optional[str] = None
    notes: Optional[str] = None
    order_index: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ── Pipeline Template Schemas ─────────────────────────────────────────────────

class PipelineTemplateResponse(BaseModel):
    id: int
    name: str
    category: str
    description: Optional[str] = None
    color: str
    stages: List[Any]
    default_services: Optional[List[Any]] = None

    class Config:
        from_attributes = True

# ── Project Schemas ───────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    pipeline_id: int
    stage_id: Optional[int] = None # Se vazio, usa a primeira etapa do pipeline
    title: str = Field(..., max_length=255)
    subtitle: Optional[str] = None
    format: str = Field("LIVRO_FISICO", max_length=50)
    edition: Optional[str] = None
    volume: Optional[str] = None
    isbn: Optional[str] = None
    barcode: Optional[str] = None
    synopsis: Optional[str] = None
    cover_url: Optional[str] = None
    priority: str = Field("MEDIUM", max_length=20)
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    responsible_user_id: Optional[int] = None
    author_id: Optional[int] = None
    horus_cod_item: Optional[int] = None
    visible_to_author: bool = False
    estimated_pages: Optional[int] = None
    estimated_cost: float = 0.0
    tiragem: int = 1000
    preco_capa_sugerido: float = 0.0
    margem_estimada_percentual: float = 0.0
    internal_notes: Optional[str] = None

class ProjectUpdate(BaseModel):
    pipeline_id: Optional[int] = None
    stage_id: Optional[int] = None
    title: Optional[str] = Field(None, max_length=255)
    subtitle: Optional[str] = None
    format: Optional[str] = Field(None, max_length=50)
    edition: Optional[str] = None
    volume: Optional[str] = None
    isbn: Optional[str] = None
    barcode: Optional[str] = None
    synopsis: Optional[str] = None
    cover_url: Optional[str] = None
    priority: Optional[str] = Field(None, max_length=20)
    status: Optional[str] = Field(None, max_length=20)
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    responsible_user_id: Optional[int] = None
    author_id: Optional[int] = None
    horus_cod_item: Optional[int] = None
    visible_to_author: Optional[bool] = None
    estimated_pages: Optional[int] = None
    estimated_cost: Optional[float] = None
    tiragem: Optional[int] = None
    preco_capa_sugerido: Optional[float] = None
    margem_estimada_percentual: Optional[float] = None
    custo_unitario_exemplar: Optional[float] = None
    custo_total_orcado: Optional[float] = None
    custo_total_realizado: Optional[float] = None
    internal_notes: Optional[str] = None

class ProjectMoveStagePayload(BaseModel):
    to_stage_id: int
    notes: Optional[str] = None

class ProjectCardResponse(BaseModel):
    id: int
    company_id: int
    local_id: int
    pipeline_id: int
    stage_id: int
    stage_name: Optional[str] = None
    stage_color: Optional[str] = None
    title: str
    subtitle: Optional[str] = None
    format: str
    isbn: Optional[str] = None
    cover_url: Optional[str] = None
    priority: str
    status: str
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    stage_entered_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    days_in_stage: Optional[int] = 0
    is_overdue: Optional[bool] = False
    responsible_user_id: Optional[int] = None
    responsible_user_name: Optional[str] = None
    author_id: Optional[int] = None
    author_name: Optional[str] = None
    horus_cod_item: Optional[int] = None
    visible_to_author: bool = False
    tasks_total: int = 0
    tasks_completed: int = 0
    files_count: int = 0
    tiragem: int = 1000
    custo_unitario_exemplar: float = 0.0
    custo_total_orcado: float = 0.0
    custo_total_realizado: float = 0.0
    preco_capa_sugerido: float = 0.0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ProjectDetailResponse(ProjectCardResponse):
    edition: Optional[str] = None
    volume: Optional[str] = None
    barcode: Optional[str] = None
    synopsis: Optional[str] = None
    estimated_pages: Optional[int] = None
    estimated_cost: float = 0.0
    margem_estimada_percentual: float = 0.0
    internal_notes: Optional[str] = None
    updated_at: Optional[datetime] = None
    costs: List[ProjectCostResponse] = []
    tasks: List[TaskResponse] = []
    files: List[FileResponse] = []
    history: List[HistoryResponse] = []
