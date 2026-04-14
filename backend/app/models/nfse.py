from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base
import enum

class NFSeQueueStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    SUCCESS = "SUCCESS"
    REJECTED = "REJECTED"

class NFSeQueue(Base):
    __tablename__ = "svc_nfse_queue"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    # The financial transaction or service order grouping that triggered this emission
    transaction_id = Column(Integer, ForeignKey("fin_transaction.id"), nullable=True) 
    service_order_id = Column(Integer, ForeignKey("svc_service_order.id"), nullable=True)
    print_point_id = Column(Integer, ForeignKey("cmp_print_point.id"), nullable=True)
    
    status = Column(SQLEnum(NFSeQueueStatus), default=NFSeQueueStatus.PENDING, nullable=False)
    retry_count = Column(Integer, default=0, nullable=False)
    
    # Store the actual XML or raw response from Serpro for debugging / auditing
    nfse_response_json = Column(JSON, nullable=True)
    xml_protocol_id = Column(String(255), nullable=True)
    xml_retorno = Column(Text, nullable=True)
    pdf_url_link = Column(String(500), nullable=True)
    
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    company = relationship("Company")
    transaction = relationship("FinancialTransaction")
    service_order = relationship("ServiceOrder")
    print_point = relationship("PrintPoint")

import app.models.company
import app.models.service
import app.models.financial
import app.models.print_point
