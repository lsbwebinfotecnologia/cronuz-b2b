from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class FinancialCategory(Base):
    __tablename__ = "fin_category"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False) # RECEIVABLE, PAYABLE
    active = Column(Boolean, default=True, nullable=False)
    is_system = Column(Boolean, default=False, nullable=False) # To prevent deleting base categories
    dre_group = Column(String(50), nullable=True) # 1_Receita_Bruta, 2_Deducoes_Tributos, etc.
    parent_id = Column(Integer, ForeignKey("fin_category.id", ondelete="SET NULL"), nullable=True, index=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    subcategories = relationship("FinancialCategory", backref="parent", remote_side=[id])

class FinancialTransaction(Base):
    __tablename__ = "fin_transaction"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Optional FKs
    customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="SET NULL"), nullable=True, index=True)
    order_id = Column(Integer, ForeignKey("ord_order.id", ondelete="SET NULL"), nullable=True, index=True)
    category_id = Column(Integer, ForeignKey("fin_category.id", ondelete="RESTRICT"), nullable=False)
    
    description = Column(String(500), nullable=False)
    type = Column(String(50), nullable=False) # RECEIVABLE, PAYABLE
    transaction_status = Column(String(50), nullable=False, default="CONFIRMADO") # PROSPECCAO, CONFIRMADO, CANCELADO
    is_fixed = Column(Boolean, nullable=False, default=False)
    total_amount = Column(Float, nullable=False)
    issue_date = Column(Date, nullable=False)
    first_due_date = Column(Date, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    category = relationship("FinancialCategory")
    installments = relationship("FinancialInstallment", back_populates="transaction", cascade="all, delete-orphan")

class FinancialInstallment(Base):
    __tablename__ = "fin_installment"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("fin_transaction.id", ondelete="CASCADE"), nullable=False, index=True)
    
    number = Column(Integer, nullable=False) # 1, 2, 3
    due_date = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    
    status = Column(String(50), nullable=False, default="PENDING") # PENDING, PAID, OVERDUE, CANCELLED
    
    account_id = Column(Integer, ForeignKey("fin_account.id", ondelete="SET NULL"), nullable=True)
    payment_date = Column(DateTime(timezone=True), nullable=True)
    amount_paid = Column(Float, default=0.0, nullable=False)
    
    is_conciliated = Column(Boolean, default=False, nullable=False)
    conciliated_at = Column(DateTime(timezone=True), nullable=True)

    # Boleto Internals
    bank_slip_provider = Column(String(50), nullable=True)
    bank_slip_nosso_numero = Column(String(255), nullable=True)
    bank_slip_linha_digitavel = Column(String(255), nullable=True)
    bank_slip_codigo_barras = Column(String(255), nullable=True)
    bank_slip_pdf_url = Column(String(500), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    transaction = relationship("FinancialTransaction", back_populates="installments")

class FinancialAccount(Base):
    __tablename__ = "fin_account"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False) # CURRENT, SAVINGS, WALLET, CREDIT_CARD
    initial_balance = Column(Float, nullable=False, default=0.0)
    current_balance = Column(Float, nullable=False, default=0.0)
    
    closing_day = Column(Integer, nullable=True) # Ex: 10
    due_day = Column(Integer, nullable=True) # Ex: 20
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class FinancialCashFlowLog(Base):
    __tablename__ = "fin_cashflow_log"
    
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("fin_account.id", ondelete="CASCADE"), nullable=False, index=True)
    installment_id = Column(Integer, ForeignKey("fin_installment.id", ondelete="SET NULL"), nullable=True)
    
    description = Column(String(500), nullable=False)
    movement_type = Column(String(10), nullable=False) # '+' or '-'
    amount = Column(Float, nullable=False)
    progressive_balance = Column(Float, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
