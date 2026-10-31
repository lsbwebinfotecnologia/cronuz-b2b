"""
payments.py
-----------
Hub de Pagamentos — modelos genéricos, independentes de intermediador.

  PayProviderEnablement (pay_provider_enablement) → quais intermediadores o Master habilitou por seller.
  PayChannelRoute       (pay_channel_route)       → canal × forma de pagamento → UM intermediador (evita conflito).
  PayCharge             (pay_charge)              → cobrança genérica (boleto/Pix/cartão/link) de qualquer provedor,
                                                    vinculada a uma ORIGEM (Horus, pedido B2B, B2C, financeiro, manual...).
  PayChargeEvent        (pay_charge_event)        → histórico de webhooks / sincronizações (auditoria e idempotência).

Credenciais continuam nas tabelas de cada provedor (ex.: fin_cora_account).
"""
from sqlalchemy import (
    JSON, Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.session import Base

# ── Catálogos ────────────────────────────────────────────────────────────────
PAY_PROVIDERS = ("CORA", "INTER", "EFI", "VINDI", "CIELO", "REDE")
PAY_METHODS = ("BOLETO", "PIX", "CARD", "LINK")
PAY_CHANNELS = ("FINANCIAL", "B2B_STOREFRONT", "B2C_STOREFRONT", "SUBSCRIPTIONS", "SCHOOLS", "PDV", "PAYMENT_LINK")
PAY_CHARGE_STATUSES = ("PENDING", "OPEN", "LATE", "IN_PAYMENT", "PAID", "CANCELLED", "ERROR")
PAY_ORIGIN_TYPES = (
    "MANUAL", "FINANCIAL", "HORUS_SQL", "HORUS_API", "B2B_ORDER", "B2C_ORDER", "PDV", "SUBSCRIPTION", "SERVICE_ORDER"
)


class PayProviderEnablement(Base):
    __tablename__ = "pay_provider_enablement"
    __table_args__ = (UniqueConstraint("company_id", "provider", name="uq_pay_provider_enablement"),)

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(20), nullable=False)            # PAY_PROVIDERS
    enabled = Column(Boolean, nullable=False, default=False)
    changed_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    changed_by = relationship("User", foreign_keys=[changed_by_user_id])


class PayChannelRoute(Base):
    __tablename__ = "pay_channel_route"
    __table_args__ = (UniqueConstraint("company_id", "channel", "method", name="uq_pay_channel_route"),)

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    channel = Column(String(30), nullable=False)    # PAY_CHANNELS
    method = Column(String(20), nullable=False)     # PAY_METHODS
    provider = Column(String(20), nullable=False)   # PAY_PROVIDERS
    changed_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    changed_by = relationship("User", foreign_keys=[changed_by_user_id])


class PayCharge(Base):
    __tablename__ = "pay_charge"
    __table_args__ = (
        # Uma origem só pode ter UMA cobrança ativa por vez (cancelada/reemitida libera)
        Index(
            "uq_pay_charge_active_origin", "company_id", "origin_type", "origin_ref",
            unique=True, postgresql_where=text("is_active = true AND origin_ref IS NOT NULL"),
        ),
        UniqueConstraint("provider", "provider_charge_id", name="uq_pay_charge_provider_id"),
        Index("ix_pay_charge_company_status_due", "company_id", "status", "due_date"),
        Index("ix_pay_charge_company_provider_created", "company_id", "provider", "created_at"),
        Index("ix_pay_charge_company_paid_at", "company_id", "paid_at"),
        Index("ix_pay_charge_company_issue_date", "company_id", "issue_date"),
        Index("ix_pay_charge_company_customer", "company_id", "customer_id"),
        Index("ix_pay_charge_company_launch", "company_id", "financial_launch_id"),
        Index("ix_pay_charge_company_invoice", "company_id", "invoice_number"),
        Index("ix_pay_charge_company_order", "company_id", "order_number"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)

    provider = Column(String(20), nullable=False)          # CORA, INTER...
    environment = Column(String(20), nullable=False, default="PRODUCTION")  # STAGE | PRODUCTION
    method = Column(String(20), nullable=False, default="BOLETO")
    channel = Column(String(30), nullable=True)

    origin_type = Column(String(30), nullable=False, default="MANUAL")
    origin_ref = Column(String(120), nullable=True)        # chave da origem (ex.: "filial:lancto:parcela", id do pedido)
    customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="SET NULL"), nullable=True)
    issue_date = Column(Date, nullable=True)
    order_number = Column(String(60), nullable=True)
    pdv_coupon_number = Column(String(60), nullable=True)
    financial_launch_id = Column(String(60), nullable=True)
    installment_number = Column(String(20), nullable=True)
    invoice_number = Column(String(60), nullable=True)
    horus_cod_cli = Column(String(40), nullable=True)
    horus_id_guid = Column(String(100), nullable=True)
    origin_meta = Column(JSON, nullable=True)

    provider_charge_id = Column(String(80), nullable=True)  # ex.: inv_xxx (Cora)
    idempotency_key = Column(String(64), nullable=False)
    code = Column(String(80), nullable=True)                # código enviado ao provedor
    status = Column(String(20), nullable=False, default="PENDING")
    is_active = Column(Boolean, nullable=False, default=True)

    amount = Column(Numeric(14, 2), nullable=False)
    due_date = Column(Date, nullable=False)
    description = Column(String(255), nullable=True)

    payer_name = Column(String(150), nullable=True)
    payer_document = Column(String(20), nullable=True)
    payer_email = Column(String(150), nullable=True)
    payer_snapshot = Column(JSON, nullable=True)            # endereço e demais dados enviados

    digitable_line = Column(String(60), nullable=True)
    barcode = Column(String(60), nullable=True)
    our_number = Column(String(50), nullable=True)
    pix_emv = Column(Text, nullable=True)
    pdf_url = Column(Text, nullable=True)
    registered = Column(Boolean, nullable=True)

    total_paid = Column(Numeric(14, 2), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)

    replaces_charge_id = Column(Integer, ForeignKey("pay_charge.id", ondelete="SET NULL"), nullable=True)  # reemissão (novo vencimento)

    created_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_synced_at = Column(DateTime(timezone=True), nullable=True)

    company = relationship("Company", foreign_keys=[company_id])
    customer = relationship("Customer", foreign_keys=[customer_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    replaces = relationship("PayCharge", foreign_keys=[replaces_charge_id], remote_side=[id])


class PayChargeEvent(Base):
    __tablename__ = "pay_charge_event"
    __table_args__ = (
        Index("ix_pay_charge_event_charge", "charge_id", "created_at"),
        Index(
            "uq_pay_charge_event_external", "provider", "external_event_id",
            unique=True, postgresql_where=text("external_event_id IS NOT NULL"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    charge_id = Column(Integer, ForeignKey("pay_charge.id", ondelete="CASCADE"), nullable=True)
    provider = Column(String(20), nullable=False)
    source = Column(String(20), nullable=False)             # API, WEBHOOK, SYNC, JOB, USER
    event_type = Column(String(40), nullable=False)         # created, paid, cancelled, overdue, sync, error, reissued...
    external_event_id = Column(String(120), nullable=True)  # id do evento no provedor (webhook)
    status_before = Column(String(20), nullable=True)
    status_after = Column(String(20), nullable=True)
    message = Column(String(500), nullable=True)
    user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    charge = relationship("PayCharge", foreign_keys=[charge_id])
    user = relationship("User", foreign_keys=[user_id])
