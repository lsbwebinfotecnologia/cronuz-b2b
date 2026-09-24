-- ============================================================
-- DEPLOY CRONUZ B2B: Dropship & Conferência Logística Hórus
-- Data: 2026-07-30
-- Ambiente: PostgreSQL (Produção)
-- ============================================================

-- 1. Novos campos em dsp_config
ALTER TABLE dsp_config
  ADD COLUMN IF NOT EXISTS horus_fiscal_param_remessa_intra VARCHAR(50),
  ADD COLUMN IF NOT EXISTS horus_fiscal_param_remessa_inter VARCHAR(50),
  ADD COLUMN IF NOT EXISTS horus_tipo_cliente    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS horus_resp_cliente    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS horus_cod_resp        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS horus_cod_endereco    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS horus_cod_metodo      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS horus_cod_endereco_pedido VARCHAR(20),
  ADD COLUMN IF NOT EXISTS horus_cod_transp       VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS horus_frete_emit_dest  VARCHAR(5)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS horus_status_envio_erp VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS horus_customer_cod_cli VARCHAR(50) DEFAULT NULL;

-- 2. COD_CLI do cliente final no pedido dsp_order
ALTER TABLE dsp_order
  ADD COLUMN IF NOT EXISTS horus_cod_cli_final VARCHAR(50);

-- 3. Cache de COD_ITEM/VLR_CAPA por ISBN
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

-- 4. Coluna cod_ped_venda na tabela cmp_order_conference
ALTER TABLE cmp_order_conference 
    ADD COLUMN IF NOT EXISTS cod_ped_venda VARCHAR(50) DEFAULT NULL;

-- 5. Coluna cod_local na tabela cmp_seller_branch
ALTER TABLE cmp_seller_branch 
    ADD COLUMN IF NOT EXISTS cod_local VARCHAR(50) DEFAULT NULL;

-- ============================================================
-- FIM DO SCRIPT DE DEPLOY
-- ============================================================
