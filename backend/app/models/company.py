from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.db.session import Base

class Company(Base):
    __tablename__ = "cmp_company"

    id = Column(Integer, primary_key=True, index=True)
    nome_fantasia = Column(String(255), nullable=False)
    razao_social = Column(String(255), nullable=False)
    cnpj = Column(String(18), unique=True, index=True, nullable=False)
    inscricao_estadual = Column(String(50), nullable=True)
    
    email_contato = Column(String(255), nullable=True)
    telefone = Column(String(20), nullable=True)
    
    ativo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
