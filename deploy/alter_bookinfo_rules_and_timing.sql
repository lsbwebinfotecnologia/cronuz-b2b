-- Deploy: Configuração de Timing de Análise Bookinfo e Regras Comerciais por Seller
-- Data: 2026-10-07

-- 1. Campos de configuração na tabela cmp_settings
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS bookinfo_analysis_timing VARCHAR(30) DEFAULT 'BEFORE_CONFERENCE' NOT NULL;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS bookinfo_min_stock_buffer INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS bookinfo_block_consign_low_stock BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS bookinfo_consign_low_stock_threshold INTEGER DEFAULT 5 NOT NULL;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS bookinfo_check_existing_consign_balance BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS bookinfo_max_consign_client_units INTEGER DEFAULT 10 NOT NULL;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS bookinfo_allow_partial_fulfill BOOLEAN DEFAULT TRUE NOT NULL;

-- 2. Identificação de cadastro ERP na tabela ord_order_item
ALTER TABLE ord_order_item ADD COLUMN IF NOT EXISTS has_erp_registration BOOLEAN DEFAULT TRUE NOT NULL;
