-- Script de Migração: Configurações de Parcelamento do Cartão de Crédito no PDV
-- Data: 2026-10-11
-- Descrição: Adiciona colunas de parcelamento máximo e valor mínimo de parcela na tabela cmp_settings.

ALTER TABLE cmp_settings
ADD COLUMN IF NOT EXISTS pdv_max_installments INTEGER DEFAULT 12 NOT NULL,
ADD COLUMN IF NOT EXISTS pdv_min_installment_amount NUMERIC(10, 2) DEFAULT 5.00 NOT NULL;
