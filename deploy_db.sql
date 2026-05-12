-- Adicionado em: 24/04/2026 (Rotina de Esqueceu a Senha e SMTP)
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS smtp_use_ssl BOOLEAN DEFAULT FALSE;

-- Adicionado em: 27/04/2026 (Grupos de Clientes)
CREATE TABLE IF NOT EXISTS crm_customer_group (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS crm_customer_group_link (
    customer_id INTEGER NOT NULL REFERENCES crm_customer(id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES crm_customer_group(id) ON DELETE CASCADE,
    PRIMARY KEY (customer_id, group_id)
);

DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='crm_customer' AND column_name='default_group_id'
    ) THEN 
        ALTER TABLE crm_customer ADD COLUMN default_group_id INTEGER REFERENCES crm_customer_group(id) ON DELETE SET NULL;
    END IF; 
END $$;

-- Adicionando campo Meu Pedido no StoreFront
ALTER TABLE ord_order ADD COLUMN customer_order_ref VARCHAR(100);
