-- Deploy: Vínculo de Produtos Pré-Cadastrados no Cronuz e Identificador de Cadastro ERP Hórus nas Encomendas
-- Compatível com PostgreSQL (Idempotente / Aditivo — sem UPDATE ou DELETE)

ALTER TABLE ord_customer_encomenda_item
    ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES prd_product(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS has_erp_registration BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_ord_customer_encomenda_item_prod
    ON ord_customer_encomenda_item(product_id);

ALTER TABLE ord_backorder
    ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES prd_product(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ord_backorder_prod
    ON ord_backorder(product_id);
