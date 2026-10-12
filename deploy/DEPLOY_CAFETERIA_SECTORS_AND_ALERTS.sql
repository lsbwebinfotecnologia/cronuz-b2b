-- Deploy: Adição de Setores de Preparo e Alertas Cozinha/Garçom na Cafeteria
-- Tabela: caf_order_item

ALTER TABLE caf_order_item ADD COLUMN IF NOT EXISTS prep_sector VARCHAR(50) DEFAULT 'BEVERAGE';
ALTER TABLE caf_order_item ADD COLUMN IF NOT EXISTS category_name VARCHAR(100);
ALTER TABLE caf_order_item ADD COLUMN IF NOT EXISTS kitchen_alert VARCHAR(255);
ALTER TABLE caf_order_item ADD COLUMN IF NOT EXISTS kitchen_alert_at TIMESTAMPTZ;
ALTER TABLE caf_order_item ADD COLUMN IF NOT EXISTS kitchen_alert_acknowledged BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_caf_order_item_sector ON caf_order_item (company_id, prep_sector, prep_status);
