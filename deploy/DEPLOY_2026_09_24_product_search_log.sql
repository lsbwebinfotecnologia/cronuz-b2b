-- ==============================================================================
-- DEPLOY: Criação da Tabela de Logs Analíticos de Busca de Produtos (Busca Preço)
-- Data: 2026-09-24
-- Finalidade: Registrar produtos/termos consultados via Web e Mobile (App) para
--            análise de tendências, mais buscados e inteligência de vendas.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS log_product_search (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    search_term VARCHAR(255) NOT NULL,
    search_option VARCHAR(50) NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'web',
    matched_cod_item INTEGER,
    matched_isbn VARCHAR(50),
    matched_name VARCHAR(255),
    total_results INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Índices de Alta Performance para Relatórios e Agregações
CREATE INDEX IF NOT EXISTS ix_log_product_search_id ON log_product_search(id);
CREATE INDEX IF NOT EXISTS ix_log_product_search_company_id ON log_product_search(company_id);
CREATE INDEX IF NOT EXISTS ix_log_product_search_user_id ON log_product_search(user_id);
CREATE INDEX IF NOT EXISTS ix_log_product_search_search_term ON log_product_search(search_term);
CREATE INDEX IF NOT EXISTS ix_log_product_search_matched_cod_item ON log_product_search(matched_cod_item);
CREATE INDEX IF NOT EXISTS ix_log_product_search_matched_isbn ON log_product_search(matched_isbn);
CREATE INDEX IF NOT EXISTS ix_log_product_search_created_at ON log_product_search(created_at);

-- Índices Compostos para Consultas de Ranking e Filtros
CREATE INDEX IF NOT EXISTS ix_log_prod_search_company_date ON log_product_search(company_id, created_at);
CREATE INDEX IF NOT EXISTS ix_log_prod_search_term_count ON log_product_search(company_id, search_term);
CREATE INDEX IF NOT EXISTS ix_log_prod_search_isbn_count ON log_product_search(company_id, matched_isbn);
