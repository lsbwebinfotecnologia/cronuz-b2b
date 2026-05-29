from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from app.db.session import Base


class BookinfoPurchaseJobLog(Base):
    """
    Registro de execucoes do job automatico de pedidos de compra Bookinfo.
    Uma entrada por fornecedor (supplier) por ciclo de execucao.
    """
    __tablename__ = "spl_purchase_job_log"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("spl_supplier.id"), nullable=True, index=True)
    supplier_name = Column(String(255), nullable=True)      # snapshot do nome

    run_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Contadores do ciclo
    orders_found = Column(Integer, default=0)    # pedidos encontrados no Horus
    orders_sent = Column(Integer, default=0)     # enviados com sucesso para Bookinfo
    orders_skipped = Column(Integer, default=0)  # ignorados (ja enviados ou COMPRA_CONSIG invalido)
    orders_error = Column(Integer, default=0)    # falhas de envio

    syncs_done = Column(Integer, default=0)      # transmissoes sincronizadas (retorno Bookinfo)
    syncs_error = Column(Integer, default=0)     # falhas de sincronizacao

    # SUCCESS | PARTIAL | ERROR | NO_ORDERS | SKIPPED (seller desabilitado)
    status = Column(String(50), default="SUCCESS")

    # JSON com detalhes de erros e acoes por pedido (para auditoria)
    details = Column(Text, nullable=True)
