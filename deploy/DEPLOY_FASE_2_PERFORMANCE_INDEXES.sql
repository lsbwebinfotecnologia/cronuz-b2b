-- ==============================================================================
-- CRONUZ B2B - MIGRATION FASE 2: PERFORMANCE E ÍNDICES ESTRATÉGICOS (POSTGRESQL)
-- 
-- INSTRUÇÕES DE EXECUÇÃO:
-- 1. Executar no banco PostgreSQL (local ou produção):
--    PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f deploy/DEPLOY_FASE_2_PERFORMANCE_INDEXES.sql
-- 2. Todos os comandos usam "IF NOT EXISTS" para garantir 100% idempotência e ZERO perda de dados.
-- ==============================================================================

BEGIN;

-- 1. Tabela prd_product
CREATE INDEX IF NOT EXISTS idx_prd_product_company_id ON prd_product (company_id);
CREATE INDEX IF NOT EXISTS idx_prd_product_category_id ON prd_product (category_id);
CREATE INDEX IF NOT EXISTS idx_prd_product_brand_id ON prd_product (brand_id);
CREATE INDEX IF NOT EXISTS idx_prd_product_status ON prd_product (status);
CREATE INDEX IF NOT EXISTS idx_prd_product_company_status ON prd_product (company_id, status);

-- 2. Tabela crm_customer e subentidades
CREATE INDEX IF NOT EXISTS idx_crm_customer_company_id ON crm_customer (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_customer_company_doc ON crm_customer (company_id, document);
CREATE INDEX IF NOT EXISTS idx_crm_address_customer_id ON crm_address (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_contact_customer_id ON crm_contact (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_interaction_customer_id ON crm_interaction (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_interaction_seller_id ON crm_interaction (seller_id);
CREATE INDEX IF NOT EXISTS idx_crm_favorite_customer_id ON crm_customer_favorite (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_favorite_product_id ON crm_customer_favorite (product_id);

-- 3. Tabela ord_order e ord_order_item
CREATE INDEX IF NOT EXISTS idx_ord_order_item_order_id ON ord_order_item (order_id);
CREATE INDEX IF NOT EXISTS idx_ord_order_item_product_id ON ord_order_item (product_id);

-- 4. Tabela fin_installment e fin_account
CREATE INDEX IF NOT EXISTS idx_fin_installment_account_id ON fin_installment (account_id);
CREATE INDEX IF NOT EXISTS idx_fin_installment_status ON fin_installment (status);
CREATE INDEX IF NOT EXISTS idx_fin_installment_due_date ON fin_installment (due_date);
CREATE INDEX IF NOT EXISTS idx_fin_installment_status_due ON fin_installment (status, due_date);

-- 5. Tabela cmp_company
CREATE INDEX IF NOT EXISTS idx_cmp_company_tenant_id ON cmp_company (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cmp_company_active ON cmp_company (active);

-- 6. Tabela usr_user
CREATE INDEX IF NOT EXISTS idx_usr_user_company_id ON usr_user (company_id);

COMMIT;
