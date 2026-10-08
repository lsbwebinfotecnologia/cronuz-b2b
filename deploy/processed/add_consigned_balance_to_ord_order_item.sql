-- Deploy: Adiciona coluna consigned_balance na tabela ord_order_item
-- Descricao: Armazena o saldo consignado do cliente para este item retornado pelo Horus ERP (campo REMESSA)
-- Data: 2026-10-07

ALTER TABLE ord_order_item ADD COLUMN IF NOT EXISTS consigned_balance INTEGER NOT NULL DEFAULT 0;
