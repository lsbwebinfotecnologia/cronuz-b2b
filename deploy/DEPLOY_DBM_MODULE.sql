-- =========================================================================
-- Deploy Script: Módulo DBM (Painel Operacional & CRM) no Horus SQL Direct
-- Data: 2026-09-29
-- Tabela: cmp_settings
-- =========================================================================

-- Adiciona a coluna de controle do módulo DBM caso não exista
ALTER TABLE cmp_settings 
ADD COLUMN IF NOT EXISTS horus_sql_feature_dbm BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN cmp_settings.horus_sql_feature_dbm IS 'Habilita o módulo DBM (Painel Operacional & CRM) no Horus SQL Direct para o seller';

-- Adiciona a coluna horus_cod_item na tabela prd_product para rastreabilidade de análises futuras
ALTER TABLE prd_product
ADD COLUMN IF NOT EXISTS horus_cod_item INTEGER;

CREATE INDEX IF NOT EXISTS idx_prd_product_horus_cod_item ON prd_product(company_id, horus_cod_item);
COMMENT ON COLUMN prd_product.horus_cod_item IS 'Código do item no ERP Horus (Itens_estoque_geral / Itens_estpreco_atual) para integrações e análises';
