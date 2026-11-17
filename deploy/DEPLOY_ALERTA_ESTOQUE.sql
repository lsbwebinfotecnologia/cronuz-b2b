-- =============================================================================
-- DEPLOY: Alerta Geral de Estoque (Visualização de Estoque & Mesa de Orçamento)
-- Tabela: cmp_settings
-- Coluna: stock_alert_threshold (INTEGER NOT NULL DEFAULT 0)
-- =============================================================================
-- Como executar em produção:
-- PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_ALERTA_ESTOQUE.sql
-- =============================================================================

ALTER TABLE cmp_settings
ADD COLUMN IF NOT EXISTS stock_alert_threshold INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN cmp_settings.stock_alert_threshold IS 'Quantidade limite para destacar itens com estoque menor ou igual em tom vermelho suave/rosado na pesquisa de estoque e na mesa de orcamento (0 = desativado).';
