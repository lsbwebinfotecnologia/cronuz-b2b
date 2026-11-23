-- ============================================================================
-- DEPLOY: Estoque Mínimo por Produto e por Filial Configurada (Análise de Itens)
-- Data: 2026-11-23
-- ============================================================================

CREATE TABLE IF NOT EXISTS prd_branch_min_stock (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL,
    isbn VARCHAR(50) NOT NULL,
    product_id INTEGER REFERENCES prd_product(id) ON DELETE SET NULL,
    min_stock INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_prd_branch_min_stock_company_branch_isbn UNIQUE (company_id, branch_id, isbn)
);

CREATE INDEX IF NOT EXISTS ix_prd_branch_min_stock_lookup
    ON prd_branch_min_stock (company_id, branch_id, isbn);

CREATE INDEX IF NOT EXISTS ix_prd_branch_min_stock_prod
    ON prd_branch_min_stock (company_id, product_id);

COMMENT ON TABLE prd_branch_min_stock IS
'Armazena o estoque mínimo por ISBN e por Filial Configurada (cmp_seller_branch) para alertas laranja/vermelho no módulo Horus Direct -> Análise de Itens.';
