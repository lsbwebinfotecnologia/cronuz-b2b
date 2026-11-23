-- =============================================================================
-- DEPLOY: Módulo Horus Direct -> Análise de Itens (Multi-Filial, Custos, Consignado & Reposição)
-- Tabela: cmp_settings
-- Coluna: horus_sql_feature_analise_itens (BOOLEAN NOT NULL DEFAULT FALSE)
-- =============================================================================
-- Como executar em produção:
-- PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_HORUS_ANALISE_ITENS.sql
-- =============================================================================

ALTER TABLE cmp_settings
ADD COLUMN IF NOT EXISTS horus_sql_feature_analise_itens BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN cmp_settings.horus_sql_feature_analise_itens IS 'Habilita a tela Horus Direct -> Analise Itens (/horus-direct/analise-itens) para o seller (isolada do DBM exclusivo da EO Editora Olhares).';
