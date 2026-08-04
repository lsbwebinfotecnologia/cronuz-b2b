-- =============================================================================
-- DEPLOY: Adiciona campos financeiros na tabela dsp_config
-- Data: 2026-08-04
-- Ref: Taxa de frete (VLR_FRETE) no pedido de Venda + Desconto % nos itens da Remessa
-- =============================================================================

ALTER TABLE dsp_config
  ADD COLUMN IF NOT EXISTS vlr_taxa_frete NUMERIC(10, 2) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS perc_desconto_remessa NUMERIC(5, 2) DEFAULT 0.0;

-- Verificação após alteração
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'dsp_config'
  AND column_name IN ('vlr_taxa_frete', 'perc_desconto_remessa');
