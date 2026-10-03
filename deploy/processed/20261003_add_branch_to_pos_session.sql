-- Script de Migração: Adição de filial na sessão do PDV (Horus em Tempo Real)
-- Data: 2026-10-03
-- Descrição: Permite associar uma filial (cmp_seller_branch) a uma sessão de PDV para consulta de saldo/preço em tempo real no Horus.

ALTER TABLE pos_session 
ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES cmp_seller_branch(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_session_branch_id ON pos_session(branch_id);
