from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class DistributorCredential(Base):
    """
    Credenciais de distribuidores por seller (company).

    Cada seller pode ter uma linha por distribuidor (slug único por empresa).
    Slugs suportados: 'catavento', 'disal', e futuros parceiros.

    Autenticação:
      - Catavento: POST /Sistema/Seguranca/Autenticar com {Email, Senha} → token
                   Header: API_TOKEN em cada request.
                   Token é cacheado em `token` e regenerado ao expirar.
      - Disal:     Header fixo `xLtOpenKeyId: <api_key>` (sem OAuth).
    """
    __tablename__ = "dst_distributor"

    id         = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)

    # Identificação do distribuidor
    slug = Column(String(50), nullable=False)   # 'catavento' | 'disal' | futuros
    name = Column(String(100), nullable=False)  # Nome de exibição

    # Habilitado pelo master para este seller
    enabled  = Column(Boolean, nullable=False, default=False)

    # Conexão
    base_url = Column(String(500), nullable=True)  # URL base da API do distribuidor
    username = Column(String(255), nullable=True)  # E-mail / usuário (Catavento)
    password = Column(String(500), nullable=True)  # Senha (Catavento)
    api_key  = Column(String(500), nullable=True)  # Token/chave estática (Disal: xLtOpenKeyId)

    # Token temporário cacheado (Catavento — renovado quando expira)
    token         = Column(Text, nullable=True)
    token_expires = Column(DateTime(timezone=True), nullable=True)

    # Campos extras livres para futuros distribuidores
    extra_config = Column(JSON, nullable=True)

    # Auditoria
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    company = relationship("Company", foreign_keys=[company_id])

    def __repr__(self):
        return f"<DistributorCredential company_id={self.company_id} slug={self.slug} enabled={self.enabled}>"
