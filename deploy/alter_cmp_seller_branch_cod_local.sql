-- Migration: Adiciona coluna cod_local na tabela cmp_seller_branch
-- Data: 2026-07-29

ALTER TABLE cmp_seller_branch 
    ADD COLUMN IF NOT EXISTS cod_local VARCHAR(50) DEFAULT NULL;

COMMENT ON COLUMN cmp_seller_branch.cod_local IS 'Código de Local de Estoque no Hórus cadastrado por filial (usado na conferência logística)';
