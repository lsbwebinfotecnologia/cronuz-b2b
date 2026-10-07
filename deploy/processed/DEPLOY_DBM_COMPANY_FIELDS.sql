-- =========================================================================
-- Deploy Script: Campos da Tela de Empresa DBM no Cronuz B2B
-- Data: 2026-10-07
-- Tabelas: cmp_company e crm_customer
-- =========================================================================

-- 1. Campos na tabela cmp_company (Empresas do Cronuz)
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS group_name VARCHAR(150);
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS segment VARCHAR(150);
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS notes_message TEXT;
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS customer_account VARCHAR(150);
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS royalties_data TEXT;
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS is_cliente BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS is_fornecedor BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS horus_cod_cli INTEGER;
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS horus_cod_fornecedor INTEGER;

CREATE INDEX IF NOT EXISTS idx_cmp_company_horus_cod_cli ON cmp_company(horus_cod_cli);
CREATE INDEX IF NOT EXISTS idx_cmp_company_horus_cod_fornecedor ON cmp_company(horus_cod_fornecedor);

COMMENT ON COLUMN cmp_company.horus_cod_cli IS 'Código do cliente no Horus ERP (CLIENTES.COD_CLI)';
COMMENT ON COLUMN cmp_company.horus_cod_fornecedor IS 'Código do fornecedor no Horus ERP (FORNECEDORES.COD_FORNECEDOR)';
COMMENT ON COLUMN cmp_company.royalties_data IS 'Instruções e dados bancários para fechamento de royalties';

-- 2. Campos na tabela crm_customer (Clientes / Parceiros por Seller)
ALTER TABLE crm_customer ADD COLUMN IF NOT EXISTS group_name VARCHAR(150);
ALTER TABLE crm_customer ADD COLUMN IF NOT EXISTS segment VARCHAR(150);
ALTER TABLE crm_customer ADD COLUMN IF NOT EXISTS notes_message TEXT;
ALTER TABLE crm_customer ADD COLUMN IF NOT EXISTS customer_account VARCHAR(150);
ALTER TABLE crm_customer ADD COLUMN IF NOT EXISTS royalties_data TEXT;
ALTER TABLE crm_customer ADD COLUMN IF NOT EXISTS is_cliente BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE crm_customer ADD COLUMN IF NOT EXISTS is_fornecedor BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE crm_customer ADD COLUMN IF NOT EXISTS horus_cod_cli INTEGER;
ALTER TABLE crm_customer ADD COLUMN IF NOT EXISTS horus_cod_fornecedor INTEGER;
ALTER TABLE crm_customer ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE crm_customer ADD COLUMN IF NOT EXISTS state VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_crm_customer_horus_cod_cli ON crm_customer(company_id, horus_cod_cli);
CREATE INDEX IF NOT EXISTS idx_crm_customer_horus_cod_fornecedor ON crm_customer(company_id, horus_cod_fornecedor);
