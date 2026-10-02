-- ==============================================================================
-- DEPLOY PRODUCAO: Modulo de Escolas, Passeios, Eventos, Amigo Secreto & Vitrines Dinamicas
-- Data: 2026-10-02
-- Banco: PostgreSQL (cronuz_b2b)
-- ==============================================================================

-- 1. Flags e Campos em cmp_company e cmp_settings
ALTER TABLE cmp_company 
ADD COLUMN IF NOT EXISTS module_schools BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE cmp_settings 
ADD COLUMN IF NOT EXISTS horus_endpoint VARCHAR(255),
ADD COLUMN IF NOT EXISTS horus_api_key VARCHAR(255);

-- 2. Vitrines Dinamicas (mkt_dynamic_showcase e mkt_dynamic_showcase_item)
CREATE TABLE IF NOT EXISTS mkt_dynamic_showcase (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    search_source VARCHAR(20) NOT NULL DEFAULT 'CRONUZ', -- 'CRONUZ' or 'HORUS_API'
    active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 1,
    banner_url VARCHAR(500),
    banner_mobile_url VARCHAR(500),
    logo_url VARCHAR(500),
    start_date TIMESTAMP WITH TIME ZONE NULL,
    end_date TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_dynamic_showcase_company ON mkt_dynamic_showcase(company_id);
CREATE INDEX IF NOT EXISTS idx_mkt_dynamic_showcase_active ON mkt_dynamic_showcase(company_id, active);
CREATE INDEX IF NOT EXISTS idx_mkt_dynamic_showcase_dates ON mkt_dynamic_showcase(company_id, active, start_date, end_date);

CREATE TABLE IF NOT EXISTS mkt_dynamic_showcase_item (
    id SERIAL PRIMARY KEY,
    showcase_id INTEGER NOT NULL REFERENCES mkt_dynamic_showcase(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES prd_product(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_dynamic_showcase_product UNIQUE (showcase_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_mkt_dynamic_showcase_item_showcase ON mkt_dynamic_showcase_item(showcase_id);
CREATE INDEX IF NOT EXISTS idx_mkt_dynamic_showcase_item_product ON mkt_dynamic_showcase_item(product_id);

-- 3. Detalhes de Escola (sch_school_detail)
CREATE TABLE IF NOT EXISTS sch_school_detail (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL UNIQUE REFERENCES crm_customer(id) ON DELETE CASCADE,
    inep_code VARCHAR(50),
    reference_code VARCHAR(100),
    principal_name VARCHAR(255),
    coordinator_name VARCHAR(255),
    pedagogical_contact_phone VARCHAR(50),
    pedagogical_contact_email VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE sch_school_detail ADD COLUMN IF NOT EXISTS reference_code VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_sch_school_detail_company_id ON sch_school_detail (company_id);
CREATE INDEX IF NOT EXISTS idx_sch_school_detail_customer_id ON sch_school_detail (customer_id);
CREATE INDEX IF NOT EXISTS idx_sch_school_detail_reference ON sch_school_detail (company_id, reference_code);

-- 4. Turmas / Series da Escola (sch_class)
CREATE TABLE IF NOT EXISTS sch_class (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    school_customer_id INTEGER NOT NULL REFERENCES crm_customer(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    grade VARCHAR(100),
    shift VARCHAR(50) DEFAULT 'MANHA',
    academic_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sch_class_company_id ON sch_class (company_id);
CREATE INDEX IF NOT EXISTS idx_sch_class_school_customer_id ON sch_class (school_customer_id);
CREATE INDEX IF NOT EXISTS idx_sch_class_academic_year ON sch_class (academic_year);

-- 5. Eventos, Passeios e Amigo Secreto (sch_event)
CREATE TABLE IF NOT EXISTS sch_event (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    school_customer_id INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL DEFAULT 'PASSEIO', -- PASSEIO, AMIGO_SECRETO, FEIRA_LIVRO, EVENTO_GERAL
    description TEXT,
    location_destination VARCHAR(255),
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- DRAFT, OPEN, IN_PROGRESS, FINISHED, CANCELLED
    price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    max_capacity INTEGER,
    showcase_id INTEGER,
    banner_url VARCHAR(500),
    banner_mobile_url VARCHAR(500),
    logo_url VARCHAR(500),
    content_html TEXT,
    is_template BOOLEAN NOT NULL DEFAULT FALSE,
    parent_event_id INTEGER REFERENCES sch_event(id) ON DELETE SET NULL,
    rules_config JSONB DEFAULT '{}'::jsonb,
    draw_performed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE sch_event ADD COLUMN IF NOT EXISTS banner_mobile_url VARCHAR(500);
ALTER TABLE sch_event ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500);
ALTER TABLE sch_event ADD COLUMN IF NOT EXISTS content_html TEXT;
ALTER TABLE sch_event ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sch_event ADD COLUMN IF NOT EXISTS parent_event_id INTEGER REFERENCES sch_event(id) ON DELETE SET NULL;
ALTER TABLE sch_event DROP CONSTRAINT IF EXISTS sch_event_showcase_id_fkey;

CREATE INDEX IF NOT EXISTS idx_sch_event_company_id ON sch_event (company_id);
CREATE INDEX IF NOT EXISTS idx_sch_event_school_customer_id ON sch_event (school_customer_id);
CREATE INDEX IF NOT EXISTS idx_sch_event_slug ON sch_event (company_id, slug);
CREATE INDEX IF NOT EXISTS idx_sch_event_type_status ON sch_event (company_id, event_type, status);
CREATE INDEX IF NOT EXISTS idx_sch_event_parent ON sch_event(company_id, parent_event_id);

-- 6. Participantes de Eventos e Amigo Secreto (sch_event_participant)
CREATE TABLE IF NOT EXISTS sch_event_participant (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES sch_event(id) ON DELETE CASCADE,
    class_id INTEGER REFERENCES sch_class(id) ON DELETE SET NULL,
    student_name VARCHAR(255) NOT NULL,
    character_name VARCHAR(100) NULL,
    student_birth_date DATE,
    parent_name VARCHAR(255) NOT NULL,
    parent_cpf VARCHAR(20) NOT NULL,
    parent_phone VARCHAR(50),
    parent_email VARCHAR(255),
    wishlist_preferences JSONB DEFAULT '{}'::jsonb,
    access_token VARCHAR(100) NOT NULL,
    assigned_to_participant_id INTEGER REFERENCES sch_event_participant(id) ON DELETE SET NULL,
    draw_revealed_at TIMESTAMP WITH TIME ZONE,
    gift_order_id INTEGER REFERENCES ord_order(id) ON DELETE SET NULL,
    gift_status VARCHAR(50) NOT NULL DEFAULT 'WAITING_DRAW', -- WAITING_DRAW, WAITING_PURCHASE, PURCHASED, PACKED_READY, DELIVERED_TO_SCHOOL
    checkin_status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, BOARDED, RETURNED
    medical_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE sch_event_participant ADD COLUMN IF NOT EXISTS character_name VARCHAR(100) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sch_participant_token ON sch_event_participant (access_token);
CREATE INDEX IF NOT EXISTS idx_sch_participant_company_id ON sch_event_participant (company_id);
CREATE INDEX IF NOT EXISTS idx_sch_participant_event_id ON sch_event_participant (event_id);
CREATE INDEX IF NOT EXISTS idx_sch_participant_class_id ON sch_event_participant (class_id);
CREATE INDEX IF NOT EXISTS idx_sch_participant_parent_cpf ON sch_event_participant (company_id, parent_cpf);
CREATE INDEX IF NOT EXISTS idx_sch_participant_assigned ON sch_event_participant (assigned_to_participant_id);
CREATE INDEX IF NOT EXISTS idx_sch_participant_gift_status ON sch_event_participant (event_id, gift_status);
CREATE INDEX IF NOT EXISTS idx_sch_part_character ON sch_event_participant(event_id, character_name);

-- 7. Vinculos e Entrega Escolar em ord_order
ALTER TABLE ord_order
ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES sch_event(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS school_customer_id INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS event_participant_id INTEGER REFERENCES sch_event_participant(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(50) DEFAULT 'STANDARD',
ADD COLUMN IF NOT EXISTS recipient_student_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_ord_order_event_id ON ord_order (event_id);
CREATE INDEX IF NOT EXISTS idx_ord_order_school_customer_id ON ord_order (school_customer_id);
CREATE INDEX IF NOT EXISTS idx_ord_order_event_participant_id ON ord_order (event_participant_id);
