-- =============================================================================
-- DEPLOY: Módulo Distribuidores (Catavento, Disal, futuros parceiros)
-- Arquivo  : deploy/DEPLOY_distribuidores.sql
-- Criado em: 2026-09-10
-- Aplicar em: psql -U cronuz_admin -h localhost -d cronuz_b2b
-- =============================================================================

-- Tabela de credenciais de distribuidores por seller
CREATE TABLE IF NOT EXISTS dst_distributor (
    id              SERIAL PRIMARY KEY,
    company_id      INT NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    slug            VARCHAR(50)  NOT NULL,
    name            VARCHAR(100) NOT NULL,
    enabled         BOOLEAN      NOT NULL DEFAULT FALSE,
    base_url        VARCHAR(500),
    username        VARCHAR(255),
    password        VARCHAR(500),
    api_key         VARCHAR(500),
    token           TEXT,
    token_expires   TIMESTAMP WITH TIME ZONE,
    extra_config    JSONB,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_dst_company_slug UNIQUE (company_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_dst_distributor_company ON dst_distributor(company_id);
CREATE INDEX IF NOT EXISTS idx_dst_distributor_enabled ON dst_distributor(company_id, enabled);

-- Comentários
COMMENT ON TABLE dst_distributor IS 'Credenciais de distribuidores (Catavento, Disal, etc.) por seller';
COMMENT ON COLUMN dst_distributor.slug      IS 'Identificador único do distribuidor: catavento, disal, etc.';
COMMENT ON COLUMN dst_distributor.token     IS 'Token JWT/Bearer cacheado (Catavento). Renovado automaticamente ao expirar.';
COMMENT ON COLUMN dst_distributor.api_key   IS 'Chave de API estática (Disal: xLtOpenKeyId).';
COMMENT ON COLUMN dst_distributor.password  IS 'Senha armazenada em texto — proteger via acesso restrito ao DB.';
