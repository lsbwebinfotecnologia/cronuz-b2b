from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class EventVenue(Base):
    """Casas de Show e Locais de Eventos pré-cadastrados por Seller."""
    __tablename__ = "evm_venue"
    __table_args__ = (
        Index("idx_evm_venue_company_active", "company_id", "active"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(255), nullable=False)
    legal_name = Column(String(255), nullable=True)
    cnpj = Column(String(30), nullable=True)
    contact_name = Column(String(150), nullable=True)
    contact_phone = Column(String(40), nullable=True)
    contact_email = Column(String(255), nullable=True)

    zip_code = Column(String(20), nullable=True)
    street = Column(String(255), nullable=True)
    number = Column(String(50), nullable=True)
    complement = Column(String(150), nullable=True)
    neighborhood = Column(String(150), nullable=True)
    city = Column(String(150), nullable=True)
    state = Column(String(10), nullable=True)
    maps_url = Column(String(500), nullable=True)

    total_capacity = Column(Integer, nullable=True)
    age_rating = Column(String(20), nullable=False, default="18+", server_default="18+")
    default_sectors_json = Column(JSONB, nullable=True, default=list)
    access_notes = Column(Text, nullable=True)
    active = Column(Boolean, nullable=False, default=True, server_default="true")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])


class EventContact(Base):
    """Base CRM perpétua de convidados por Seller, blindada contra telefone duplicado (DDD + Número)."""
    __tablename__ = "evm_contact"
    __table_args__ = (
        UniqueConstraint("company_id", "phone_canonical", name="uq_evm_contact_comp_phone"),
        Index("idx_evm_contact_comp_base8", "company_id", "phone_base_8"),
        Index("idx_evm_contact_comp_name", "company_id", "full_name"),
        Index("idx_evm_contact_comp_cpf", "company_id", "cpf"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)

    full_name = Column(String(255), nullable=False)
    nickname = Column(String(100), nullable=True)

    phone_display = Column(String(30), nullable=False)
    phone_ddd = Column(String(4), nullable=False)
    phone_canonical = Column(String(20), nullable=False)  # Ex: 5511998887766
    phone_base_8 = Column(String(15), nullable=False)     # Ex: 1198887766 (DDD + 8 últimos dígitos)
    secondary_phone = Column(String(30), nullable=True)

    email = Column(String(255), nullable=True)
    cpf = Column(String(20), nullable=True)
    rg = Column(String(30), nullable=True)
    birth_date = Column(Date, nullable=True)
    gender = Column(String(30), nullable=True)

    instagram = Column(String(100), nullable=True)
    company_org = Column(String(200), nullable=True)
    job_title = Column(String(150), nullable=True)
    city = Column(String(150), nullable=True)
    state = Column(String(10), nullable=True)

    category_tag = Column(String(50), nullable=False, default="CONVIDADO", server_default="CONVIDADO")
    tags_json = Column(JSONB, nullable=True, default=list)
    origin_source = Column(String(40), nullable=False, default="MANUAL", server_default="MANUAL")
    origin_promoter_name = Column(String(150), nullable=True)

    whatsapp_valid = Column(Boolean, nullable=True)
    is_blocked = Column(Boolean, nullable=False, default=False, server_default="false")
    block_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    total_events_invited = Column(Integer, nullable=False, default=0, server_default="0")
    total_events_confirmed = Column(Integer, nullable=False, default=0, server_default="0")
    total_tickets_sent = Column(Integer, nullable=False, default=0, server_default="0")
    total_checkins = Column(Integer, nullable=False, default=0, server_default="0")
    total_no_shows = Column(Integer, nullable=False, default=0, server_default="0")
    last_event_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])


class ManagedEvent(Base):
    """Evento gerenciado com vínculo a Casa de Show pré-cadastrada ou endereço avulso."""
    __tablename__ = "evm_event"
    __table_args__ = (
        Index("idx_evm_event_comp_date", "company_id", "event_date"),
        Index("idx_evm_event_comp_status", "company_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)

    code = Column(String(40), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    subtitle = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="OPEN", server_default="OPEN")  # DRAFT, OPEN, LIST_CLOSED, ONGOING, FINISHED, CANCELLED

    event_date = Column(Date, nullable=False)
    doors_open_time = Column(String(10), nullable=True)
    start_time = Column(String(10), nullable=True)
    end_time = Column(String(10), nullable=True)
    list_cutoff_time = Column(String(10), nullable=True)

    venue_id = Column(Integer, ForeignKey("evm_venue.id", ondelete="SET NULL"), nullable=True, index=True)
    custom_location_name = Column(String(255), nullable=True)
    zip_code = Column(String(20), nullable=True)
    street = Column(String(255), nullable=True)
    number = Column(String(50), nullable=True)
    complement = Column(String(150), nullable=True)
    neighborhood = Column(String(150), nullable=True)
    city = Column(String(150), nullable=True)
    state = Column(String(10), nullable=True)
    maps_url = Column(String(500), nullable=True)

    age_rating = Column(String(20), nullable=False, default="18+", server_default="18+")
    dress_code = Column(String(150), nullable=True)
    banner_url = Column(String(500), nullable=True)
    flyer_vertical_url = Column(String(500), nullable=True)

    ticket_mode = Column(String(30), nullable=False, default="HYBRID", server_default="HYBRID")  # HYBRID, PDF_VAULT, NATIVE_QR
    dispatch_flow_mode = Column(String(30), nullable=False, default="BOTH_ALLOWED", server_default="BOTH_ALLOWED")  # RSVP_THEN_TICKET, DIRECT_TICKET, BOTH_ALLOWED
    auto_send_ticket_on_rsvp = Column(Boolean, nullable=False, default=False, server_default="false")

    max_guests_limit = Column(Integer, nullable=True)
    sectors_json = Column(JSONB, nullable=True, default=list)
    public_rsvp_token = Column(String(64), nullable=True, unique=True, index=True)
    public_rsvp_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    public_rsvp_max_slots = Column(Integer, nullable=True)

    created_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    venue = relationship("EventVenue", foreign_keys=[venue_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])


class EventGuest(Base):
    """Vínculo Convidado <-> Evento (Lista de Convidados, Cortesias, RSVP e Check-in)."""
    __tablename__ = "evm_event_guest"
    __table_args__ = (
        UniqueConstraint("event_id", "contact_id", name="uq_evm_event_guest_unique"),
        Index("idx_evm_guest_event_sector", "event_id", "sector_key"),
        Index("idx_evm_guest_event_status", "event_id", "invite_status", "ticket_delivery_status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("evm_event.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_id = Column(Integer, ForeignKey("evm_contact.id", ondelete="CASCADE"), nullable=False, index=True)

    sector_key = Column(String(60), nullable=False, default="VIP", server_default="VIP")
    access_type = Column(String(40), nullable=False, default="COURTESY_HYBRID", server_default="COURTESY_HYBRID")  # COURTESY_PDF, COURTESY_QR, PAID_PDF, NAME_ON_LIST, COURTESY_HYBRID
    companions_count = Column(Integer, nullable=False, default=0, server_default="0")
    companions_names = Column(Text, nullable=True)
    courtesy_value = Column(Float, nullable=False, default=0.0, server_default="0")

    promoter_name = Column(String(150), nullable=True)
    added_via = Column(String(40), nullable=False, default="DESKTOP_GRID", server_default="DESKTOP_GRID")

    invite_status = Column(String(30), nullable=False, default="PENDING", server_default="PENDING")  # PENDING, QUEUED_INVITE, INVITE_SENT, CONFIRMED, DECLINED, WAITLIST, CANCELLED
    rsvp_token = Column(String(64), nullable=False, unique=True, index=True)
    rsvp_responded_at = Column(DateTime(timezone=True), nullable=True)

    ticket_delivery_status = Column(String(30), nullable=False, default="NONE", server_default="NONE")  # NONE, RESERVED, QUEUED_TICKET, SENT, DELIVERED, SEND_ERROR
    ticket_sent_at = Column(DateTime(timezone=True), nullable=True)
    ticket_resend_count = Column(Integer, nullable=False, default=0, server_default="0")

    checkin_status = Column(String(30), nullable=False, default="PENDING", server_default="PENDING")  # PENDING, CHECKED_IN, NO_SHOW
    checked_in_at = Column(DateTime(timezone=True), nullable=True)
    checked_in_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)

    notes = Column(Text, nullable=True)
    added_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    event = relationship("ManagedEvent", foreign_keys=[event_id])
    contact = relationship("EventContact", foreign_keys=[contact_id])
    added_by = relationship("User", foreign_keys=[added_by_user_id])
    checked_in_by = relationship("User", foreign_keys=[checked_in_by_user_id])


class EventTicket(Base):
    """Cofre individual de Ingressos PDF (vindo de .ZIP ou fatiado de .PDF multipágina) com trava anti-duplicidade."""
    __tablename__ = "evm_ticket"
    __table_args__ = (
        UniqueConstraint("event_id", "file_sha256", name="uq_evm_ticket_event_sha256"),
        Index("idx_evm_ticket_event_status_sector", "event_id", "status", "sector_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("evm_event.id", ondelete="CASCADE"), nullable=False, index=True)

    batch_code = Column(String(50), nullable=False, index=True)
    sector_key = Column(String(60), nullable=False, default="VIP", server_default="VIP")
    ticket_number = Column(String(120), nullable=True, index=True)
    original_filename = Column(String(255), nullable=False)
    page_number = Column(Integer, nullable=False, default=1, server_default="1")

    file_rel_path = Column(String(500), nullable=False)
    file_size_bytes = Column(Integer, nullable=False, default=0, server_default="0")
    file_sha256 = Column(String(64), nullable=False, index=True)
    extracted_text_snippet = Column(String(600), nullable=True)
    face_value = Column(Float, nullable=False, default=0.0, server_default="0")

    status = Column(String(30), nullable=False, default="AVAILABLE", server_default="AVAILABLE")  # AVAILABLE, RESERVED, QUEUED, SENT, DELIVERED, SEND_ERROR, INVALIDATED
    assigned_guest_id = Column(Integer, ForeignKey("evm_event_guest.id", ondelete="SET NULL"), nullable=True, unique=True, index=True)
    assigned_at = Column(DateTime(timezone=True), nullable=True)
    assigned_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)

    sent_at = Column(DateTime(timezone=True), nullable=True)
    sent_to_phone = Column(String(30), nullable=True)
    whatsapp_message_id = Column(String(150), nullable=True)
    invalidated_reason = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    event = relationship("ManagedEvent", foreign_keys=[event_id])
    assigned_guest = relationship("EventGuest", foreign_keys=[assigned_guest_id], backref="assigned_ticket")
    assigned_by = relationship("User", foreign_keys=[assigned_by_user_id])


class EventInviteTemplate(Base):
    """Modelos de convites com imagem do evento, variáveis dinâmicas e saudações variadas (Spintax)."""
    __tablename__ = "evm_invite_template"
    __table_args__ = (
        Index("idx_evm_template_comp_event", "company_id", "event_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("evm_event.id", ondelete="CASCADE"), nullable=True, index=True)

    name = Column(String(180), nullable=False)
    template_purpose = Column(String(40), nullable=False, default="INVITE_RSVP", server_default="INVITE_RSVP")  # INVITE_RSVP, TICKET_DELIVERY, DIRECT_COMBO, NATIVE_QR_CARD, REMINDER
    image_url = Column(String(500), nullable=True)
    message_body = Column(Text, nullable=False)
    spintax_greetings_json = Column(JSONB, nullable=True, default=list)
    is_default = Column(Boolean, nullable=False, default=False, server_default="false")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    event = relationship("ManagedEvent", foreign_keys=[event_id])


class EventWhatsAppConfig(Base):
    """Configuração do gateway WhatsApp (Evolution API / Z-API / WAHA), regras anti-bloqueio e bot receptor vCard."""
    __tablename__ = "evm_whatsapp_config"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    provider = Column(String(30), nullable=False, default="EVOLUTION", server_default="EVOLUTION")  # EVOLUTION, ZAPI, WAHA
    enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    api_base_url = Column(String(500), nullable=True)
    instance_name = Column(String(150), nullable=True)
    api_key_token = Column(String(500), nullable=True)
    client_token = Column(String(500), nullable=True)
    webhook_secret = Column(String(120), nullable=False)
    connected_phone = Column(String(30), nullable=True)
    connection_status = Column(String(40), nullable=False, default="DISCONNECTED", server_default="DISCONNECTED")

    min_delay_seconds = Column(Integer, nullable=False, default=25, server_default="25")
    max_delay_seconds = Column(Integer, nullable=False, default=55, server_default="55")
    batch_size_before_pause = Column(Integer, nullable=False, default=20, server_default="20")
    batch_pause_seconds = Column(Integer, nullable=False, default=300, server_default="300")
    daily_limit = Column(Integer, nullable=False, default=250, server_default="250")
    allowed_start_hour = Column(String(5), nullable=False, default="09:00", server_default="09:00")
    allowed_end_hour = Column(String(5), nullable=False, default="21:30", server_default="21:30")
    simulate_typing = Column(Boolean, nullable=False, default=True, server_default="true")
    verify_whatsapp_before_send = Column(Boolean, nullable=False, default=True, server_default="true")
    queue_paused = Column(Boolean, nullable=False, default=False, server_default="false")

    vcard_capture_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    authorized_sender_phones_json = Column(JSONB, nullable=True, default=list)
    default_capture_event_id = Column(Integer, ForeignKey("evm_event.id", ondelete="SET NULL"), nullable=True)
    default_capture_sector = Column(String(60), nullable=False, default="VIP", server_default="VIP")
    pending_bot_context_json = Column(JSONB, nullable=True, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    default_capture_event = relationship("ManagedEvent", foreign_keys=[default_capture_event_id])


class EventDispatchQueue(Base):
    """Fila assíncrona cadenciada de disparo WhatsApp anti-bloqueio (convites, imagens, PDFs e QR nativo)."""
    __tablename__ = "evm_dispatch_queue"
    __table_args__ = (
        UniqueConstraint("company_id", "idempotency_key", name="uq_evm_dispatch_idemp"),
        Index("idx_evm_dispatch_status_sched", "status", "scheduled_for"),
        Index("idx_evm_dispatch_comp_event", "company_id", "event_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("evm_event.id", ondelete="CASCADE"), nullable=False, index=True)
    guest_id = Column(Integer, ForeignKey("evm_event_guest.id", ondelete="CASCADE"), nullable=False, index=True)
    ticket_id = Column(Integer, ForeignKey("evm_ticket.id", ondelete="SET NULL"), nullable=True, index=True)
    template_id = Column(Integer, ForeignKey("evm_invite_template.id", ondelete="SET NULL"), nullable=True)

    dispatch_mode = Column(String(40), nullable=False)  # INVITE_ONLY, TICKET_PDF_ONLY, COMBO_INVITE_AND_PDF, NATIVE_QR_CARD, REMINDER, RESEND_SAME_PDF
    idempotency_key = Column(String(160), nullable=False)
    recipient_phone = Column(String(30), nullable=False)
    recipient_name = Column(String(255), nullable=False)

    rendered_message = Column(Text, nullable=False)
    media_image_url = Column(String(500), nullable=True)
    pdf_rel_path = Column(String(500), nullable=True)
    pdf_delivery_filename = Column(String(255), nullable=True)

    status = Column(String(30), nullable=False, default="PENDING", server_default="PENDING")  # PENDING, PROCESSING, PAUSED, SENT, FAILED, CANCELLED
    priority = Column(Integer, nullable=False, default=20, server_default="20")
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    max_attempts = Column(Integer, nullable=False, default=3, server_default="3")
    scheduled_for = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    sent_at = Column(DateTime(timezone=True), nullable=True)
    provider_message_id = Column(String(150), nullable=True)
    error_message = Column(Text, nullable=True)

    created_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    event = relationship("ManagedEvent", foreign_keys=[event_id])
    guest = relationship("EventGuest", foreign_keys=[guest_id])
    ticket = relationship("EventTicket", foreign_keys=[ticket_id])
    template = relationship("EventInviteTemplate", foreign_keys=[template_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])


class EventAuditLog(Base):
    """Trilha imutável de auditoria do módulo de Eventos (alterações, importações, vínculos PDF, disparos e check-in)."""
    __tablename__ = "evm_audit_log"
    __table_args__ = (
        Index("idx_evm_audit_comp_created", "company_id", "created_at"),
        Index("idx_evm_audit_event_created", "event_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("evm_event.id", ondelete="CASCADE"), nullable=True, index=True)
    contact_id = Column(Integer, ForeignKey("evm_contact.id", ondelete="SET NULL"), nullable=True, index=True)
    guest_id = Column(Integer, ForeignKey("evm_event_guest.id", ondelete="SET NULL"), nullable=True, index=True)
    ticket_id = Column(Integer, ForeignKey("evm_ticket.id", ondelete="SET NULL"), nullable=True, index=True)

    entity_type = Column(String(40), nullable=False)
    action = Column(String(60), nullable=False)
    actor_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    actor_name = Column(String(150), nullable=True)
    source_channel = Column(String(40), nullable=False, default="WEB_DESKTOP", server_default="WEB_DESKTOP")

    summary = Column(String(500), nullable=False)
    details_json = Column(JSONB, nullable=True, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    event = relationship("ManagedEvent", foreign_keys=[event_id])
    actor = relationship("User", foreign_keys=[actor_user_id])
