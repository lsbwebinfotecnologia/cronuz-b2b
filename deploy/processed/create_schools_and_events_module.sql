-- ==============================================================================
-- Migração: Módulo de Escolas, Passeios, Eventos & Amigo Secreto (Cronuz B2B)
-- Arquivo: deploy/create_schools_and_events_module.sql
-- Garantia: Idempotente com IF NOT EXISTS, sem comandos destrutivos.
-- ==============================================================================

-- 1. Habilitar flag de módulo na tabela cmp_company
ALTER TABLE cmp_company 
ADD COLUMN IF NOT EXISTS module_schools BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Tabela de Detalhes da Escola (vinculada a crm_customer)
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

ALTER TABLE sch_school_detail 
ADD COLUMN IF NOT EXISTS reference_code VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_sch_school_detail_company_id ON sch_school_detail (company_id);
CREATE INDEX IF NOT EXISTS idx_sch_school_detail_customer_id ON sch_school_detail (customer_id);
CREATE INDEX IF NOT EXISTS idx_sch_school_detail_reference ON sch_school_detail (company_id, reference_code);

-- 3. Tabela de Turmas / Séries da Escola
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

-- 4. Tabela de Eventos, Passeios e Amigo Secreto
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
    showcase_id INTEGER REFERENCES mkt_showcase(id) ON DELETE SET NULL,
    banner_url VARCHAR(500),
    rules_config JSONB DEFAULT '{}'::jsonb,
    draw_performed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sch_event_company_id ON sch_event (company_id);
CREATE INDEX IF NOT EXISTS idx_sch_event_school_customer_id ON sch_event (school_customer_id);
CREATE INDEX IF NOT EXISTS idx_sch_event_slug ON sch_event (company_id, slug);
CREATE INDEX IF NOT EXISTS idx_sch_event_type_status ON sch_event (company_id, event_type, status);

-- 5. Tabela de Participantes e Alunos (Adesões & Amigo Secreto)
CREATE TABLE IF NOT EXISTS sch_event_participant (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES sch_event(id) ON DELETE CASCADE,
    class_id INTEGER REFERENCES sch_class(id) ON DELETE SET NULL,
    student_name VARCHAR(255) NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_sch_participant_token ON sch_event_participant (access_token);
CREATE INDEX IF NOT EXISTS idx_sch_participant_company_id ON sch_event_participant (company_id);
CREATE INDEX IF NOT EXISTS idx_sch_participant_event_id ON sch_event_participant (event_id);
CREATE INDEX IF NOT EXISTS idx_sch_participant_class_id ON sch_event_participant (class_id);
CREATE INDEX IF NOT EXISTS idx_sch_participant_parent_cpf ON sch_event_participant (company_id, parent_cpf);
CREATE INDEX IF NOT EXISTS idx_sch_participant_assigned ON sch_event_participant (assigned_to_participant_id);
CREATE INDEX IF NOT EXISTS idx_sch_participant_gift_status ON sch_event_participant (event_id, gift_status);

-- 6. Adicionar campos em ord_order para amarração B2C e entrega escolar
ALTER TABLE ord_order
ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES sch_event(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS school_customer_id INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS event_participant_id INTEGER REFERENCES sch_event_participant(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(50) DEFAULT 'STANDARD',
ADD COLUMN IF NOT EXISTS recipient_student_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_ord_order_event_id ON ord_order (event_id);
CREATE INDEX IF NOT EXISTS idx_ord_order_school_customer_id ON ord_order (school_customer_id);
CREATE INDEX IF NOT EXISTS idx_ord_order_event_participant_id ON ord_order (event_participant_id);
