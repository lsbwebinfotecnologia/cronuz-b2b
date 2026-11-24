-- =============================================================================
-- DEPLOY: Horus Direct Compras -> Auditoria Preventiva de XML NF-e vs Pedido
-- Banco de Dados: PostgreSQL (cronuz_b2b)
-- =============================================================================

BEGIN;

-- 1. Novas colunas de rastreio de XML em pur_horus_order
ALTER TABLE pur_horus_order
    ADD COLUMN IF NOT EXISTS xml_status VARCHAR(40) NOT NULL DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS last_xml_audit_id INTEGER,
    ADD COLUMN IF NOT EXISTS last_nfe_number VARCHAR(30),
    ADD COLUMN IF NOT EXISTS last_nfe_series VARCHAR(10),
    ADD COLUMN IF NOT EXISTS last_nfe_key VARCHAR(60),
    ADD COLUMN IF NOT EXISTS xml_checked_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS xml_checked_by_name VARCHAR(150);

CREATE INDEX IF NOT EXISTS ix_pur_horus_order_xml_status ON pur_horus_order (xml_status);
CREATE INDEX IF NOT EXISTS ix_pur_horus_order_last_nfe_key ON pur_horus_order (last_nfe_key);

-- 2. Cabeçalho de Auditoria de XML da NF-e (pur_horus_xml_audit)
CREATE TABLE IF NOT EXISTS pur_horus_xml_audit (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES pur_horus_order(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL,
    branch_name VARCHAR(150),
    horus_cod_pedido INTEGER,

    chave_acesso VARCHAR(60),
    numero_nf VARCHAR(30) NOT NULL,
    serie_nf VARCHAR(10),
    data_emissao VARCHAR(40),
    nat_op VARCHAR(150),
    emit_cnpj VARCHAR(20),
    emit_nome VARCHAR(200),
    dest_cnpj VARCHAR(20),
    dest_nome VARCHAR(200),
    xml_xped VARCHAR(60),
    xml_file_path VARCHAR(500),
    xml_content TEXT,

    order_total_qty INTEGER NOT NULL DEFAULT 0,
    xml_total_qty INTEGER NOT NULL DEFAULT 0,
    order_total_gross NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    xml_total_gross NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    order_total_discount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    xml_total_discount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    order_total_net NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    xml_total_products_net NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    xml_total_nf NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    xml_frete NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    xml_ipi_st_outros NUMERIC(14, 2) NOT NULL DEFAULT 0.00,

    diagnostic_status VARCHAR(30) NOT NULL DEFAULT 'MATCH_100',
    matched_ok_count INTEGER NOT NULL DEFAULT 0,
    divergent_items_count INTEGER NOT NULL DEFAULT 0,
    diff_cover_count INTEGER NOT NULL DEFAULT 0,
    diff_discount_count INTEGER NOT NULL DEFAULT 0,
    diff_qty_count INTEGER NOT NULL DEFAULT 0,
    extra_in_xml_count INTEGER NOT NULL DEFAULT 0,
    missing_in_xml_count INTEGER NOT NULL DEFAULT 0,
    header_warnings JSONB,

    decision_status VARCHAR(40) NOT NULL DEFAULT 'PENDING_REVIEW',
    decision_notes TEXT,

    uploaded_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    uploaded_by_name VARCHAR(150),
    decided_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    decided_by_name VARCHAR(150),
    decided_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_pur_horus_xml_audit_company ON pur_horus_xml_audit (company_id);
CREATE INDEX IF NOT EXISTS ix_pur_horus_xml_audit_order ON pur_horus_xml_audit (order_id);
CREATE INDEX IF NOT EXISTS ix_pur_horus_xml_audit_branch ON pur_horus_xml_audit (branch_id);
CREATE INDEX IF NOT EXISTS ix_pur_horus_xml_audit_chave ON pur_horus_xml_audit (chave_acesso);
CREATE INDEX IF NOT EXISTS ix_pur_horus_xml_audit_comp_status ON pur_horus_xml_audit (company_id, decision_status, diagnostic_status);

-- 3. Itens Individualizados da Auditoria Pedido vs XML (pur_horus_xml_audit_item)
CREATE TABLE IF NOT EXISTS pur_horus_xml_audit_item (
    id SERIAL PRIMARY KEY,
    audit_id INTEGER NOT NULL REFERENCES pur_horus_xml_audit(id) ON DELETE CASCADE,
    order_item_id INTEGER REFERENCES pur_horus_order_item(id) ON DELETE SET NULL,

    xml_n_item INTEGER,
    cod_item INTEGER,
    isbn VARCHAR(30),
    xml_ean VARCHAR(30),
    xml_cprod VARCHAR(60),
    title VARCHAR(255) NOT NULL,
    nome_editora VARCHAR(150),
    cfop VARCHAR(10),

    order_qty INTEGER NOT NULL DEFAULT 0,
    order_cover_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    order_discount_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    order_unit_net NUMERIC(12, 4) NOT NULL DEFAULT 0.00,
    order_subtotal_net NUMERIC(14, 2) NOT NULL DEFAULT 0.00,

    xml_qty INTEGER NOT NULL DEFAULT 0,
    xml_cover_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    xml_discount_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    xml_effective_discount_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    xml_unit_net NUMERIC(12, 4) NOT NULL DEFAULT 0.00,
    xml_subtotal_net NUMERIC(14, 2) NOT NULL DEFAULT 0.00,

    line_status VARCHAR(30) NOT NULL DEFAULT 'OK',
    has_qty_diff BOOLEAN NOT NULL DEFAULT FALSE,
    has_cover_diff BOOLEAN NOT NULL DEFAULT FALSE,
    has_discount_diff BOOLEAN NOT NULL DEFAULT FALSE,
    is_extra_in_xml BOOLEAN NOT NULL DEFAULT FALSE,
    is_missing_in_xml BOOLEAN NOT NULL DEFAULT FALSE,
    divergence_tags JSONB,
    divergence_summary VARCHAR(500),
    item_note VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS ix_pur_horus_xml_audit_item_audit ON pur_horus_xml_audit_item (audit_id);
CREATE INDEX IF NOT EXISTS ix_pur_horus_xml_audit_item_isbn ON pur_horus_xml_audit_item (isbn);
CREATE INDEX IF NOT EXISTS ix_pur_horus_xml_audit_item_status ON pur_horus_xml_audit_item (line_status);

COMMIT;
