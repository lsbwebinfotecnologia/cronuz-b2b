-- ============================================================
-- DEPLOY: Revisão do Fluxo Send-to-Hórus — Cliente Final
-- Data: 2026-07-29
-- Ambiente: PostgreSQL (produção)
-- ============================================================

-- 1. Novos campos em dsp_config (parâmetros fiscais intra/inter + cliente + pedido)
ALTER TABLE dsp_config
  ADD COLUMN IF NOT EXISTS horus_fiscal_param_remessa_intra VARCHAR(50),
  ADD COLUMN IF NOT EXISTS horus_fiscal_param_remessa_inter VARCHAR(50),
  ADD COLUMN IF NOT EXISTS horus_tipo_cliente    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS horus_resp_cliente    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS horus_cod_resp        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS horus_cod_endereco    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS horus_cod_metodo      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS horus_cod_endereco_pedido VARCHAR(20);

-- Nota: horus_fiscal_param_remessa (legado) é mantido para compatibilidade.
-- O novo fluxo usa horus_fiscal_param_remessa_intra e horus_fiscal_param_remessa_inter.

-- 2. COD_CLI do cliente final no pedido
ALTER TABLE dsp_order
  ADD COLUMN IF NOT EXISTS horus_cod_cli_final VARCHAR(50);

-- 3. Cache de COD_ITEM/VLR_CAPA por ISBN (TTL 24h em aplicação)
CREATE TABLE IF NOT EXISTS dsp_item_cache (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES cmp_company(id),
  isbn       VARCHAR(30) NOT NULL,
  horus_cod_item VARCHAR(50),
  horus_vlr_capa NUMERIC(10,2),
  cached_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (company_id, isbn)
);

CREATE INDEX IF NOT EXISTS idx_dsp_item_cache_lookup
  ON dsp_item_cache(company_id, isbn);

-- ============================================================
-- FIM DO SCRIPT
-- ============================================================
