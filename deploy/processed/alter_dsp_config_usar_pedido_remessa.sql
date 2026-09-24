-- Migration: adiciona campo usar_pedido_remessa à tabela dsp_config
-- Criado em: 2026-08-04
-- Motivo: configuração por seller para enviar somente pedido de Venda (6.118)
--         sem pedido de Remessa (6.923), colocando dados do cliente na OBS.

ALTER TABLE dsp_config
  ADD COLUMN IF NOT EXISTS usar_pedido_remessa BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN dsp_config.usar_pedido_remessa IS
  'true (padrão): cria Remessa (6.923) + Venda (6.118). false: apenas Venda (6.118) com dados do cliente em OBS_PEDIDO.';
