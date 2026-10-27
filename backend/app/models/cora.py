"""
cora.py
-------
Módulo Banco Cora — configuração por seller (independente de ERP).

  CoraConfig  (fin_cora_config)  → 1 por empresa: ambiente ativo, modalidade, formas de pagamento
                                   e parâmetros padrão de cobrança (multa, juros, notificações).
  CoraAccount (fin_cora_account) → 1 por empresa + ambiente (STAGE / PRODUCTION): credenciais da
                                   Integração Direta (client_id, certificado e chave privada).

Segurança (AGENTS §2): certificado e chave ficam SOMENTE no banco. A chave privada é persistida
criptografada (Fernet / HORUS_SQL_ENCRYPTION_KEY) e só é materializada em arquivo temporário
durante a requisição mTLS.
"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.session import Base

CORA_ENVIRONMENTS = ("STAGE", "PRODUCTION")
CORA_INTEGRATION_MODES = ("DIRECT",)            # PARTNER (Parceria Cora) previsto para o futuro
CORA_PAYMENT_FORMS = ("BANK_SLIP", "BANK_SLIP_PIX")
CORA_CERT_FORMATS = ("PEM", "PFX")
CORA_NOTIFY_RULES = (
    "NOTIFY_FIFTEEN_DAYS_BEFORE_DUE_DATE", "NOTIFY_TEN_DAYS_BEFORE_DUE_DATE",
    "NOTIFY_SEVEN_DAYS_BEFORE_DUE_DATE", "NOTIFY_FIVE_DAYS_BEFORE_DUE_DATE",
    "NOTIFY_TWO_DAYS_BEFORE_DUE_DATE", "NOTIFY_ON_DUE_DATE",
    "NOTIFY_TWO_DAYS_AFTER_DUE_DATE", "NOTIFY_FIVE_DAYS_AFTER_DUE_DATE",
    "NOTIFY_SEVEN_DAYS_AFTER_DUE_DATE", "NOTIFY_TEN_DAYS_AFTER_DUE_DATE",
    "NOTIFY_FIFTEEN_DAYS_AFTER_DUE_DATE", "NOTIFY_WHEN_PAID",
)


class CoraConfig(Base):
    __tablename__ = "fin_cora_config"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    active_environment = Column(String(20), nullable=False, default="STAGE")     # STAGE | PRODUCTION
    integration_mode = Column(String(20), nullable=False, default="DIRECT")      # DIRECT (Integração Direta)
    payment_forms = Column(String(20), nullable=False, default="BANK_SLIP_PIX")  # BANK_SLIP | BANK_SLIP_PIX

    # Parâmetros padrão de cobrança (podem ser sobrescritos por boleto no futuro)
    fine_rate = Column(Numeric(5, 2), nullable=True)       # multa % após o vencimento
    interest_rate = Column(Numeric(5, 2), nullable=True)   # juros % ao mês
    discount_rate = Column(Numeric(5, 2), nullable=True)   # desconto % até o dia anterior ao vencimento
    notify_enabled = Column(Boolean, nullable=False, default=False)  # Cora envia notificações ao pagador
    notify_rules = Column(String(500), nullable=True)                # regras CORA_NOTIFY_RULES (csv)

    updated_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    updated_by = relationship("User", foreign_keys=[updated_by_user_id])


class CoraAccount(Base):
    __tablename__ = "fin_cora_account"
    __table_args__ = (
        UniqueConstraint("company_id", "environment", name="uq_fin_cora_account_company_env"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    environment = Column(String(20), nullable=False)       # STAGE | PRODUCTION

    client_id = Column(String(255), nullable=True)
    cert_format = Column(String(10), nullable=True)        # formato do arquivo importado: PEM | PFX
    cert_content = Column(Text, nullable=True)             # certificado X.509 (PEM)
    key_content = Column(Text, nullable=True)              # chave privada PEM CRIPTOGRAFADA (Fernet)
    cert_subject = Column(String(255), nullable=True)      # CN do certificado (exibição)
    cert_valid_from = Column(DateTime(timezone=True), nullable=True)
    cert_valid_until = Column(DateTime(timezone=True), nullable=True)

    last_test_at = Column(DateTime(timezone=True), nullable=True)
    last_test_ok = Column(Boolean, nullable=True)
    last_test_message = Column(String(500), nullable=True)

    updated_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    updated_by = relationship("User", foreign_keys=[updated_by_user_id])
