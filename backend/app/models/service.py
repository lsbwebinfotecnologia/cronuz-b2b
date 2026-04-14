from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Boolean, Date, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base
import enum

class ServiceOrderStatus(str, enum.Enum):
    PENDING = "Pendente"
    IN_PROGRESS = "Em Execucao"
    COMPLETED = "Concluido"
    CANCELLED = "Cancelado"

class ServiceOrderNfseStatus(str, enum.Enum):
    NOT_ISSUED = "Nao Emitida"
    PROCESSING = "Processando"
    ISSUED = "Emitida"
    ERROR = "Erro"

class Service(Base):
    __tablename__ = "svc_service"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    
    # Commercial
    name = Column(String(255), nullable=False)
    default_description = Column(Text, nullable=True)
    base_value = Column(Float, nullable=False, default=0.0)
    category_id = Column(Integer, ForeignKey("fin_category.id"), nullable=True)
    
    # Fiscal (NFS-e)
    codigo_lc116 = Column(String(20), nullable=True)
    cnae = Column(String(20), nullable=True)
    aliquota_iss = Column(Float, nullable=True)
    
    # Retentions
    reter_iss = Column(Boolean, default=False)
    reter_inss = Column(Boolean, default=False)
    reter_ir = Column(Boolean, default=False)
    reter_pis = Column(Boolean, default=False)
    reter_cofins = Column(Boolean, default=False)
    reter_csll = Column(Boolean, default=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    company = relationship("Company")
    category = relationship("FinancialCategory", foreign_keys=[category_id], viewonly=True)

class ServiceOrder(Base):
    __tablename__ = "svc_service_order"

    id = Column(Integer, primary_key=True, index=True)
    local_id = Column(Integer, index=True, nullable=True) # Sequential ID per company
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    customer_id = Column(Integer, ForeignKey("crm_customer.id"), nullable=False)
    service_id = Column(Integer, ForeignKey("svc_service.id"), nullable=False)
    
    negotiated_value = Column(Float, nullable=False)
    custom_description = Column(Text, nullable=True)
    execution_date = Column(Date, nullable=False)
    
    status = Column(SQLEnum(ServiceOrderStatus), default=ServiceOrderStatus.PENDING, nullable=False)
    status_nfse = Column(SQLEnum(ServiceOrderNfseStatus), default=ServiceOrderNfseStatus.NOT_ISSUED, nullable=False)

    is_recurrent = Column(Boolean, default=False, nullable=False)
    recurrence_end_date = Column(Date, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    company = relationship("Company")
    customer = relationship("Customer")
    service = relationship("Service")

import app.models.company
import app.models.financial
import app.models.customer
