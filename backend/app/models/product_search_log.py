from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.session import Base

class ProductSearchLog(Base):
    __tablename__ = "log_product_search"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True, index=True)
    
    # Termo e parâmetros consultados
    search_term = Column(String(255), nullable=False, index=True)
    search_option = Column(String(50), nullable=False) # BARRAS_ISBN | NOME | COD_ITEM
    source = Column(String(20), nullable=False, default="web") # web | app | physical_scanner

    # Dados do produto localizado (se houver correspondência no retorno)
    matched_cod_item = Column(Integer, nullable=True, index=True)
    matched_isbn = Column(String(50), nullable=True, index=True)
    matched_name = Column(String(255), nullable=True)
    total_results = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    # Relationships explícitos com foreign_keys
    company = relationship("Company", foreign_keys=[company_id])
    user = relationship("User", foreign_keys=[user_id])

# Índices para relatórios de produtos mais consultados e performance
Index("ix_log_prod_search_company_date", ProductSearchLog.company_id, ProductSearchLog.created_at)
Index("ix_log_prod_search_term_count", ProductSearchLog.company_id, ProductSearchLog.search_term)
Index("ix_log_prod_search_isbn_count", ProductSearchLog.company_id, ProductSearchLog.matched_isbn)
