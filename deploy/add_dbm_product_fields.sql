-- Deploy: Adiciona campos específicos do módulo Horus Direct DBM (Cadastro de Livros Access + Multi-ISBNs E-book)
-- Tabela: prd_product
-- Data: 2026-11-03

ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS additional_isbns TEXT;
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS barcode VARCHAR(50);
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS cod_dbm VARCHAR(50);
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS publisher_code VARCHAR(100);
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS pages INTEGER;
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS launch_month INTEGER;
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS launch_year INTEGER;
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS collection VARCHAR(150);
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS subject VARCHAR(150);
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS binding_finish VARCHAR(100);
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS royalty_rule VARCHAR(100);
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS edition_number VARCHAR(50);
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS units_per_box INTEGER;
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS out_of_print_date VARCHAR(30);
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS external_link VARCHAR(500);
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS royalty_company VARCHAR(200);
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS ebook_royalty_pct DOUBLE PRECISION;
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS contract_signed_date VARCHAR(30);
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS contract_validity_years INTEGER;
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS contract_expires_date VARCHAR(30);
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS dbm_tiragens TEXT;

CREATE INDEX IF NOT EXISTS idx_prd_product_ean_gtin ON prd_product(company_id, ean_gtin);
CREATE INDEX IF NOT EXISTS idx_prd_product_horus_cod_item ON prd_product(company_id, horus_cod_item);
