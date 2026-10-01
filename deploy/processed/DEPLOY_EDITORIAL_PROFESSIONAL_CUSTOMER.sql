-- ==============================================================================
-- DEPLOY: Vínculo do Profissional Editorial à Empresa/Fornecedor (crm_customer)
-- e Integração de Custos Editoriais com Contas a Pagar (fin_transaction)
-- ==============================================================================

-- 1. Adicionar colunas na tabela de profissionais editoriais (edt_professional)
ALTER TABLE edt_professional 
ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL;

ALTER TABLE edt_professional 
ADD COLUMN IF NOT EXISTS document VARCHAR(50);

CREATE INDEX IF NOT EXISTS ix_edt_professional_customer_id ON edt_professional(customer_id);
CREATE INDEX IF NOT EXISTS ix_edt_professional_document ON edt_professional(document);

-- 2. Adicionar coluna na tabela de custos editoriais (edt_project_cost) para amarrar com Contas a Pagar
ALTER TABLE edt_project_cost 
ADD COLUMN IF NOT EXISTS financial_transaction_id INTEGER REFERENCES fin_transaction(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_edt_project_cost_financial_transaction_id ON edt_project_cost(financial_transaction_id);
