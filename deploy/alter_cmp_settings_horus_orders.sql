-- ==============================================================================
-- Deploy Script: Funcionalidade Pedidos no Horus Direct (cmp_settings)
-- ==============================================================================

ALTER TABLE cmp_settings 
ADD COLUMN IF NOT EXISTS horus_sql_feature_pedidos BOOLEAN DEFAULT FALSE NOT NULL;

ALTER TABLE cmp_settings 
ADD COLUMN IF NOT EXISTS horus_vendas_metodo VARCHAR(50);
