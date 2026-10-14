from sqlalchemy import Column, Integer, BigInteger, String, Float, ForeignKey, DateTime, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base

class HorusBISale(Base):
    __tablename__ = "horus_bi_sales"
    __table_args__ = (
        UniqueConstraint('company_id', 'horus_bi_id', name='uix_horus_bi_sales_company_bi_id'),
        Index('idx_bi_sales_lookup', 'company_id', 'customer_horus_id', 'ean', 'sale_date'),
        Index('idx_bi_sales_ean', 'company_id', 'ean', 'sale_date'),
        Index('idx_bi_sales_movement', 'company_id', 'movement_type', 'sale_date'),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    
    # ID sequencial retornado pela API bi_vendas do Horus
    horus_bi_id = Column(BigInteger, nullable=False, index=True)

    # Identificação do cliente no Horus ERP
    customer_horus_id = Column(BigInteger, nullable=False, index=True) # COD_CLI
    customer_name = Column(String(255), nullable=True) # NOM_CLI
    customer_id = Column(Integer, ForeignKey("crm_customer.id"), nullable=True, index=True)

    # Dados do item/livro
    ean = Column(String(32), nullable=False, index=True) # EAN / ISBN-13
    item_code = Column(Integer, nullable=True) # COD_ITEM
    item_name = Column(String(255), nullable=True) # NOM_ITEM
    publisher = Column(String(255), nullable=True) # NOM_EDITORA
    genre = Column(String(255), nullable=True) # NOM_GENERO
    genre_sub = Column(String(255), nullable=True) # NOM_GENERO_NIVEL2

    # Dados temporais e fiscais
    sale_date = Column(DateTime, nullable=False, index=True) # DATA
    month = Column(Integer, nullable=True) # MES
    year = Column(Integer, nullable=True) # ANO

    cfop = Column(String(10), nullable=True, index=True) # Higienizado (4 dígitos, ex: 5102)
    movement_type = Column(String(30), nullable=False, default="SALE", index=True) # SALE, CONSIGNMENT_SHIPMENT, SALE_RETURN, CONSIGNMENT_RETURN, OTHER

    # Quantidades e valores
    qty_ordered = Column(Integer, nullable=False, default=0) # QT_PEDIDA
    qty_fulfilled = Column(Integer, nullable=False, default=0) # QTD_ATENDIDA
    qty_returned = Column(Integer, nullable=False, default=0) # QTD_ITENS_DEVOLVIDA

    net_value = Column(Float, nullable=False, default=0.0) # VLR_TOTAL_LIQUIDO
    gross_value = Column(Float, nullable=False, default=0.0) # VLR_BRUTO_ITEM
    discount_percent = Column(Float, nullable=False, default=0.0) # DESCONTO_MEDIO
    freight_value = Column(Float, nullable=False, default=0.0) # FRETE

    # Origem e canal no Horus
    sales_channel = Column(String(100), nullable=True) # DESC_METODO (Amazon, Mercado Livre, Loja física, etc.)
    sales_order_horus = Column(BigInteger, nullable=True) # COD_PED_VENDA
    invoice_number = Column(BigInteger, nullable=True) # COD_NF
    local_warehouse = Column(String(100), nullable=True) # NOM_LOCAL

    synced_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships explícitos
    company = relationship("Company", foreign_keys=[company_id])
    customer = relationship("Customer", foreign_keys=[customer_id])
