-- ==============================================================================
-- Migration: Criação da tabela logistics_order_logs para histórico e auditoria
-- Data: 2026-09-23
-- Descrição: Registra os eventos, payloads e respostas do Horus e WMS na esteira logística.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS logistics_order_logs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    cod_ped_venda INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    request_data TEXT,
    response_data TEXT,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices de alta performance para busca e rotina de expurgo (30 dias)
CREATE INDEX IF NOT EXISTS idx_logistics_order_logs_company_id ON logistics_order_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_logistics_order_logs_cod_ped_venda ON logistics_order_logs(cod_ped_venda);
CREATE INDEX IF NOT EXISTS idx_logistics_order_logs_action ON logistics_order_logs(action);
CREATE INDEX IF NOT EXISTS idx_logistics_order_logs_status ON logistics_order_logs(status);
CREATE INDEX IF NOT EXISTS idx_logistics_order_logs_created_at ON logistics_order_logs(created_at);
