from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, func
from app.db.session import Base

class LogisticsSettings(Base):
    __tablename__ = "logistics_settings"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    provider = Column(String(30), nullable=False, default='MKT')
    enabled = Column(Boolean, nullable=False, default=False)
    api_url = Column(String(500), nullable=True)
    login = Column(String(255), nullable=True)
    password = Column(String(500), nullable=True)
    warehouse_id = Column(String(50), nullable=True)
    client_id = Column(String(50), nullable=True)
    operator_id = Column(String(50), nullable=True)
    address_type = Column(String(10), default='1', nullable=True)
    stock_local = Column(String(50), nullable=True)  # COD_LOCAL do Horus para baixa/conferência de estoque
    feature_auto_send = Column(Boolean, nullable=False, default=True)  # Job de envio automático LEX -> WMS
    feature_auto_check = Column(Boolean, nullable=False, default=False)  # Job de conferência automática WMS -> LFT
    feature_auto_invoice = Column(Boolean, nullable=False, default=True)  # Job de envio automático de NFe FAT -> WMS
    min_order_number = Column(Integer, nullable=True)  # Número de corte inicial (apenas pedidos >= min_order_number são processados)
    check_interval_min = Column(Integer, nullable=False, default=15)

    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
