-- Migration: Create Dynamic Showcases and Items
-- Table: mkt_dynamic_showcase
CREATE TABLE IF NOT EXISTS mkt_dynamic_showcase (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    search_source VARCHAR(20) NOT NULL DEFAULT 'CRONUZ', -- 'CRONUZ' or 'HORUS_API'
    active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 1,
    banner_url VARCHAR(500),
    start_date TIMESTAMP WITH TIME ZONE NULL,
    end_date TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_dynamic_showcase_company ON mkt_dynamic_showcase(company_id);
CREATE INDEX IF NOT EXISTS idx_mkt_dynamic_showcase_active ON mkt_dynamic_showcase(company_id, active);

-- Table: mkt_dynamic_showcase_item
CREATE TABLE IF NOT EXISTS mkt_dynamic_showcase_item (
    id SERIAL PRIMARY KEY,
    showcase_id INTEGER NOT NULL REFERENCES mkt_dynamic_showcase(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES prd_product(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_dynamic_showcase_product UNIQUE (showcase_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_mkt_dynamic_showcase_item_showcase ON mkt_dynamic_showcase_item(showcase_id);
CREATE INDEX IF NOT EXISTS idx_mkt_dynamic_showcase_item_product ON mkt_dynamic_showcase_item(product_id);
