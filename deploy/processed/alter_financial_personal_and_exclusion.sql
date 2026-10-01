-- Deploy: Adição de flags para contas pessoais e exclusão de análises gerenciais
-- Data: 2026-09-30
-- Contexto: Permite que despesas de contas físicas/pessoais ou lançamentos específicos
--           sejam omitidos de relatórios gerenciais e métricas da empresa.

-- 1. Contas bancárias: is_personal (True = conta pessoal/física, False = conta jurídica da empresa)
ALTER TABLE fin_account ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Transações e parcelas: exclude_from_reports (True = omitir de DRE, fluxo de caixa e dashboard empresarial)
ALTER TABLE fin_transaction ADD COLUMN IF NOT EXISTS exclude_from_reports BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fin_installment ADD COLUMN IF NOT EXISTS exclude_from_reports BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Índices de alta performance para filtros em relatórios
CREATE INDEX IF NOT EXISTS idx_fin_account_personal ON fin_account(company_id, is_personal);
CREATE INDEX IF NOT EXISTS idx_fin_trans_exclude ON fin_transaction(company_id, exclude_from_reports);
CREATE INDEX IF NOT EXISTS idx_fin_inst_exclude ON fin_installment(exclude_from_reports);
