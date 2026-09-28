from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Date, Text, UniqueConstraint, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base

class EditorialPipeline(Base):
    __tablename__ = "edt_pipeline"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)

    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(30), default="#6366f1", nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    company = relationship("Company", foreign_keys=[company_id])
    stages = relationship("EditorialStage", back_populates="pipeline", cascade="all, delete-orphan", order_by="EditorialStage.order_index")
    projects = relationship("EditorialProject", back_populates="pipeline", cascade="all, delete-orphan")


class EditorialStage(Base):
    __tablename__ = "edt_stage"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    pipeline_id = Column(Integer, ForeignKey("edt_pipeline.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(30), default="#3b82f6", nullable=False)
    order_index = Column(Integer, default=0, nullable=False)
    sla_days = Column(Integer, default=0, nullable=False)
    is_initial = Column(Boolean, default=False, nullable=False)
    is_final = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    company = relationship("Company", foreign_keys=[company_id])
    pipeline = relationship("EditorialPipeline", back_populates="stages", foreign_keys=[pipeline_id])
    projects = relationship("EditorialProject", back_populates="stage", foreign_keys="EditorialProject.stage_id")


class EditorialProject(Base):
    __tablename__ = "edt_project"
    __table_args__ = (
        UniqueConstraint('company_id', 'local_id', name='uix_edt_project_company_local'),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    local_id = Column(Integer, index=True, nullable=False)

    pipeline_id = Column(Integer, ForeignKey("edt_pipeline.id"), nullable=False, index=True)
    stage_id = Column(Integer, ForeignKey("edt_stage.id"), nullable=False, index=True)

    title = Column(String(255), nullable=False)
    subtitle = Column(String(255), nullable=True)
    format = Column(String(50), default="LIVRO_FISICO", nullable=False)
    edition = Column(String(50), nullable=True)
    volume = Column(String(50), nullable=True)
    isbn = Column(String(50), nullable=True, index=True)
    barcode = Column(String(50), nullable=True)
    synopsis = Column(Text, nullable=True)
    cover_url = Column(String(500), nullable=True)

    priority = Column(String(20), default="MEDIUM", nullable=False)
    status = Column(String(20), default="ACTIVE", nullable=False)

    start_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    stage_entered_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    responsible_user_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True)
    author_id = Column(Integer, ForeignKey("aut_author.id"), nullable=True, index=True)
    
    horus_cod_item = Column(Integer, nullable=True, index=True)
    visible_to_author = Column(Boolean, default=False, nullable=False)

    estimated_pages = Column(Integer, nullable=True)
    estimated_cost = Column(Float, default=0.0, nullable=False)
    
    # Novos campos de Tiragem e Precificação
    tiragem = Column(Integer, default=1000, nullable=False)
    preco_capa_sugerido = Column(Float, default=0.0, nullable=False)
    margem_estimada_percentual = Column(Float, default=0.0, nullable=False)
    custo_unitario_exemplar = Column(Float, default=0.0, nullable=False)
    custo_total_orcado = Column(Float, default=0.0, nullable=False)
    custo_total_realizado = Column(Float, default=0.0, nullable=False)
    
    internal_notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    company = relationship("Company", foreign_keys=[company_id])
    pipeline = relationship("EditorialPipeline", back_populates="projects", foreign_keys=[pipeline_id])
    stage = relationship("EditorialStage", back_populates="projects", foreign_keys=[stage_id])
    responsible_user = relationship("User", foreign_keys=[responsible_user_id])
    author = relationship("Author", foreign_keys=[author_id])

    costs = relationship("EditorialProjectCost", back_populates="project", cascade="all, delete-orphan", order_by="EditorialProjectCost.order_index")
    tasks = relationship("EditorialTask", back_populates="project", cascade="all, delete-orphan", order_by="EditorialTask.order_index")
    files = relationship("EditorialFile", back_populates="project", cascade="all, delete-orphan", order_by="EditorialFile.created_at.desc()")
    history = relationship("EditorialHistory", back_populates="project", cascade="all, delete-orphan", order_by="EditorialHistory.created_at.desc()")


class EditorialTask(Base):
    __tablename__ = "edt_task"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("edt_project.id", ondelete="CASCADE"), nullable=False, index=True)
    stage_id = Column(Integer, ForeignKey("edt_stage.id", ondelete="SET NULL"), nullable=True, index=True)

    title = Column(String(255), nullable=False)
    is_completed = Column(Boolean, default=False, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    completed_by_user_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True)
    order_index = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("EditorialProject", back_populates="tasks", foreign_keys=[project_id])
    stage = relationship("EditorialStage", foreign_keys=[stage_id])
    completed_by = relationship("User", foreign_keys=[completed_by_user_id])


class EditorialFile(Base):
    __tablename__ = "edt_file"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("edt_project.id", ondelete="CASCADE"), nullable=False, index=True)
    stage_id = Column(Integer, ForeignKey("edt_stage.id", ondelete="SET NULL"), nullable=True, index=True)

    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, default=0, nullable=False)
    file_type = Column(String(100), nullable=True)
    uploaded_by_user_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("EditorialProject", back_populates="files", foreign_keys=[project_id])
    stage = relationship("EditorialStage", foreign_keys=[stage_id])
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_user_id])


class EditorialHistory(Base):
    __tablename__ = "edt_history"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("edt_project.id", ondelete="CASCADE"), nullable=False, index=True)
    from_stage_id = Column(Integer, ForeignKey("edt_stage.id", ondelete="SET NULL"), nullable=True)
    to_stage_id = Column(Integer, ForeignKey("edt_stage.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True)

    action = Column(String(50), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("EditorialProject", back_populates="history", foreign_keys=[project_id])
    from_stage = relationship("EditorialStage", foreign_keys=[from_stage_id])
    to_stage = relationship("EditorialStage", foreign_keys=[to_stage_id])
    user = relationship("User", foreign_keys=[user_id])


class EditorialProfessional(Base):
    __tablename__ = "edt_professional"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    
    name = Column(String(150), nullable=False)
    specialty = Column(String(50), nullable=False, index=True) # REVISAO, DIAGRAMACAO, CAPA, ILUSTRACAO, LEITURA_CRITICA, TRADUCAO, GRAFICA, OUTRO
    email = Column(String(150), nullable=True)
    phone = Column(String(30), nullable=True)
    pix_key = Column(String(150), nullable=True)
    pix_type = Column(String(20), nullable=True) # CPF, CNPJ, EMAIL, TELEFONE, ALEATORIA
    rate_type = Column(String(30), default="UNITARIO", nullable=True) # LAUDA, PAGINA, FECHADO, EXEMPLAR
    default_rate = Column(Float, default=0.0, nullable=False)
    rating = Column(Integer, default=5, nullable=False)
    portfolio_url = Column(String(300), nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    company = relationship("Company", foreign_keys=[company_id])
    costs = relationship("EditorialProjectCost", back_populates="professional")


class EditorialProjectCost(Base):
    __tablename__ = "edt_project_cost"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("edt_project.id", ondelete="CASCADE"), nullable=False, index=True)
    stage_id = Column(Integer, ForeignKey("edt_stage.id", ondelete="SET NULL"), nullable=True)
    professional_id = Column(Integer, ForeignKey("edt_professional.id", ondelete="SET NULL"), nullable=True, index=True)

    service_type = Column(String(50), nullable=False) # DIAGRAMACAO, REVISAO_1, REVISAO_2, CAPA, ILUSTRACAO, IMPRESSAO_GRAFICA, FICHA_ISBN, OUTRO
    description = Column(String(255), nullable=False)
    unit_type = Column(String(30), default="FECHADO", nullable=False) # PAGINA, LAUDA, EXEMPLAR, FECHADO, HORA
    quantity = Column(Float, default=1.0, nullable=False)
    unit_value = Column(Float, default=0.0, nullable=False)
    estimated_total = Column(Float, default=0.0, nullable=False)
    actual_total = Column(Float, default=0.0, nullable=False)
    payment_status = Column(String(30), default="ORCADO", nullable=False) # ORCADO, EM_EXECUCAO, APROVADO, PAGO
    paid_at = Column(DateTime, nullable=True)
    invoice_number = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    order_index = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("EditorialProject", back_populates="costs", foreign_keys=[project_id])
    stage = relationship("EditorialStage", foreign_keys=[stage_id])
    professional = relationship("EditorialProfessional", back_populates="costs", foreign_keys=[professional_id])


class EditorialPipelineTemplate(Base):
    __tablename__ = "edt_pipeline_template"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    category = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(30), default="#6366f1", nullable=False)
    stages_json = Column(JSON, nullable=False)
    default_services_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

