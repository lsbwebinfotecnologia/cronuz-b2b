from sqlalchemy import Column, Integer, String, Float, Numeric, ForeignKey, DateTime, Boolean, JSON, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from app.db.session import Base


class DropshipConfig(Base):
    """
    Configuração de Dropshipping por seller/company.
    Extensível para múltiplos provedores (ERDOS, futuro: outros).
    """
    __tablename__ = "dsp_config"
    __table_args__ = (
        UniqueConstraint('company_id', 'provider', name='uix_dsp_config_company_provider'),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)

    # Provider identifier — extensível: ERDOS, ...
    provider = Column(String(50), nullable=False, default="ERDOS")
    enabled = Column(Boolean, default=False, nullable=False)

    # Credenciais do Hub externo
    api_token = Column(String(512), nullable=True)
    api_base_url = Column(String(512), nullable=True)

    # Vínculo com customer Cronuz que representa o parceiro (ex: ERDOS)
    # O customer deve ter id_guid e id_doc configurados para uso na API Hórus
    horus_customer_id = Column(Integer, ForeignKey("crm_customer.id"), nullable=True, index=True)
    horus_customer_cod_cli = Column(String(50), nullable=True) # COD_CLI do customer ERDOS no Hórus

    # ─────────────────────────────────────────────────────────────────
    # Parâmetros fiscais da REMESSA (por estado)
    # ─────────────────────────────────────────────────────────────────
    # Intraestadual: UF do cliente == UF do seller
    horus_fiscal_param_remessa_intra = Column(String(50), nullable=True)
    # Interestadual: UF do cliente != UF do seller
    horus_fiscal_param_remessa_inter = Column(String(50), nullable=True)
    # Campo legado (mantido para compatibilidade — usar os dois acima no novo fluxo)
    horus_fiscal_param_remessa = Column(String(50), nullable=True)

    # Venda: CFOP 5.118/6.118 — tipo VENDA, não baixa estoque
    horus_fiscal_param_venda = Column(String(50), nullable=True)

    # ─────────────────────────────────────────────────────────────────
    # Parâmetros do cliente no Hórus (para InsCliente / InsPedidoVenda)
    # ─────────────────────────────────────────────────────────────────
    horus_tipo_cliente    = Column(String(20), nullable=True)   # Tipo de cliente (código)
    horus_resp_cliente    = Column(String(20), nullable=True)   # Responsável do cliente
    horus_cod_resp        = Column(String(20), nullable=True)   # Código do responsável
    horus_cod_endereco    = Column(String(20), nullable=True)   # Código do endereço padrão

    # ─────────────────────────────────────────────────────────────────
    # Parâmetros do pedido no Hórus
    # ─────────────────────────────────────────────────────────────────
    horus_cod_metodo         = Column(String(20), nullable=True)  # Código do método de envio
    horus_cod_endereco_pedido = Column(String(20), nullable=True) # Código do endereço do pedido
    # Parâmetros exclusivos do pedido de Remessa (B2C)
    horus_cod_transp          = Column(String(20), nullable=True)  # COD_TRANSP — transportadora obrigatória
    horus_frete_emit_dest     = Column(String(5),  nullable=True)  # FRETE_EMIT_DEST: 1=emitente, 2=destinatário
    horus_status_envio_erp    = Column(String(20), nullable=True)  # Status via AltStatus_Pedido após envio (ex: LEX)

    # ─────────────────────────────────────────────────────────────────
    # Parâmetros financeiros dos pedidos Hórus
    # ─────────────────────────────────────────────────────────────────
    # Valor fixo de frete (VLR_FRETE) adicionado ao pedido de VENDA (6.118)
    vlr_taxa_frete = Column(Numeric(10, 2), nullable=True, default=0.0)
    # Percentual de desconto aplicado sobre VLR_LIQUIDO nos itens da REMESSA (6.923)
    perc_desconto_remessa = Column(Numeric(5, 2), nullable=True, default=0.0)

    # Sincronização de estoque
    stock_sync_interval_min = Column(Integer, default=30, nullable=False)
    stock_sync_last_run = Column(DateTime(timezone=True), nullable=True)
    stock_sync_enabled = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    company = relationship("Company", foreign_keys=[company_id])
    horus_customer = relationship("Customer", foreign_keys=[horus_customer_id])
    orders = relationship("DropshipOrder", back_populates="config", cascade="all, delete-orphan", foreign_keys="DropshipOrder.config_id")


class DropshipOrder(Base):
    """
    Pedido de dropshipping sincronizado do hub externo.
    Armazena o ciclo completo: from sync → send-to-horus → dispatch.
    """
    __tablename__ = "dsp_order"
    __table_args__ = (
        UniqueConstraint('company_id', 'external_order_id', name='uix_dsp_order_company_external'),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    config_id = Column(Integer, ForeignKey("dsp_config.id"), nullable=False, index=True)

    # Dados do hub externo
    external_order_id = Column(String(255), nullable=False, index=True)   # id_pedido_erdos
    external_reference = Column(String(100), nullable=True)               # referencia (#93297-A)
    channel = Column(String(100), nullable=True)                          # canal_origem (woocommerce, etc)

    # Status interno do fluxo dropship
    # PENDING → SENT_TO_HORUS → DISPATCHED | CANCELLED
    status = Column(String(50), nullable=False, default="PENDING")

    released_at = Column(DateTime(timezone=True), nullable=True)          # data_liberacao do hub

    # JSON payloads completos do hub (armazenados para reprocessamento e histórico)
    customer_data = Column(JSON, nullable=True)   # dados_cliente
    items_data = Column(JSON, nullable=True)       # itens
    logistics_data = Column(JSON, nullable=True)   # logistica (forma_envio)
    fiscal_data = Column(JSON, nullable=True)      # documentos_fiscais (chave, urls originais)

    # Referências dos pedidos no Hórus ERP (gerados ao enviar)
    horus_pedido_remessa = Column(String(100), nullable=True)    # COD_PED_VENDA pedido de remessa (6.923)
    horus_pedido_venda = Column(String(100), nullable=True)      # COD_PED_VENDA pedido de venda (6.118)

    # COD_CLI do cliente final no Hórus (salvo após primeira busca/criação para reutilização)
    horus_cod_cli_final = Column(String(50), nullable=True)

    # Despacho
    tracking_code = Column(String(100), nullable=True)
    nfe_remessa_key = Column(String(100), nullable=True)         # Chave NF-e de remessa (6.923)

    # Caminhos locais dos documentos baixados do hub (URLs expiram em 1h)
    label_path = Column(String(512), nullable=True)              # uploads/.../etiqueta.pdf
    danfe_path = Column(String(512), nullable=True)              # uploads/.../danfe.pdf
    xml_path = Column(String(512), nullable=True)                # uploads/.../nfe.xml

    # Auditoria
    synced_at = Column(DateTime(timezone=True), nullable=True)
    sent_to_horus_at = Column(DateTime(timezone=True), nullable=True)
    dispatched_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Status real no Erdos (última consulta via GET /pedidos/{id})
    # Valores possíveis: aguardando | preparando | postado | cancelado | entregue
    erdos_status = Column(String(50), nullable=True)
    erdos_checked_at = Column(DateTime(timezone=True), nullable=True)

    # Alerta bloqueante: True quando cancelado no Erdos APÓS envio ao Hórus.
    # O usuário precisa cancelar manualmente no Hórus antes de prosseguir.
    erdos_alert = Column(Boolean, default=False, nullable=False)

    # Log de eventos do ciclo de vida (array JSON)
    # Cada entrada: {\"at\": ISO, \"event\": str, \"detail\": str}
    logs = Column(JSON, nullable=True, default=list)

    # Relationships
    company = relationship("Company", foreign_keys=[company_id])
    config = relationship("DropshipConfig", back_populates="orders", foreign_keys=[config_id])


class DropshipItemCache(Base):
    """
    Cache de COD_ITEM e VLR_CAPA do Hórus por ISBN/EAN por seller.
    Evita múltiplas chamadas à API do Hórus para o mesmo item.
    TTL: 24 horas (validado na camada de aplicação).
    """
    __tablename__ = "dsp_item_cache"
    __table_args__ = (
        UniqueConstraint('company_id', 'isbn', name='uix_dsp_item_cache_company_isbn'),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)

    isbn = Column(String(30), nullable=False, index=True)       # ISBN/EAN do item
    horus_cod_item = Column(String(50), nullable=True)          # COD_ITEM retornado pelo Hórus
    horus_vlr_capa = Column(Numeric(10, 2), nullable=True)      # Preço de capa do Hórus

    cached_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationship
    company = relationship("Company", foreign_keys=[company_id])
