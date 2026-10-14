-- ==============================================================================
-- Migração: Adição das colunas de CFOPs e flag de sincronização de BI do Hórus
-- Tabela afetada: cmp_settings
-- Data: 2026-10-14
-- ==============================================================================

DO $$
BEGIN
    -- 1. CFOPs de Venda Efetiva
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cmp_settings' AND column_name = 'sales_cfops'
    ) THEN
        ALTER TABLE cmp_settings ADD COLUMN sales_cfops VARCHAR(500) DEFAULT '5101,5102,6101,6102,5114,6114,5115,6115,5403,6403,5405,6405';
        RAISE NOTICE 'Coluna sales_cfops adicionada com sucesso.';
    END IF;

    -- 2. CFOPs de Remessa em Consignação
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cmp_settings' AND column_name = 'consign_cfops'
    ) THEN
        ALTER TABLE cmp_settings ADD COLUMN consign_cfops VARCHAR(500) DEFAULT '5917,6917';
        RAISE NOTICE 'Coluna consign_cfops adicionada com sucesso.';
    END IF;

    -- 3. CFOPs de Devolução de Venda
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cmp_settings' AND column_name = 'dev_sales_cfops'
    ) THEN
        ALTER TABLE cmp_settings ADD COLUMN dev_sales_cfops VARCHAR(500) DEFAULT '1201,1202,2201,2202,1411,2411';
        RAISE NOTICE 'Coluna dev_sales_cfops adicionada com sucesso.';
    END IF;

    -- 4. CFOPs de Devolução de Consignação
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cmp_settings' AND column_name = 'dev_consign_cfops'
    ) THEN
        ALTER TABLE cmp_settings ADD COLUMN dev_consign_cfops VARCHAR(500) DEFAULT '1918,2918';
        RAISE NOTICE 'Coluna dev_consign_cfops adicionada com sucesso.';
    END IF;

    -- 5. Flag para Habilitar Job/Rotina de Sincronização de BI do Hórus por Seller
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cmp_settings' AND column_name = 'horus_bi_sync_enabled'
    ) THEN
        ALTER TABLE cmp_settings ADD COLUMN horus_bi_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE;
        RAISE NOTICE 'Coluna horus_bi_sync_enabled adicionada com sucesso.';
    END IF;
END $$;
