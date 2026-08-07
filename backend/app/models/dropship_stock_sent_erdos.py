from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.db.session import Base


class StockSentErdos(Base):
    """
    Rastreia ISBNs enviados ao Hub-Erdos com saldo > 0.
    Permite detectar quais itens devem ser zerados na próxima sincronização.
    """
    __tablename__ = "dsp_stock_sent_erdos"

    id           = Column(Integer, primary_key=True, index=True)
    company_id   = Column(Integer, nullable=False, index=True)
    isbn         = Column(String(30), nullable=False)
    last_qty     = Column(Integer, nullable=False, default=0)
    last_sent_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
