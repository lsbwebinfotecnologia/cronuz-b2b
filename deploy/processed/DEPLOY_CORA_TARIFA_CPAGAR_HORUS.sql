-- Migração: Lançamento e Baixa Automática da Tarifa de Boleto Cora no Contas a Pagar do Horus ERP
-- Tabela afetada no PostgreSQL (Cronuz B2B): fin_cora_config

ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_cpagar_tarifa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_cp_cod_grp_fornecedor VARCHAR(20);
ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_cp_cod_fornecedor VARCHAR(20);
ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_cp_cod_departamento VARCHAR(20);
ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_cp_cod_centro_custo VARCHAR(20);
ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_cp_cod_grup_desp VARCHAR(20);
ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_cp_cod_despesa VARCHAR(20);
ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS horus_cp_cod_forma VARCHAR(20);
