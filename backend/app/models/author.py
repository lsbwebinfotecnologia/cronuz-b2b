from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class Author(Base):
    __tablename__ = "aut_author"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)

    # Identificadores no Horus ERP
    cod_empresa = Column(Integer, nullable=True)
    cod_filial = Column(Integer, nullable=True)
    cod_fornecedor = Column(Integer, nullable=False)
    id_guid = Column(String(100), nullable=False, index=True)
    id_doc = Column(String(50), nullable=False) # CPF ou CNPJ

    # Dados Cadastrais
    nome = Column(String(255), nullable=False)
    nome_fantasia = Column(String(255), nullable=True)
    cnpj = Column(String(30), nullable=True)
    cpf = Column(String(30), nullable=True)
    insc_estadual = Column(String(50), nullable=True)
    num_telefone = Column(String(50), nullable=True)
    end_email = Column(String(255), nullable=True)

    # Acesso B2B / Portal do Autor
    emailb2b = Column(String(255), nullable=False, index=True)
    password_hash = Column(String(255), nullable=True)
    status = Column(String(50), nullable=False, default="PENDENTE_ATIVACAO") # PENDENTE_ATIVACAO, ATIVO, INATIVO
    classificacao_autor = Column(String(100), nullable=False, default="Autor Principal")

    # Flags de Permissão do Horus
    b2b_mostrar_vendas = Column(String(1), nullable=False, default="S")
    b2b_mostrar_da = Column(String(1), nullable=False, default="N")

    # Token de Primeiro Acesso / Ativação (24h)
    activation_token_hash = Column(String(255), nullable=True)
    activation_token_expires_at = Column(DateTime(timezone=True), nullable=True)

    # Token de Recuperação de Senha
    reset_token_hash = Column(String(255), nullable=True)
    reset_token_expires_at = Column(DateTime(timezone=True), nullable=True)

    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    # Relationships
    company = relationship("Company", foreign_keys=[company_id])

    __table_args__ = (
        UniqueConstraint('company_id', 'emailb2b', name='uq_company_author_email'),
        UniqueConstraint('company_id', 'id_guid', name='uq_company_author_guid'),
    )
