# Roteiro de Deploy — Módulo Mercado Livre (Hub Integrador)

Este documento detalha todas as alterações estruturais de Banco de Dados (PostgreSQL) e passos necessários para o deploy do **Módulo Mercado Livre (`module_mercadolivre`)** em produção.

---

## 1. Alterações no Banco de Dados PostgreSQL (`cronuz_b2b`)

Execute o bloco SQL abaixo no PostgreSQL de produção (`PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b`):

```sql
BEGIN;

-- 1. Flag de Habilitação do Módulo no Painel Master (cmp_company)
ALTER TABLE cmp_company
    ADD COLUMN IF NOT EXISTS module_mercadolivre BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Credenciais OAuth2 e Pré-Configurações (Presets) por Seller (cmp_settings)
ALTER TABLE cmp_settings
    ADD COLUMN IF NOT EXISTS meli_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS meli_app_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS meli_client_secret VARCHAR(255),
    ADD COLUMN IF NOT EXISTS meli_redirect_uri VARCHAR(500),
    ADD COLUMN IF NOT EXISTS meli_user_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS meli_nickname VARCHAR(150),
    ADD COLUMN IF NOT EXISTS meli_access_token VARCHAR(1000),
    ADD COLUMN IF NOT EXISTS meli_refresh_token VARCHAR(1000),
    ADD COLUMN IF NOT EXISTS meli_token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS meli_preset_config JSON;

CREATE INDEX IF NOT EXISTS ix_cmp_settings_meli_user_id ON cmp_settings (meli_user_id);

-- 3. Tabela de Vínculo de Anúncios Publicados / Importados (meli_listings)
CREATE TABLE IF NOT EXISTS meli_listings (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id),
    product_id INTEGER REFERENCES prd_product(id),
    sku VARCHAR(100),
    ean_gtin VARCHAR(50),
    horus_cod_item INTEGER,
    title VARCHAR(255) NOT NULL,
    meli_item_id VARCHAR(60) NOT NULL,
    meli_category_id VARCHAR(50) NOT NULL DEFAULT 'MLB1196',
    meli_category_name VARCHAR(255),
    listing_type_id VARCHAR(50) NOT NULL DEFAULT 'gold_special',
    condition VARCHAR(30) NOT NULL DEFAULT 'new',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    base_price DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    meli_price DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    current_stock INTEGER NOT NULL DEFAULT 0,
    last_synced_stock INTEGER,
    last_synced_price DOUBLE PRECISION,
    logistic_type VARCHAR(50),
    permalink VARCHAR(500),
    thumbnail VARCHAR(500),
    attributes_json JSON,
    sync_error TEXT,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_meli_listings_company_status ON meli_listings (company_id, status);
CREATE INDEX IF NOT EXISTS idx_meli_listings_company_meli_id ON meli_listings (company_id, meli_item_id);
CREATE INDEX IF NOT EXISTS idx_meli_listings_company_ean ON meli_listings (company_id, ean_gtin);

-- 4. Tabela Espelho de Pedidos Mercado Livre (meli_orders)
CREATE TABLE IF NOT EXISTS meli_orders (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id),
    meli_order_id VARCHAR(80) NOT NULL,
    meli_pack_id VARCHAR(80),
    meli_shipment_id VARCHAR(80),
    status VARCHAR(50) NOT NULL DEFAULT 'paid',
    shipping_status VARCHAR(50),
    shipping_substatus VARCHAR(80),
    logistic_type VARCHAR(50),
    buyer_id VARCHAR(80),
    buyer_nickname VARCHAR(150),
    buyer_name VARCHAR(255),
    buyer_email VARCHAR(255),
    buyer_doc_type VARCHAR(20),
    buyer_doc_number VARCHAR(50),
    buyer_phone VARCHAR(50),
    total_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    paid_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    shipping_cost DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    meli_fee DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    cronuz_order_id INTEGER REFERENCES ord_order(id),
    horus_pedido_venda VARCHAR(100),
    invoice_xml_sent BOOLEAN NOT NULL DEFAULT FALSE,
    invoice_number VARCHAR(50),
    invoice_key VARCHAR(60),
    items_json JSON,
    shipping_address_json JSON,
    raw_payload JSON,
    sync_error TEXT,
    meli_created_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_meli_orders_company_order_id ON meli_orders (company_id, meli_order_id);
CREATE INDEX IF NOT EXISTS idx_meli_orders_company_status ON meli_orders (company_id, status);

-- 5. Tabela de Histórico / Logs de Sincronização (meli_sync_logs)
CREATE TABLE IF NOT EXISTS meli_sync_logs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id),
    sync_type VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
    items_processed INTEGER NOT NULL DEFAULT 0,
    items_updated INTEGER NOT NULL DEFAULT 0,
    items_failed INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    details_json JSON,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meli_sync_logs_company_created ON meli_sync_logs (company_id, created_at);

COMMIT;
```

---

## 2. Comandos de Deploy na DigitalOcean (`64.23.182.183`)

```bash
cd /var/www/cronuz && git pull origin main
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```
