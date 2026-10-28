from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, ForeignKey, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class B2CCouponBatch(Base):
    """
    Lote de Cupons Corporativos B2C (ex: Empresa Parceira que distribui para seus colaboradores).
    Suporta 2 modos:
      - INDIVIDUAL_CODES: Gera N códigos únicos individuais (1 código por colaborador).
      - SHARED_CPF_LIMIT: Código único compartilhado (ex: EMPRESAX100) onde cada CPF elegível tem direito ao valor do benefício.
    """
    __tablename__ = "b2c_coupon_batches"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    partner_company_name = Column(String(255), nullable=True)
    partner_document = Column(String(50), nullable=True)
    batch_mode = Column(String(40), nullable=False, default="INDIVIDUAL_CODES")  # INDIVIDUAL_CODES or SHARED_CPF_LIMIT
    shared_code = Column(String(100), nullable=True, index=True)
    coupon_value = Column(Numeric(10, 2), nullable=False, default=0.00)
    discount_type = Column(String(30), nullable=False, default="FIXED_BRL")  # FIXED_BRL or PERCENTAGE
    allows_freight_discount = Column(Boolean, nullable=False, default=False, server_default="false")
    allow_residual_balance = Column(Boolean, nullable=False, default=True, server_default="true")
    min_order_value = Column(Numeric(10, 2), nullable=False, default=0.00)
    max_uses_total = Column(Integer, nullable=False, default=100)
    valid_from = Column(Date, nullable=True)
    valid_until = Column(Date, nullable=True)
    eligible_cpfs_json = Column(JSONB, nullable=True)  # Lista opcional de CPFs/colaboradores pré-autorizados
    notes = Column(Text, nullable=True)
    active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    coupons = relationship(
        "B2CCoupon",
        back_populates="batch",
        foreign_keys="B2CCoupon.batch_id",
        cascade="all, delete-orphan",
    )


class B2CCoupon(Base):
    """
    Cupom / Voucher B2C individual ou carteira vinculada a um CPF.
    Controla saldo inicial, saldo consumido, saldo residual e vínculo de cupom-filho (gerado quando sobra saldo).
    """
    __tablename__ = "b2c_coupons"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    batch_id = Column(Integer, ForeignKey("b2c_coupon_batches.id", ondelete="SET NULL"), nullable=True, index=True)
    code = Column(String(100), nullable=False, index=True)
    coupon_mode = Column(String(40), nullable=False, default="INDIVIDUAL")  # INDIVIDUAL, CPF_WALLET, RESIDUAL
    discount_type = Column(String(30), nullable=False, default="FIXED_BRL")  # FIXED_BRL or PERCENTAGE
    initial_value = Column(Numeric(10, 2), nullable=False, default=0.00)
    current_balance = Column(Numeric(10, 2), nullable=False, default=0.00)
    used_amount = Column(Numeric(10, 2), nullable=False, default=0.00)
    allows_freight_discount = Column(Boolean, nullable=False, default=False, server_default="false")
    allow_residual_balance = Column(Boolean, nullable=False, default=True, server_default="true")
    min_order_value = Column(Numeric(10, 2), nullable=False, default=0.00)

    assigned_name = Column(String(255), nullable=True)
    assigned_cpf = Column(String(30), nullable=True, index=True)
    assigned_email = Column(String(255), nullable=True)

    parent_coupon_id = Column(Integer, ForeignKey("b2c_coupons.id", ondelete="SET NULL"), nullable=True, index=True)
    generated_child_code = Column(String(100), nullable=True)
    tray_coupon_id = Column(String(100), nullable=True)

    # AVAILABLE, PARTIALLY_USED, EXHAUSTED, EXPIRED, CANCELLED
    status = Column(String(40), nullable=False, default="AVAILABLE", index=True)
    valid_from = Column(Date, nullable=True)
    valid_until = Column(Date, nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    batch = relationship("B2CCouponBatch", back_populates="coupons", foreign_keys=[batch_id])
    parent_coupon = relationship("B2CCoupon", remote_side=[id], foreign_keys=[parent_coupon_id])


class B2CCouponRedemption(Base):
    """
    Histórico / Auditoria de utilização de cupom B2C.
    Registra quem utilizou, se utilizou 100% ou parcial, se gerou novo cupom residual ou se cobrou diferença no Gateway / Tray.
    """
    __tablename__ = "b2c_coupon_redemptions"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    coupon_id = Column(Integer, ForeignKey("b2c_coupons.id", ondelete="SET NULL"), nullable=True, index=True)
    batch_id = Column(Integer, ForeignKey("b2c_coupon_batches.id", ondelete="SET NULL"), nullable=True, index=True)
    order_id = Column(Integer, ForeignKey("ord_order.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="SET NULL"), nullable=True, index=True)

    coupon_code = Column(String(100), nullable=False, index=True)
    customer_name = Column(String(255), nullable=True)
    customer_cpf = Column(String(30), nullable=True, index=True)
    customer_email = Column(String(255), nullable=True)

    order_subtotal = Column(Numeric(10, 2), nullable=False, default=0.00)
    order_freight = Column(Numeric(10, 2), nullable=False, default=0.00)
    discount_applied = Column(Numeric(10, 2), nullable=False, default=0.00)
    previous_balance = Column(Numeric(10, 2), nullable=False, default=0.00)
    remaining_balance = Column(Numeric(10, 2), nullable=False, default=0.00)
    residual_coupon_code = Column(String(100), nullable=True)
    difference_paid = Column(Numeric(10, 2), nullable=False, default=0.00)

    # FREE_VOUCHER (100% coberto pelo cupom), NATIVE_GATEWAY, TRAY_REDIRECT
    checkout_mode = Column(String(40), nullable=False, default="FREE_VOUCHER")
    tray_cart_session_id = Column(String(150), nullable=True)
    tray_cart_url = Column(String(500), nullable=True)
    tray_coupon_code = Column(String(100), nullable=True)

    # COMPLETED, PENDING_PAYMENT, REDIRECTED_TO_TRAY, CANCELLED
    status = Column(String(40), nullable=False, default="COMPLETED")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    coupon = relationship("B2CCoupon", foreign_keys=[coupon_id])
    batch = relationship("B2CCouponBatch", foreign_keys=[batch_id])


class B2CLgpdConsent(Base):
    """
    Registro imutável de consentimento LGPD para clientes B2C no Storefront Aberto.
    """
    __tablename__ = "b2c_lgpd_consents"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_name = Column(String(255), nullable=False)
    customer_cpf = Column(String(30), nullable=False, index=True)
    customer_email = Column(String(255), nullable=False)
    ip_address = Column(String(100), nullable=True)
    user_agent = Column(String(500), nullable=True)
    terms_version = Column(String(50), nullable=False, default="v1.0")
    marketing_opt_in = Column(Boolean, nullable=False, default=False)
    accepted_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", foreign_keys=[company_id])
