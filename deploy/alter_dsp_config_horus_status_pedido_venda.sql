-- Migration: adiciona horus_status_pedido_venda à tabela dsp_config
-- Criado em: 2026-08-04
-- Motivo: status AltStatus enviado ao Hórus no pedido de Venda quando usar_pedido_remessa=false
ALTER TABLE dsp_config
  ADD COLUMN IF NOT EXISTS horus_status_pedido_venda VARCHAR(20) DEFAULT NULL;

COMMENT ON COLUMN dsp_config.horus_status_pedido_venda IS
  'Status enviado via AltStatus_Pedido após criar o pedido de Venda (6.118) quando usar_pedido_remessa=false. Padrão: LEX.';
