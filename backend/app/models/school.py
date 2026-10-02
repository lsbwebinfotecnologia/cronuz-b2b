from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date, Boolean, Text, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class SchoolDetail(Base):
    __tablename__ = "sch_school_detail"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    
    inep_code = Column(String(50), nullable=True)
    reference_code = Column(String(100), nullable=True, index=True) # Código de pesquisa / referência interna
    principal_name = Column(String(255), nullable=True)
    coordinator_name = Column(String(255), nullable=True)
    pedagogical_contact_phone = Column(String(50), nullable=True)
    pedagogical_contact_email = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    company = relationship("Company", foreign_keys=[company_id])
    customer = relationship("Customer", foreign_keys=[customer_id], backref="school_detail")


class SchoolClass(Base):
    __tablename__ = "sch_class"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    school_customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="CASCADE"), nullable=False, index=True)
    
    name = Column(String(100), nullable=False) # Ex: "5º Ano A"
    grade = Column(String(100), nullable=True) # Ex: "Fundamental I"
    shift = Column(String(50), default="MANHA", nullable=False) # MANHA, TARDE, INTEGRAL, NOITE
    academic_year = Column(Integer, nullable=False, default=2026, index=True)
    active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    company = relationship("Company", foreign_keys=[company_id])
    school = relationship("Customer", foreign_keys=[school_customer_id], backref="classes")


class SchoolEvent(Base):
    __tablename__ = "sch_event"
    __table_args__ = (
        Index('idx_sch_event_slug_comp', 'company_id', 'slug'),
        Index('idx_sch_event_type_status', 'company_id', 'event_type', 'status'),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    school_customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="SET NULL"), nullable=True, index=True)
    
    title = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=False) # Para URL amigável vitrine
    event_type = Column(String(50), default="PASSEIO", nullable=False) # PASSEIO, AMIGO_SECRETO, FEIRA_LIVRO, EVENTO_GERAL
    description = Column(Text, nullable=True)
    location_destination = Column(String(255), nullable=True)
    
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    
    status = Column(String(50), default="DRAFT", nullable=False) # DRAFT, OPEN, IN_PROGRESS, FINISHED, CANCELLED
    price = Column(Float, default=0.0, nullable=False)
    max_capacity = Column(Integer, nullable=True)
    
    showcase_id = Column(Integer, nullable=True)
    banner_url = Column(String(500), nullable=True)
    banner_mobile_url = Column(String(500), nullable=True)
    logo_url = Column(String(500), nullable=True)
    content_html = Column(Text, nullable=True) # Apresentação e instruções aos pais
    is_template = Column(Boolean, default=False, nullable=False) # Se é modelo base de evento
    parent_event_id = Column(Integer, ForeignKey("sch_event.id", ondelete="SET NULL"), nullable=True, index=True)
    rules_config = Column(JSONB, nullable=True, default=dict)
    draw_performed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    company = relationship("Company", foreign_keys=[company_id])
    school = relationship("Customer", foreign_keys=[school_customer_id])
    parent_event = relationship("SchoolEvent", remote_side=[id], foreign_keys=[parent_event_id])
    participants = relationship("SchoolEventParticipant", back_populates="event", foreign_keys="SchoolEventParticipant.event_id", cascade="all, delete-orphan")


class SchoolEventParticipant(Base):
    __tablename__ = "sch_event_participant"
    __table_args__ = (
        Index('idx_sch_part_event_status', 'event_id', 'gift_status'),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("sch_event.id", ondelete="CASCADE"), nullable=False, index=True)
    class_id = Column(Integer, ForeignKey("sch_class.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Dados da Criança / Aluno
    student_name = Column(String(255), nullable=False)
    student_birth_date = Column(Date, nullable=True)
    character_name = Column(String(100), nullable=True, index=True) # Nome de Personagem / Codinome lúdico
    
    # Dados do Responsável Legal
    parent_name = Column(String(255), nullable=False)
    parent_cpf = Column(String(20), nullable=False, index=True)
    parent_phone = Column(String(50), nullable=True)
    parent_email = Column(String(255), nullable=True)
    
    # Amigo Secreto / Preferências
    wishlist_preferences = Column(JSONB, nullable=True, default=dict) # {"genres": ["Aventura", "Dinossauro"], "notes": "..."}
    access_token = Column(String(100), unique=True, nullable=False, index=True) # Link mágico do participante
    assigned_to_participant_id = Column(Integer, ForeignKey("sch_event_participant.id", ondelete="SET NULL"), nullable=True)
    draw_revealed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Status de Presente / Pedido
    gift_order_id = Column(Integer, ForeignKey("ord_order.id", ondelete="SET NULL"), nullable=True)
    gift_status = Column(String(50), default="WAITING_DRAW", nullable=False) # WAITING_DRAW, WAITING_PURCHASE, PURCHASED, PACKED_READY, DELIVERED_TO_SCHOOL
    
    # Para passeios
    checkin_status = Column(String(50), default="PENDING", nullable=False) # PENDING, BOARDED, RETURNED
    medical_notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    company = relationship("Company", foreign_keys=[company_id])
    event = relationship("SchoolEvent", back_populates="participants", foreign_keys=[event_id])
    school_class = relationship("SchoolClass", foreign_keys=[class_id])
    assigned_to = relationship("SchoolEventParticipant", remote_side=[id], foreign_keys=[assigned_to_participant_id], backref="drawn_by")
    gift_order = relationship("Order", foreign_keys=[gift_order_id])
