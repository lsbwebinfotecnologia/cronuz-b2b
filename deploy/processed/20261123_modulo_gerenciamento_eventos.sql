-- ============================================================================
-- MIGRATION: Módulo Gerenciamento de Eventos (module_event_management / evm_*)
-- Banco: PostgreSQL (cronuz_b2b) | Timezone: America/Sao_Paulo
-- ============================================================================

BEGIN;

-- 1. Flag de Governança no Master (cmp_company)
ALTER TABLE cmp_company
    ADD COLUMN IF NOT EXISTS module_event_management BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Casas de Show e Espaços Pré-cadastrados
CREATE TABLE IF NOT EXISTS evm_venue (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    cnpj VARCHAR(30),
    contact_name VARCHAR(150),
    contact_phone VARCHAR(40),
    contact_email VARCHAR(255),
    zip_code VARCHAR(20),
    street VARCHAR(255),
    number VARCHAR(50),
    complement VARCHAR(150),
    neighborhood VARCHAR(150),
    city VARCHAR(150),
    state VARCHAR(10),
    maps_url VARCHAR(500),
    total_capacity INTEGER,
    age_rating VARCHAR(20) NOT NULL DEFAULT '18+',
    default_sectors_json JSONB DEFAULT '[]'::jsonb,
    access_notes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evm_venue_company_active ON evm_venue(company_id, active);

-- 3. CRM Único de Convidados por Seller (Anti-duplicidade por DDD + Telefone)
CREATE TABLE IF NOT EXISTS evm_contact (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    nickname VARCHAR(100),
    phone_display VARCHAR(30) NOT NULL,
    phone_ddd VARCHAR(4) NOT NULL,
    phone_canonical VARCHAR(20) NOT NULL,
    phone_base_8 VARCHAR(15) NOT NULL,
    secondary_phone VARCHAR(30),
    email VARCHAR(255),
    cpf VARCHAR(20),
    rg VARCHAR(30),
    birth_date DATE,
    gender VARCHAR(30),
    instagram VARCHAR(100),
    company_org VARCHAR(200),
    job_title VARCHAR(150),
    city VARCHAR(150),
    state VARCHAR(10),
    category_tag VARCHAR(50) NOT NULL DEFAULT 'CONVIDADO',
    tags_json JSONB DEFAULT '[]'::jsonb,
    origin_source VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
    origin_promoter_name VARCHAR(150),
    whatsapp_valid BOOLEAN,
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    block_reason TEXT,
    notes TEXT,
    total_events_invited INTEGER NOT NULL DEFAULT 0,
    total_events_confirmed INTEGER NOT NULL DEFAULT 0,
    total_tickets_sent INTEGER NOT NULL DEFAULT 0,
    total_checkins INTEGER NOT NULL DEFAULT 0,
    total_no_shows INTEGER NOT NULL DEFAULT 0,
    last_event_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_evm_contact_comp_phone UNIQUE (company_id, phone_canonical)
);
CREATE INDEX IF NOT EXISTS idx_evm_contact_comp_base8 ON evm_contact(company_id, phone_base_8);
CREATE INDEX IF NOT EXISTS idx_evm_contact_comp_name ON evm_contact(company_id, full_name);
CREATE INDEX IF NOT EXISTS idx_evm_contact_comp_cpf ON evm_contact(company_id, cpf);

-- 4. Cadastro Mestre de Eventos
CREATE TABLE IF NOT EXISTS evm_event (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    code VARCHAR(40),
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255),
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    event_date DATE NOT NULL,
    doors_open_time VARCHAR(10),
    start_time VARCHAR(10),
    end_time VARCHAR(10),
    list_cutoff_time VARCHAR(10),
    venue_id INTEGER REFERENCES evm_venue(id) ON DELETE SET NULL,
    custom_location_name VARCHAR(255),
    zip_code VARCHAR(20),
    street VARCHAR(255),
    number VARCHAR(50),
    complement VARCHAR(150),
    neighborhood VARCHAR(150),
    city VARCHAR(150),
    state VARCHAR(10),
    maps_url VARCHAR(500),
    age_rating VARCHAR(20) NOT NULL DEFAULT '18+',
    dress_code VARCHAR(150),
    banner_url VARCHAR(500),
    flyer_vertical_url VARCHAR(500),
    ticket_mode VARCHAR(30) NOT NULL DEFAULT 'HYBRID',
    dispatch_flow_mode VARCHAR(30) NOT NULL DEFAULT 'BOTH_ALLOWED',
    auto_send_ticket_on_rsvp BOOLEAN NOT NULL DEFAULT FALSE,
    max_guests_limit INTEGER,
    sectors_json JSONB DEFAULT '[]'::jsonb,
    public_rsvp_token VARCHAR(64) UNIQUE,
    public_rsvp_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    public_rsvp_max_slots INTEGER,
    created_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evm_event_comp_date ON evm_event(company_id, event_date);
CREATE INDEX IF NOT EXISTS idx_evm_event_comp_status ON evm_event(company_id, status);

-- 5. Lista de Convidados do Evento, Cortesias, RSVP e Check-in
CREATE TABLE IF NOT EXISTS evm_event_guest (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES evm_event(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES evm_contact(id) ON DELETE CASCADE,
    sector_key VARCHAR(60) NOT NULL DEFAULT 'VIP',
    access_type VARCHAR(40) NOT NULL DEFAULT 'COURTESY_HYBRID',
    companions_count INTEGER NOT NULL DEFAULT 0,
    companions_names TEXT,
    courtesy_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    promoter_name VARCHAR(150),
    added_via VARCHAR(40) NOT NULL DEFAULT 'DESKTOP_GRID',
    invite_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    rsvp_token VARCHAR(64) NOT NULL UNIQUE,
    rsvp_responded_at TIMESTAMPTZ,
    ticket_delivery_status VARCHAR(30) NOT NULL DEFAULT 'NONE',
    ticket_sent_at TIMESTAMPTZ,
    ticket_resend_count INTEGER NOT NULL DEFAULT 0,
    checkin_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    checked_in_at TIMESTAMPTZ,
    checked_in_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    notes TEXT,
    added_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_evm_event_guest_unique UNIQUE (event_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_evm_guest_event_sector ON evm_event_guest(event_id, sector_key);
CREATE INDEX IF NOT EXISTS idx_evm_guest_event_status ON evm_event_guest(event_id, invite_status, ticket_delivery_status);

-- 6. Cofre Blindado de Ingressos PDF/ZIP (1 PDF = no máximo 1 Convidado)
CREATE TABLE IF NOT EXISTS evm_ticket (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES evm_event(id) ON DELETE CASCADE,
    batch_code VARCHAR(50) NOT NULL,
    sector_key VARCHAR(60) NOT NULL DEFAULT 'VIP',
    ticket_number VARCHAR(120),
    original_filename VARCHAR(255) NOT NULL,
    page_number INTEGER NOT NULL DEFAULT 1,
    file_rel_path VARCHAR(500) NOT NULL,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    file_sha256 VARCHAR(64) NOT NULL,
    extracted_text_snippet VARCHAR(600),
    face_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
    assigned_guest_id INTEGER UNIQUE REFERENCES evm_event_guest(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    assigned_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    sent_at TIMESTAMPTZ,
    sent_to_phone VARCHAR(30),
    whatsapp_message_id VARCHAR(150),
    invalidated_reason VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_evm_ticket_event_sha256 UNIQUE (event_id, file_sha256)
);
CREATE INDEX IF NOT EXISTS idx_evm_ticket_event_status_sector ON evm_ticket(event_id, status, sector_key);

-- 7. Modelos de Convite com Imagem e Variáveis Dinâmicas
CREATE TABLE IF NOT EXISTS evm_invite_template (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    event_id INTEGER REFERENCES evm_event(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    template_purpose VARCHAR(40) NOT NULL DEFAULT 'INVITE_RSVP',
    image_url VARCHAR(500),
    message_body TEXT NOT NULL,
    spintax_greetings_json JSONB DEFAULT '[]'::jsonb,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evm_template_comp_event ON evm_invite_template(company_id, event_id);

-- 8. Configuração WhatsApp (Evolution API / Z-API / WAHA) + Captura vCard
CREATE TABLE IF NOT EXISTS evm_whatsapp_config (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL UNIQUE REFERENCES cmp_company(id) ON DELETE CASCADE,
    provider VARCHAR(30) NOT NULL DEFAULT 'EVOLUTION',
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    api_base_url VARCHAR(500),
    instance_name VARCHAR(150),
    api_key_token VARCHAR(500),
    client_token VARCHAR(500),
    webhook_secret VARCHAR(120) NOT NULL,
    connected_phone VARCHAR(30),
    connection_status VARCHAR(40) NOT NULL DEFAULT 'DISCONNECTED',
    min_delay_seconds INTEGER NOT NULL DEFAULT 25,
    max_delay_seconds INTEGER NOT NULL DEFAULT 55,
    batch_size_before_pause INTEGER NOT NULL DEFAULT 20,
    batch_pause_seconds INTEGER NOT NULL DEFAULT 300,
    daily_limit INTEGER NOT NULL DEFAULT 250,
    allowed_start_hour VARCHAR(5) NOT NULL DEFAULT '09:00',
    allowed_end_hour VARCHAR(5) NOT NULL DEFAULT '21:30',
    simulate_typing BOOLEAN NOT NULL DEFAULT TRUE,
    verify_whatsapp_before_send BOOLEAN NOT NULL DEFAULT TRUE,
    queue_paused BOOLEAN NOT NULL DEFAULT FALSE,
    vcard_capture_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    authorized_sender_phones_json JSONB DEFAULT '[]'::jsonb,
    default_capture_event_id INTEGER REFERENCES evm_event(id) ON DELETE SET NULL,
    default_capture_sector VARCHAR(60) NOT NULL DEFAULT 'VIP',
    pending_bot_context_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Fila Assíncrona de Disparo Seguro WhatsApp Anti-Bloqueio
CREATE TABLE IF NOT EXISTS evm_dispatch_queue (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES evm_event(id) ON DELETE CASCADE,
    guest_id INTEGER NOT NULL REFERENCES evm_event_guest(id) ON DELETE CASCADE,
    ticket_id INTEGER REFERENCES evm_ticket(id) ON DELETE SET NULL,
    template_id INTEGER REFERENCES evm_invite_template(id) ON DELETE SET NULL,
    dispatch_mode VARCHAR(40) NOT NULL,
    idempotency_key VARCHAR(160) NOT NULL,
    recipient_phone VARCHAR(30) NOT NULL,
    recipient_name VARCHAR(255) NOT NULL,
    rendered_message TEXT NOT NULL,
    media_image_url VARCHAR(500),
    pdf_rel_path VARCHAR(500),
    pdf_delivery_filename VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    priority INTEGER NOT NULL DEFAULT 20,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    provider_message_id VARCHAR(150),
    error_message TEXT,
    created_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_evm_dispatch_idemp UNIQUE (company_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_evm_dispatch_status_sched ON evm_dispatch_queue(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_evm_dispatch_comp_event ON evm_dispatch_queue(company_id, event_id);

-- 10. Trilha Imutável de Auditoria e Histórico de Alterações
CREATE TABLE IF NOT EXISTS evm_audit_log (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    event_id INTEGER REFERENCES evm_event(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES evm_contact(id) ON DELETE SET NULL,
    guest_id INTEGER REFERENCES evm_event_guest(id) ON DELETE SET NULL,
    ticket_id INTEGER REFERENCES evm_ticket(id) ON DELETE SET NULL,
    entity_type VARCHAR(40) NOT NULL,
    action VARCHAR(60) NOT NULL,
    actor_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    actor_name VARCHAR(150),
    source_channel VARCHAR(40) NOT NULL DEFAULT 'WEB_DESKTOP',
    summary VARCHAR(500) NOT NULL,
    details_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evm_audit_comp_created ON evm_audit_log(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_evm_audit_event_created ON evm_audit_log(event_id, created_at);

COMMIT;
