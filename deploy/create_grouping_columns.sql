-- Deploy: Adiciona colunas para rastreabilidade de agrupamento em O.S. e Parcelas Financeiras
-- Data: 2026-09-30

-- 1. Ordens de Serviço (svc_service_order)
ALTER TABLE svc_service_order 
ADD COLUMN IF NOT EXISTS grouped_in_id INTEGER REFERENCES svc_service_order(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_svc_so_grouped_in ON svc_service_order(grouped_in_id);

-- 2. Parcelas Financeiras (fin_installment)
ALTER TABLE fin_installment 
ADD COLUMN IF NOT EXISTS grouped_in_id INTEGER REFERENCES fin_installment(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_inst_grouped_in ON fin_installment(grouped_in_id);
