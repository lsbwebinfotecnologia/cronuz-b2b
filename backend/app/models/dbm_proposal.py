from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, JSON, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class DbmProposal(Base):
    __tablename__ = "dbm_proposal"
    __table_args__ = (
        Index("idx_dbm_proposal_company_local", "company_id", "local_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    local_id = Column(Integer, nullable=False, index=True)

    customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_name = Column(String(255), nullable=False)
    customer_corporate_name = Column(String(255), nullable=True)
    customer_document = Column(String(50), nullable=True)
    customer_horus_cod_cli = Column(Integer, nullable=True)

    status_id = Column(String(50), nullable=False, default="st-2")
    status_name = Column(String(120), nullable=False, default="Aguardando Análise Comercial")
    status_phase = Column(String(50), nullable=False, default="EM_ANALISE")

    total_titles = Column(Integer, nullable=False, default=0)
    total_requested_qty = Column(Integer, nullable=False, default=0)
    total_approved_qty = Column(Integer, nullable=False, default=0)
    total_cover_value = Column(Float, nullable=False, default=0.0)
    total_net_value = Column(Float, nullable=False, default=0.0)
    average_discount = Column(Float, nullable=False, default=0.0)
    global_discount = Column(Float, nullable=False, default=0.0)
    min_order_value = Column(Float, nullable=False, default=0.0)

    horus_order_number = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    items_json = Column(JSON, nullable=True)

    created_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    customer = relationship("Customer", foreign_keys=[customer_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])
