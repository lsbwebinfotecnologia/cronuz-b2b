-- Migration: Adiciona coluna cod_ped_venda na tabela cmp_order_conference
-- Data: 2026-07-29

ALTER TABLE cmp_order_conference 
    ADD COLUMN IF NOT EXISTS cod_ped_venda VARCHAR(50) DEFAULT NULL;

COMMENT ON COLUMN cmp_order_conference.cod_ped_venda IS 'Código do pedido de venda no Hórus associado à conferência logística';
