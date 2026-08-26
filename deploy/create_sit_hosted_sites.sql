-- Script de migração para Hospedagem de Sites Institucionais no Cronuz B2B
-- Tabela de sites estáticos hospedados

CREATE TABLE IF NOT EXISTS sit_hosted_sites (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    custom_domain VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending_upload',
    zip_filename VARCHAR(255),
    zip_size_bytes BIGINT,
    has_index BOOLEAN NOT NULL DEFAULT FALSE,
    files_count INTEGER NOT NULL DEFAULT 0,
    storage_path VARCHAR(500),
    last_deployed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sit_hosted_sites_slug ON sit_hosted_sites(slug);
CREATE INDEX IF NOT EXISTS idx_sit_hosted_sites_status ON sit_hosted_sites(status);
