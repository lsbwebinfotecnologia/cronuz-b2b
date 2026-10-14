-- ==============================================================================
-- DEPLOY: Criação da Tabela de Endereçamento Físico de Produtos (Multi-endereço)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS prd_product_address (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES cmp_seller_branch(id) ON DELETE CASCADE,
    cod_local_estoque VARCHAR(50),
    isbn VARCHAR(32) NOT NULL,
    horus_cod_item VARCHAR(50),
    title VARCHAR(255),
    address VARCHAR(100) NOT NULL,
    notes TEXT,
    created_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices de consulta de alta performance
CREATE INDEX IF NOT EXISTS idx_prd_address_company_branch ON prd_product_address(company_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_prd_address_isbn ON prd_product_address(company_id, isbn);
CREATE INDEX IF NOT EXISTS idx_prd_address_horus_cod ON prd_product_address(company_id, horus_cod_item);
CREATE INDEX IF NOT EXISTS idx_prd_address_location ON prd_product_address(company_id, branch_id, address);

-- Garante idempotência: evita duplicidade do exato mesmo endereço para o mesmo produto na mesma filial e local
CREATE UNIQUE INDEX IF NOT EXISTS uq_prd_address_exact ON prd_product_address(company_id, branch_id, COALESCE(cod_local_estoque, ''), isbn, address);
