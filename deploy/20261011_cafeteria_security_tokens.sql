-- ==============================================================================
-- Migration: Tokens Seguros para Cardápio e Mesas da Cafeteria
-- Data: 2026-10-11
-- Descrição:
--   1. Adiciona cafeteria_menu_token na tabela cmp_settings
--   2. Adiciona table_token na tabela caf_table
--   3. Popula tokens aleatórios seguros pré-existentes
-- ==============================================================================

-- 1. Token público do Cardápio da Empresa
ALTER TABLE cmp_settings
ADD COLUMN IF NOT EXISTS cafeteria_menu_token VARCHAR(64) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_cmp_settings_cafeteria_menu_token ON cmp_settings(cafeteria_menu_token);

-- Popula tokens iniciais para empresas
UPDATE cmp_settings
SET cafeteria_menu_token = 'crd_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16)
WHERE cafeteria_menu_token IS NULL;

-- 2. Token da Mesa física para validação de pedidos / garçom
ALTER TABLE caf_table
ADD COLUMN IF NOT EXISTS table_token VARCHAR(64) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_caf_table_table_token ON caf_table(table_token);

-- Popula tokens iniciais para todas as mesas ativas
UPDATE caf_table
SET table_token = 'tab_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)
WHERE table_token IS NULL;
