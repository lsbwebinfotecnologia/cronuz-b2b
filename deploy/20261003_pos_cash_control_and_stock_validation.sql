-- Script de Migração: Controle de Caixa (Fundo Inicial / Fechamento) e Validação de Estoque por Sessão
-- Data: 2026-10-03
-- Descrição: Permite configurar validação de saldo por sessão e registrar fundo de troco inicial e conferência de fechamento de caixa.

ALTER TABLE pos_session 
ADD COLUMN IF NOT EXISTS validate_stock BOOLEAN DEFAULT TRUE NOT NULL,
ADD COLUMN IF NOT EXISTS initial_cash_amount NUMERIC(12, 2) DEFAULT 0.00 NOT NULL,
ADD COLUMN IF NOT EXISTS closed_cash_amount NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS expected_cash_amount NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS cash_difference NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS closing_notes TEXT,
ADD COLUMN IF NOT EXISTS closed_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_session_validate_stock ON pos_session(validate_stock);
