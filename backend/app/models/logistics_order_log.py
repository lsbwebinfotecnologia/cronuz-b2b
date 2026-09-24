from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func, Text
from sqlalchemy.orm import relationship
from app.db.session import Base

class LogisticsOrderLog(Base):
    __tablename__ = "logistics_order_logs"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    cod_ped_venda = Column(Integer, nullable=False, index=True)
    action = Column(String(50), nullable=False, index=True)  # CONFERENCE_ITEM, INS_VOLUME, ALT_STATUS_LFT, SEND_WMS, WMS_SYNC
    status = Column(String(20), nullable=False, default='SUCCESS', index=True)  # SUCCESS, ERROR, WARNING
    request_data = Column(Text, nullable=True)  # JSON string dos parâmetros enviados
    response_data = Column(Text, nullable=True)  # JSON string do retorno exato do Horus/WMS
    message = Column(Text, nullable=True)  # Mensagem descritiva do resultado
    created_at = Column(DateTime(timezone=True), default=func.now(), index=True)

    company = relationship("Company", foreign_keys=[company_id])
