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
    invoice_allowed_payment_forms = Column(String(500), nullable=True)  # filtro de formas de pagto nas NFs Horus (csv de COD_FORMA ou NOM_FORMA)
    invoice_auto_emit_enabled = Column(Boolean, nullable=False, default=False)  # rotina automática (Play) de emissão de boletos por NF Horus

    # Webhook (notificação de pagamento/cancelamento/vencimento enviada pelo Cora)
    webhook_secret = Column(String(64), nullable=True)               # segredo na URL pública (anti-spam)
    webhook_endpoint_ids = Column(String(500), nullable=True)        # ids dos endpoints criados no Cora (csv)
    webhook_environment = Column(String(20), nullable=True)          # ambiente em que o webhook foi registrado

    # Baixa de Retorno & Conciliação Nativa Cronuz (independente do Horus)
    cronuz_baixa_enabled = Column(Boolean, nullable=False, default=True)
    cronuz_account_id = Column(Integer, ForeignKey("fin_account.id", ondelete="SET NULL"), nullable=True)

    # Baixa de Retorno & Lançamento Bancário no Horus ERP (BLANCTOS via TRG_IMP_LANCTO_CRECEBER)
    # 100% isolado da rotina da Vindi — exige Cora ativo E Horus SQL ativo para o seller
    horus_baixa_enabled = Column(Boolean, nullable=False, default=False)
    horus_cod_banco = Column(String(20), nullable=True)              # COD_BANCO em BCONTAC_GERAL / LANCTOS_CRECEBERA
    horus_cod_agencia = Column(String(20), nullable=True)            # COD_AGENCIA em BCONTAC_GERAL / LANCTOS_CRECEBERA
    horus_cod_contac = Column(String(20), nullable=True)             # COD_CONTAC em BCONTAC_GERAL / LANCTOS_CRECEBERA
    horus_nro_carteira = Column(String(20), nullable=True)           # NRO_CARTEIRA em BCONTAC_CARTEIRA / LANCTOS_CRECEBERA
    horus_cod_forma = Column(String(20), nullable=True)              # COD_FORMA em FORMA_PAGTO (ex: 30 = BOLETO CORA)
    horus_tarifa_boleto = Column(Numeric(10, 2), nullable=True)      # VLR_TARIF_BOL padrão (R$) por boleto liquidado

    # Lançamento e Baixa Automática da Tarifa do Boleto no Contas a Pagar do Horus (LANCTOS_CPAGAR_GERAL -> BLANCTOS via TRG_IMP_LANCTO_CPAGAR)
    horus_cpagar_tarifa_enabled = Column(Boolean, nullable=False, default=False)
    horus_cp_cod_grp_fornecedor = Column(String(20), nullable=True)  # COD_GRP_FORNECEDOR em LANCTOS_CPAGAR_GERAL (ex: 5)
    horus_cp_cod_fornecedor = Column(String(20), nullable=True)      # COD_FORNECEDOR em LANCTOS_CPAGAR_GERAL (ex: 310 = BANCO - TARIFAS BANCARIA)
    horus_cp_cod_departamento = Column(String(20), nullable=True)    # COD_DEPARTAMENTO em LANCTOS_CPAGAR_GERAL (ex: 7)
    horus_cp_cod_centro_custo = Column(String(20), nullable=True)    # COD_CENTRO_CUSTO em LANCTOS_CPAGAR_GERAL (ex: 5)
    horus_cp_cod_grup_desp = Column(String(20), nullable=True)       # COD_GRUP_DESP em LANCTOS_CPAGAR_GERAL (ex: 14)
    horus_cp_cod_despesa = Column(String(20), nullable=True)         # COD_DESPESA em LANCTOS_CPAGAR_GERAL (ex: 70)
    horus_cp_cod_forma = Column(String(20), nullable=True)           # COD_FORMA / COD_FORMA_BAIXA em LANCTOS_CPAGAR_GERAL (ex: 17 = DEBITO EM CONTA)

    updated_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    cronuz_account = relationship("FinancialAccount", foreign_keys=[cronuz_account_id])
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
