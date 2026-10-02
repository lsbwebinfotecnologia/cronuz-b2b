from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date

# ── TURMAS / SÉRIES ──
class SchoolClassBase(BaseModel):
    name: str
    grade: Optional[str] = None
    shift: Optional[str] = "MANHA"
    academic_year: Optional[int] = 2026
    active: Optional[bool] = True

class SchoolClassCreate(SchoolClassBase):
    pass

class SchoolClassUpdate(BaseModel):
    name: Optional[str] = None
    grade: Optional[str] = None
    shift: Optional[str] = None
    academic_year: Optional[int] = None
    active: Optional[bool] = None

class SchoolClassResponse(SchoolClassBase):
    id: int
    company_id: int
    school_customer_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── DETALHES DA ESCOLA ──
class SchoolDetailBase(BaseModel):
    inep_code: Optional[str] = None
    reference_code: Optional[str] = None # Código de pesquisa / referência interna
    principal_name: Optional[str] = None
    coordinator_name: Optional[str] = None
    pedagogical_contact_phone: Optional[str] = None
    pedagogical_contact_email: Optional[str] = None
    notes: Optional[str] = None

class SchoolDetailCreate(SchoolDetailBase):
    pass

class SchoolDetailUpdate(BaseModel):
    inep_code: Optional[str] = None
    reference_code: Optional[str] = None
    principal_name: Optional[str] = None
    coordinator_name: Optional[str] = None
    pedagogical_contact_phone: Optional[str] = None
    pedagogical_contact_email: Optional[str] = None
    notes: Optional[str] = None

class SchoolDetailResponse(SchoolDetailBase):
    id: int
    company_id: int
    customer_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── ATUALIZAÇÃO DE ESCOLA (DADOS GERAIS + CONTATO PEDAGÓGICO) ──
class SchoolUpdate(BaseModel):
    name: Optional[str] = None
    corporate_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    
    # Endereço
    street: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    
    # Detalhes pedagógicos
    inep_code: Optional[str] = None
    reference_code: Optional[str] = None
    principal_name: Optional[str] = None
    coordinator_name: Optional[str] = None
    pedagogical_contact_phone: Optional[str] = None
    pedagogical_contact_email: Optional[str] = None
    notes: Optional[str] = None


# ── CRIAÇÃO / CADASTRO DE ESCOLA (Integrada ao CRM Customer) ──
class SchoolCreate(BaseModel):
    name: str # Nome Fantasia
    corporate_name: Optional[str] = None # Razão Social
    document: str # CNPJ
    email: Optional[str] = None
    phone: Optional[str] = None
    
    # Endereço
    street: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    
    # Detalhes pedagógicos
    inep_code: Optional[str] = None
    reference_code: Optional[str] = None
    principal_name: Optional[str] = None
    coordinator_name: Optional[str] = None
    pedagogical_contact_phone: Optional[str] = None
    pedagogical_contact_email: Optional[str] = None
    notes: Optional[str] = None

    # Turmas iniciais opcionais
    initial_classes: Optional[List[str]] = [] # Ex: ["1º Ano A", "2º Ano A", "5º Ano B"]


class SchoolListItem(BaseModel):
    id: int # crm_customer.id
    name: str
    corporate_name: Optional[str] = None
    document: str
    reference_code: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    classes_count: int = 0
    active_events_count: int = 0
    coordinator_name: Optional[str] = None

    class Config:
        from_attributes = True


# ── EVENTOS / PASSEIOS / AMIGO SECRETO ──
class SchoolEventBase(BaseModel):
    title: str
    slug: str
    event_type: str = "PASSEIO" # PASSEIO, AMIGO_SECRETO, FEIRA_LIVRO, EVENTO_GERAL
    description: Optional[str] = None
    location_destination: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = "DRAFT" # DRAFT, OPEN, IN_PROGRESS, FINISHED, CANCELLED
    price: Optional[float] = 0.0
    max_capacity: Optional[int] = None
    showcase_id: Optional[int] = None
    banner_url: Optional[str] = None
    banner_mobile_url: Optional[str] = None
    logo_url: Optional[str] = None
    content_html: Optional[str] = None
    is_template: Optional[bool] = False
    parent_event_id: Optional[int] = None
    rules_config: Optional[Dict[str, Any]] = None

class SchoolEventCreate(SchoolEventBase):
    school_customer_id: Optional[int] = None

class SchoolEventUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    event_type: Optional[str] = None
    description: Optional[str] = None
    location_destination: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    price: Optional[float] = None
    max_capacity: Optional[int] = None
    showcase_id: Optional[int] = None
    banner_url: Optional[str] = None
    banner_mobile_url: Optional[str] = None
    logo_url: Optional[str] = None
    content_html: Optional[str] = None
    is_template: Optional[bool] = None
    parent_event_id: Optional[int] = None
    rules_config: Optional[Dict[str, Any]] = None
    school_customer_id: Optional[int] = None

class SchoolEventResponse(SchoolEventBase):
    id: int
    company_id: int
    school_customer_id: Optional[int] = None
    school_name: Optional[str] = None
    draw_performed_at: Optional[datetime] = None
    participants_count: int = 0
    gifts_purchased_count: int = 0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── PARTICIPANTES / ALUNOS ──
class EventParticipantEnroll(BaseModel):
    student_name: str
    student_birth_date: Optional[date] = None
    character_name: Optional[str] = None
    class_id: Optional[int] = None
    parent_name: str
    parent_cpf: str
    parent_phone: Optional[str] = None
    parent_email: Optional[str] = None
    wishlist_preferences: Optional[Dict[str, Any]] = None # Ex: {"genres": ["Aventura", "HQ", "Animais"], "suggested_books": []}
    medical_notes: Optional[str] = None

class EventParticipantResponse(BaseModel):
    id: int
    company_id: int
    event_id: int
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    student_name: str
    student_birth_date: Optional[date] = None
    character_name: Optional[str] = None
    parent_name: str
    parent_cpf: str
    parent_phone: Optional[str] = None
    parent_email: Optional[str] = None
    wishlist_preferences: Optional[Dict[str, Any]] = None
    access_token: str
    assigned_to_participant_id: Optional[int] = None
    assigned_student_name: Optional[str] = None # Só exibido se permitido ou na visão do participante
    assigned_character_name: Optional[str] = None
    draw_revealed_at: Optional[datetime] = None
    gift_status: str
    checkin_status: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── REVELAÇÃO DO AMIGO SECRETO (Página Mágica do Participante) ──
class SecretFriendRevealResponse(BaseModel):
    event_id: Optional[int] = None
    event_slug: Optional[str] = None
    my_student_name: str
    event_title: str
    event_type: str
    school_name: Optional[str] = None
    draw_performed: bool
    drawn_friend: Optional[Dict[str, Any]] = None # {"student_name": "Lucas", "class_name": "5º A", "wishlist_preferences": {...}}
    showcase_id: Optional[int] = None
    has_purchased_gift: bool = False
    gift_order_id: Optional[int] = None


class FindParticipantByCpfRequest(BaseModel):
    cpf: str



# ── CHECKOUT B2C DO EVENTO ──
class SchoolCheckoutItem(BaseModel):
    product_id: Optional[int] = None
    sku: Optional[str] = None
    name: str
    unit_price: float
    quantity: int = 1

class SchoolCheckoutRequest(BaseModel):
    event_id: int
    participant_token: str # Token mágico do pai comprador
    cpf: str
    customer_name: str
    email: str
    phone: Optional[str] = None
    items: List[SchoolCheckoutItem]
    payment_method: str = "EFI_PIX" # EFI_PIX, EFI_CREDIT_CARD
    card_token: Optional[str] = None
    card_number: Optional[str] = None
    card_holder: Optional[str] = None
    card_expiry: Optional[str] = None
    card_cvv: Optional[str] = None
    installments: Optional[int] = 1


class PayWithCardRequest(BaseModel):
    participant_token: Optional[str] = None
    card_number: str
    card_holder: str
    card_expiry: str # MM/AA
    card_cvv: str
    installments: Optional[int] = 1

