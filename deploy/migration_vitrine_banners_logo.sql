-- Migration: Adicionar suporte a Banner Mobile e Logo na Vitrine Dinâmica e Eventos
ALTER TABLE mkt_dynamic_showcase ADD COLUMN IF NOT EXISTS banner_mobile_url VARCHAR(500);
ALTER TABLE mkt_dynamic_showcase ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500);

ALTER TABLE sch_event ADD COLUMN IF NOT EXISTS banner_mobile_url VARCHAR(500);
