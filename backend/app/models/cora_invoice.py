"""
cora_invoice.py
---------------
Espelho enxuto dos boletos emitidos no Banco Cora a partir de títulos do Horus ERP.

A fonte da verdade do contas a receber continua sendo o Horus (LANCTOS_CRECEBER / LANCTOS_CRECEBERA).
Esta tabela guarda apenas a chave do título no Horus + o vínculo com a fatura Cora, para:
  - impedir emissão duplicada (índice único por título/parcela);
  - permitir conciliação (webhook / job) e baixa por borderô sem reconsultar o ERP inteiro.
"""
from sqlalchemy import (
    Column, Integer, String, ForeignKey, DateTime, Date, Numeric, Boolean, Text, Index, UniqueConstraint, text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.session import Base


class CoraInvoice(Base):
    __tablename__ = "fin_cora_invoice"
    __table_args__ = (
        # Um título/parcela do Horus só pode ter UMA fatura Cora ativa por vez.
        # Faturas canceladas são marcadas com is_active = False e liberam reemissão.
        Index(
            "uq_fin_cora_invoice_active_title",
            "company_id", "cod_filial", "nro_lancto_creceber", "cod_parcela",
            unique=True,
            postgresql_where=text("is_active = true"),
        ),
        UniqueConstraint("cora_invoice_id", name="uq_fin_cora_invoice_cora_id"),
        Index("ix_fin_cora_invoice_company_status", "company_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)

    # ── Chave do título no Horus ────────────────────────────────────────────
    cod_empresa = Column(String(20), nullable=False)
    cod_filial = Column(String(20), nullable=False)
    nro_lancto_creceber = Column(Integer, nullable=False)
    cod_parcela = Column(Integer, nullable=False, default=1)
    cod_cli = Column(Integer, nullable=True)
    cod_ped_venda = Column(Integer, nullable=True)

    # Snapshot do sacado/título no momento da emissão (auditoria / listagem sem ir ao ERP)
    customer_name = Column(String(150), nullable=True)
    customer_document = Column(String(20), nullable=True)
    amount = Column(Numeric(14, 2), nullable=False)
    due_date = Column(Date, nullable=False)

    # ── Dados da fatura no Cora ─────────────────────────────────────────────
    cora_invoice_id = Column(String(64), nullable=True)   # ex: inv_yOgInV7rSPu90wOp21ekGyQ
    idempotency_key = Column(String(64), nullable=False)  # UUID enviado no header Idempotency-Key
    status = Column(String(20), nullable=False, default="PENDING")  # PENDING, DRAFT, OPEN, LATE, IN_PAYMENT, PAID, CANCELLED, ERROR
    is_active = Column(Boolean, nullable=False, default=True)
    our_number = Column(String(50), nullable=True)
    digitable_line = Column(String(60), nullable=True)
    barcode = Column(String(60), nullable=True)
    pix_emv = Column(Text, nullable=True)
    pdf_url = Column(Text, nullable=True)
    total_paid = Column(Numeric(14, 2), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)

    # ── Integração reversa com o Horus ──────────────────────────────────────
    horus_written_back = Column(Boolean, nullable=False, default=False)  # boleto gravado em LANCTOS_CRECEBERA
    cod_bordero_baixa = Column(Integer, nullable=True)                   # borderô de baixa gerado no Horus
    baixa_at = Column(DateTime(timezone=True), nullable=True)

    created_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_synced_at = Column(DateTime(timezone=True), nullable=True)

    # Referência única (sem ambiguidade) para a empresa — foreign_keys explícito por padrão do projeto.
    company = relationship("Company", foreign_keys=[company_id])
