-- ==============================================================================
-- CRONUZ B2B - MIGRAÇÃO CONSOLIDADA PARA PRODUÇÃO
-- Data: 2026-09-30
-- Todos os comandos usam IF NOT EXISTS (100% idempotente e seguro)
-- ==============================================================================

BEGIN;

-- 1. Contas Pessoais e Exclusão Gerencial
ALTER TABLE fin_account ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fin_transaction ADD COLUMN IF NOT EXISTS exclude_from_reports BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fin_installment ADD COLUMN IF NOT EXISTS exclude_from_reports BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_fin_account_personal ON fin_account(company_id, is_personal);
CREATE INDEX IF NOT EXISTS idx_fin_trans_exclude ON fin_transaction(company_id, exclude_from_reports);
CREATE INDEX IF NOT EXISTS idx_fin_inst_exclude ON fin_installment(exclude_from_reports);

-- 2. Agrupador de O.S. e Parcelas Financeiras
ALTER TABLE svc_service_order ADD COLUMN IF NOT EXISTS grouped_in_id INTEGER REFERENCES svc_service_order(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_svc_so_grouped_in ON svc_service_order(grouped_in_id);
ALTER TABLE fin_installment ADD COLUMN IF NOT EXISTS grouped_in_id INTEGER REFERENCES fin_installment(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fin_inst_grouped_in ON fin_installment(grouped_in_id);

-- 3. Módulo DBM e Códigos ERP Horus
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_feature_dbm BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS horus_cod_item INTEGER;
CREATE INDEX IF NOT EXISTS idx_prd_product_horus_cod_item ON prd_product(company_id, horus_cod_item);

-- 4. Profissional Editorial e Custos com Financeiro
ALTER TABLE edt_professional ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL;
ALTER TABLE edt_professional ADD COLUMN IF NOT EXISTS document VARCHAR(50);
CREATE INDEX IF NOT EXISTS ix_edt_professional_customer_id ON edt_professional(customer_id);
CREATE INDEX IF NOT EXISTS ix_edt_professional_document ON edt_professional(document);
ALTER TABLE edt_project_cost ADD COLUMN IF NOT EXISTS financial_transaction_id INTEGER REFERENCES fin_transaction(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_edt_project_cost_financial_transaction_id ON edt_project_cost(financial_transaction_id);

-- 5. Índices de Alta Performance
CREATE INDEX IF NOT EXISTS idx_prd_product_company_id ON prd_product (company_id);
CREATE INDEX IF NOT EXISTS idx_prd_product_category_id ON prd_product (category_id);
CREATE INDEX IF NOT EXISTS idx_prd_product_brand_id ON prd_product (brand_id);
CREATE INDEX IF NOT EXISTS idx_prd_product_status ON prd_product (status);
CREATE INDEX IF NOT EXISTS idx_prd_product_company_status ON prd_product (company_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_customer_company_id ON crm_customer (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_customer_company_doc ON crm_customer (company_id, document);
CREATE INDEX IF NOT EXISTS idx_crm_address_customer_id ON crm_address (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_contact_customer_id ON crm_contact (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_interaction_customer_id ON crm_interaction (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_interaction_seller_id ON crm_interaction (seller_id);
CREATE INDEX IF NOT EXISTS idx_crm_favorite_customer_id ON crm_customer_favorite (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_favorite_product_id ON crm_customer_favorite (product_id);
CREATE INDEX IF NOT EXISTS idx_ord_order_item_order_id ON ord_order_item (order_id);
CREATE INDEX IF NOT EXISTS idx_ord_order_item_product_id ON ord_order_item (product_id);
CREATE INDEX IF NOT EXISTS idx_fin_installment_account_id ON fin_installment (account_id);
CREATE INDEX IF NOT EXISTS idx_fin_installment_status ON fin_installment (status);
CREATE INDEX IF NOT EXISTS idx_fin_installment_due_date ON fin_installment (due_date);
CREATE INDEX IF NOT EXISTS idx_fin_installment_status_due ON fin_installment (status, due_date);
CREATE INDEX IF NOT EXISTS idx_cmp_company_tenant_id ON cmp_company (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cmp_company_active ON cmp_company (active);
CREATE INDEX IF NOT EXISTS idx_usr_user_company_id ON usr_user (company_id);

COMMIT;
