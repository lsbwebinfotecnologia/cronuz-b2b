-- =============================================================================
-- DEPLOY_HORUS_COMPRAS_MODULE.sql
-- Módulo: Horus Direct -> Compras & Reposição Multi-Filial (AP -> AE)
-- Banco: PostgreSQL (cronuz_b2b) — 100% Idempotente (IF NOT EXISTS)
-- =============================================================================

BEGIN;

-- 1. Nova flag de sub-funcionalidade em cmp_settings (habilitável pelo Master)
ALTER TABLE cmp_settings
    ADD COLUMN IF NOT EXISTS horus_sql_feature_compras BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Parametrização Operacional e de E-mail por Filial (pur_horus_branch_config)
CREATE TABLE IF NOT EXISTS pur_horus_branch_config (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL,
    cod_empresa INTEGER NOT NULL DEFAULT 1,
    cod_filial INTEGER NOT NULL DEFAULT 1,
    cod_local_default INTEGER,
    cod_departamento_default INTEGER,
    cod_centro_custo_default INTEGER,
    compra_consig_default VARCHAR(1) NOT NULL DEFAULT 'N',
    email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    sender_name VARCHAR(150),
    sender_email VARCHAR(255),
    reply_to_email VARCHAR(255),
    cc_emails VARCHAR(500),
    email_subject_template VARCHAR(255),
    email_body_template TEXT,
    updated_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_pur_horus_branch_cfg_company_branch UNIQUE (company_id, branch_id)
);
CREATE INDEX IF NOT EXISTS ix_pur_horus_branch_config_company ON pur_horus_branch_config(company_id);

-- 3. Governança Comercial: CNPJ Fornecedor + Filial + Cód. Fornecedor + Editora/Selo + Desconto (%)
CREATE TABLE IF NOT EXISTS pur_horus_supplier_discount (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL,
    cod_empresa INTEGER NOT NULL,
    cod_filial INTEGER NOT NULL,
    cod_grp_fornecedor INTEGER NOT NULL DEFAULT 1,
    cod_fornecedor INTEGER NOT NULL,
    cnpj_fornecedor VARCHAR(20),
    nome_fornecedor VARCHAR(150),
    email_fornecedor VARCHAR(255),
    cod_editora INTEGER NOT NULL,
    nome_editora VARCHAR(150) NOT NULL,
    desconto_percentual NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    updated_by_name VARCHAR(150),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_pur_horus_sup_disc_branch_forn_ed UNIQUE (
        company_id, branch_id, cod_grp_fornecedor, cod_fornecedor, cod_editora
    )
);
CREATE INDEX IF NOT EXISTS ix_pur_horus_sup_disc_lookup
    ON pur_horus_supplier_discount(company_id, branch_id, cod_fornecedor, cod_editora);
CREATE INDEX IF NOT EXISTS ix_pur_horus_sup_disc_cnpj
    ON pur_horus_supplier_discount(cnpj_fornecedor);

-- 4. Log de Auditoria de Conciliação de Editora/Selo (Cronuz <-> Horus ITENS_ESTOQUE_GERAL)
CREATE TABLE IF NOT EXISTS pur_horus_publisher_reconcile_log (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    cod_item INTEGER NOT NULL,
    isbn VARCHAR(30),
    nome_item VARCHAR(255),
    old_cod_editora INTEGER,
    old_nome_editora VARCHAR(150),
    new_cod_editora INTEGER NOT NULL,
    new_nome_editora VARCHAR(150) NOT NULL,
    origin_module VARCHAR(50) NOT NULL DEFAULT 'COMPRAS',
    user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    user_name VARCHAR(150),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_pur_horus_pub_reconcile_company_item
    ON pur_horus_publisher_reconcile_log(company_id, cod_item);

-- 5. Cabeçalho de Pedidos de Compra Espelhados com PEDIDOS_COMPRA do Horus SQL
CREATE TABLE IF NOT EXISTS pur_horus_order (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL,
    branch_name VARCHAR(150),
    branch_cnpj VARCHAR(20),
    cod_empresa INTEGER NOT NULL,
    cod_filial INTEGER NOT NULL,
    cod_local INTEGER,
    cod_departamento INTEGER,
    cod_centro_custo INTEGER,
    cod_grp_fornecedor INTEGER NOT NULL,
    cod_fornecedor INTEGER NOT NULL,
    cnpj_fornecedor VARCHAR(20),
    nome_fornecedor VARCHAR(150) NOT NULL,
    email_fornecedor VARCHAR(255),
    horus_cod_pedido INTEGER,
    compra_consig VARCHAR(1) NOT NULL DEFAULT 'N',
    status VARCHAR(40) NOT NULL DEFAULT 'APPROVED',
    horus_status VARCHAR(5) NOT NULL DEFAULT 'AP',
    total_skus INTEGER NOT NULL DEFAULT 0,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    total_gross NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_discount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_net NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    avg_discount_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    observations TEXT,
    excel_exported_count INTEGER NOT NULL DEFAULT 0,
    last_excel_exported_at TIMESTAMP WITHOUT TIME ZONE,
    supplier_sent_at TIMESTAMP WITHOUT TIME ZONE,
    created_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_by_name VARCHAR(150),
    updated_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    updated_by_name VARCHAR(150),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_pur_horus_order_emp_fil_ped
    ON pur_horus_order(company_id, cod_empresa, cod_filial, horus_cod_pedido);

-- 6. Itens do Pedido de Compra
CREATE TABLE IF NOT EXISTS pur_horus_order_item (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES pur_horus_order(id) ON DELETE CASCADE,
    cod_item INTEGER NOT NULL,
    isbn VARCHAR(30),
    nome_item VARCHAR(255) NOT NULL,
    cod_editora INTEGER,
    nome_editora VARCHAR(150),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_cover_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    unit_net_price NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    subtotal_gross NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    subtotal_net NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    stock_at_order INTEGER DEFAULT 0,
    consigned_at_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_pur_horus_order_item_order ON pur_horus_order_item(order_id);

-- 7. Trilha de Auditoria Completa (Usuário, Data/Hora, Exportações e Transições AP -> AE)
CREATE TABLE IF NOT EXISTS pur_horus_order_log (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES pur_horus_order(id) ON DELETE CASCADE,
    action VARCHAR(60) NOT NULL,
    old_status VARCHAR(40),
    new_status VARCHAR(40),
    old_horus_status VARCHAR(10),
    new_horus_status VARCHAR(10),
    details TEXT,
    extra_meta JSONB,
    user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    user_name VARCHAR(150),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_pur_horus_order_log_order ON pur_horus_order_log(order_id);

COMMIT;
