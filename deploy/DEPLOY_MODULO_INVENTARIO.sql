-- ==============================================================================
-- DEPLOY: Módulo de Inventário (Cronuz B2B)
-- Data: 2026-09-15
-- Tabelas: cmp_company (alter), inv_inventory, inv_inventory_item,
--          inv_inventory_session, inv_inventory_scan
-- ==============================================================================

-- 1. Adicionar flag no cadastro de empresas (Master Toggle)
ALTER TABLE cmp_company 
ADD COLUMN IF NOT EXISTS has_inventory_module BOOLEAN DEFAULT FALSE NOT NULL;

-- 2. Enums para Inventário e Sessão
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inv_status_enum') THEN
        CREATE TYPE inv_status_enum AS ENUM ('EM_ANDAMENTO', 'FINALIZADO', 'CANCELADO');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inv_session_status_enum') THEN
        CREATE TYPE inv_session_status_enum AS ENUM ('ABERTA', 'CONCLUIDA', 'CANCELADA');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inv_session_type_enum') THEN
        CREATE TYPE inv_session_type_enum AS ENUM ('CONTAGEM', 'RECONTAGEM_AUDITORIA');
    END IF;
END$$;

-- 3. Tabela de Inventários
CREATE TABLE IF NOT EXISTS inv_inventory (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'EM_ANDAMENTO',
    description TEXT,
    total_expected_skus INTEGER NOT NULL DEFAULT 0,
    access_token VARCHAR(64) UNIQUE,
    is_public_access_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    created_by_user_id INTEGER REFERENCES usr_user(id),
    finalized_by_user_id INTEGER REFERENCES usr_user(id),
    finalized_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_inventory_company_status ON inv_inventory(company_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_inventory_code ON inv_inventory(company_id, code);

-- 4. Tabela de Itens Esperados / Base Carregada
CREATE TABLE IF NOT EXISTS inv_inventory_item (
    id SERIAL PRIMARY KEY,
    inventory_id INTEGER NOT NULL REFERENCES inv_inventory(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    isbn VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    publisher VARCHAR(255),
    category VARCHAR(100),
    default_location VARCHAR(100),
    is_unregistered BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_inv_item_inventory_isbn UNIQUE(inventory_id, isbn)
);

CREATE INDEX IF NOT EXISTS idx_inv_item_lookup ON inv_inventory_item(inventory_id, isbn);
CREATE INDEX IF NOT EXISTS idx_inv_item_location ON inv_inventory_item(inventory_id, default_location);

-- 5. Tabela de Sessões dos Contadores
CREATE TABLE IF NOT EXISTS inv_inventory_session (
    id SERIAL PRIMARY KEY,
    inventory_id INTEGER NOT NULL REFERENCES inv_inventory(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES usr_user(id),
    operator_name VARCHAR(255),
    location VARCHAR(100) NOT NULL,
    session_type VARCHAR(50) NOT NULL DEFAULT 'CONTAGEM',
    round_number INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'ABERTA',
    total_scans INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_session_lookup ON inv_inventory_session(inventory_id, location, status);
CREATE INDEX IF NOT EXISTS idx_inv_session_user ON inv_inventory_session(user_id, inventory_id);

-- 6. Tabela de Bips / Leituras Físicas (Idempotente com client_uuid)
CREATE TABLE IF NOT EXISTS inv_inventory_scan (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES inv_inventory_session(id) ON DELETE CASCADE,
    inventory_id INTEGER NOT NULL REFERENCES inv_inventory(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES usr_user(id),
    operator_name VARCHAR(255),
    isbn VARCHAR(50) NOT NULL,
    location VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    client_uuid VARCHAR(64) NOT NULL,
    scanned_at TIMESTAMP WITH TIME ZONE NOT NULL,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_inv_scan_client_uuid UNIQUE(session_id, client_uuid)
);

CREATE INDEX IF NOT EXISTS idx_inv_scan_isbn_inventory ON inv_inventory_scan(inventory_id, isbn);
CREATE INDEX IF NOT EXISTS idx_inv_scan_session ON inv_inventory_scan(session_id);
