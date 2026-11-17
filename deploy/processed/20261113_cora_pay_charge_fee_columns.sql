-- =============================================================================
-- Migration: 20261113_cora_pay_charge_fee_columns.sql
-- Objetivo: Armazenar a tarifa bancária real (fee_amount), valor líquido (net_amount)
--           e descrição da tarifa (fee_description) em pay_charge para auditoria e análise.
-- =============================================================================

ALTER TABLE pay_charge
    ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS net_amount NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS fee_description VARCHAR(120);
