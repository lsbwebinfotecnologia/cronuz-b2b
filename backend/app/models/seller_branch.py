from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base

class SellerBranch(Base):
    __tablename__ = "cmp_seller_branch"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    nome = Column(String(255), nullable=False)
    cnpj = Column(String(20), nullable=True)
    cod_empresa = Column(String(50), nullable=False)
    cod_filial = Column(String(50), nullable=False)
    cod_local = Column(String(50), nullable=True) # Código de Local de Estoque no Hórus
    active = Column(Boolean, default=True, nullable=False)

    # SEFAZ-SP Integration Config (por filial)
    # Ambiente de emissão: HOMOLOGACAO ou PRODUCAO
    sefaz_environment = Column(String(20), default='HOMOLOGACAO', nullable=False)
    # UF para consulta SEFAZ (ex: SP, RJ, MG...)
    uf = Column(String(2), default='SP', nullable=False)
    # Conteúdo do certificado .pfx em base64 (armazenado em DB, nunca em arquivo físico)
    sefaz_cert_content = Column(Text, nullable=True)
    # Senha do certificado .pfx
    sefaz_cert_password = Column(String(255), nullable=True)
    # Lista de códigos de local de estoque (ex: ["001", "002"])
    cod_local_estoque = Column(JSONB, nullable=True, default=list)
    # Último NSU retornado pela SEFAZ — deve ser usado nas consultas subsequentes
    # para evitar o erro cStat=656 (Consumo Indevido). NUNCA reiniciar do 0.
    sefaz_ultimo_nsu = Column(String(15), nullable=True, default='0')

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Explicit relationships with foreign_keys as per Rule 1
    company = relationship("Company", back_populates="branches", foreign_keys=[company_id])


class ProductBranchMinStock(Base):
    """
    Estoque Mínimo parametrizado por Produto (ISBN) e por Filial Configurada (cmp_seller_branch).
    Utilizado no módulo Horus Direct -> Análise de Itens (/horus-direct/analise-itens)
    para sinalização visual:
      - Vermelho: Estoque Atual < Estoque Mínimo
      - Laranja: Estoque Atual próximo do Estoque Mínimo
    """
    __tablename__ = "prd_branch_min_stock"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    branch_id = Column(Integer, nullable=False, index=True)  # ID de cmp_seller_branch (ou 0 para filial padrão)
    isbn = Column(String(50), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("prd_product.id", ondelete="SET NULL"), nullable=True, index=True)
    min_stock = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("company_id", "branch_id", "isbn", name="uq_prd_branch_min_stock_company_branch_isbn"),
        Index("ix_prd_branch_min_stock_lookup", "company_id", "branch_id", "isbn"),
    )

