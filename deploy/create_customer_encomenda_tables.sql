-- Deploy: Criação de tabelas para Encomendas de Clientes Multi-título e Logística
-- Data: 2026-10-11
-- Compatível com PostgreSQL

CREATE TABLE IF NOT EXISTS ord_customer_encomenda (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    encomenda_number VARCHAR(40) NOT NULL,
    customer_id INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_document VARCHAR(50),
    customer_phone VARCHAR(50),
    customer_email VARCHAR(255),
    
    -- Logística / Modalidade de Entrega
    delivery_type VARCHAR(30) NOT NULL DEFAULT 'BALCAO', -- 'BALCAO' (Retirada) ou 'ENTREGA' (Entrega no Endereço)
    pickup_branch_name VARCHAR(150),
    
    -- Endereço de Entrega
    shipping_zip_code VARCHAR(20),
    shipping_street VARCHAR(255),
    shipping_number VARCHAR(50),
    shipping_complement VARCHAR(100),
    shipping_neighborhood VARCHAR(100),
    shipping_city VARCHAR(100),
    shipping_state VARCHAR(2),
    
    -- Status e Valores
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN', -- OPEN, PURCHASE_ORDERED, RECEIVED_AT_STORE, NOTIFIED, DELIVERED, CANCELLED
    total_items INTEGER NOT NULL DEFAULT 1,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    
    created_by INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ord_customer_encomenda_comp ON ord_customer_encomenda(company_id, status);
CREATE INDEX IF NOT EXISTS idx_ord_customer_encomenda_doc ON ord_customer_encomenda(customer_document);
CREATE INDEX IF NOT EXISTS idx_ord_customer_encomenda_num ON ord_customer_encomenda(company_id, encomenda_number);

-- Itens da Encomenda (Multi-título)
CREATE TABLE IF NOT EXISTS ord_customer_encomenda_item (
    id SERIAL PRIMARY KEY,
    encomenda_id INTEGER NOT NULL REFERENCES ord_customer_encomenda(id) ON DELETE CASCADE,
    isbn VARCHAR(30) NOT NULL,
    title VARCHAR(255) NOT NULL,
    publisher VARCHAR(150),
    author VARCHAR(150),
    cover_url TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    horus_cod_item INTEGER,
    
    -- Suprimento / Fornecedor
    suggested_supplier_id INTEGER REFERENCES spl_supplier(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- PENDING, ORDERED, RECEIVED, CANCELLED
    purchase_order_id INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ord_customer_encomenda_item_enc ON ord_customer_encomenda_item(encomenda_id);
CREATE INDEX IF NOT EXISTS idx_ord_customer_encomenda_item_isbn ON ord_customer_encomenda_item(isbn);
