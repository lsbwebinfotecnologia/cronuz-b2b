-- Migration: Adiciona campos B2C da Remessa na tabela dsp_config
-- Data: 2026-07-29
-- Descrição: COD_TRANSP, FRETE_EMIT_DEST e status de envio ao ERP para pedido de remessa dropship

ALTER TABLE dsp_config
    ADD COLUMN IF NOT EXISTS horus_cod_transp       VARCHAR(20)  DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS horus_frete_emit_dest  VARCHAR(5)   DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS horus_status_envio_erp VARCHAR(20)  DEFAULT NULL;

COMMENT ON COLUMN dsp_config.horus_cod_transp       IS 'COD_TRANSP — código da transportadora obrigatório no pedido de remessa B2C';
COMMENT ON COLUMN dsp_config.horus_frete_emit_dest  IS 'FRETE_EMIT_DEST: 1=por conta do emitente, 2=por conta do destinatário';
COMMENT ON COLUMN dsp_config.horus_status_envio_erp IS 'Código de status enviado via AltStatus_Pedido após criação da remessa (ex: LEX)';
-- Adiciona horus_customer_cod_cli na tabela dsp_config
ALTER TABLE dsp_config ADD COLUMN IF NOT EXISTS horus_customer_cod_cli VARCHAR(50) DEFAULT NULL;
COMMENT ON COLUMN dsp_config.horus_customer_cod_cli IS 'COD_CLI do cliente parceiro (ex: ERDOS) no Hórus, buscado e armazenado ao vincular';
