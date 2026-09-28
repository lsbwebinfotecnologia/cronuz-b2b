-- ============================================================================
-- DEPLOY: Módulo de Produção Editorial Flexível (Cronuz B2B)
-- Data: 2026-09-25
-- Descrição: Criação das tabelas de pipelines, etapas, projetos, tarefas,
--            arquivos e histórico do módulo editorial, além da flag na empresa.
-- ============================================================================

-- 1. Adicionar flag module_editorial na tabela de empresas
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_editorial BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Tabela de Pipelines / Fluxos de Trabalho
CREATE TABLE IF NOT EXISTS edt_pipeline (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    color VARCHAR(30) NOT NULL DEFAULT '#6366f1',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE INDEX IF NOT EXISTS idx_edt_pipeline_company ON edt_pipeline(company_id);

-- 3. Tabela de Etapas / Stages do Pipeline
CREATE TABLE IF NOT EXISTS edt_stage (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    pipeline_id INTEGER NOT NULL REFERENCES edt_pipeline(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(30) NOT NULL DEFAULT '#3b82f6',
    order_index INTEGER NOT NULL DEFAULT 0,
    sla_days INTEGER NOT NULL DEFAULT 0,
    is_initial BOOLEAN NOT NULL DEFAULT FALSE,
    is_final BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE INDEX IF NOT EXISTS idx_edt_stage_company ON edt_stage(company_id);
CREATE INDEX IF NOT EXISTS idx_edt_stage_pipeline ON edt_stage(pipeline_id);

-- 4. Tabela de Projetos / Obras Editoriais
CREATE TABLE IF NOT EXISTS edt_project (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    local_id INTEGER NOT NULL,
    pipeline_id INTEGER NOT NULL REFERENCES edt_pipeline(id),
    stage_id INTEGER NOT NULL REFERENCES edt_stage(id),
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255),
    format VARCHAR(50) NOT NULL DEFAULT 'LIVRO_FISICO',
    edition VARCHAR(50),
    volume VARCHAR(50),
    isbn VARCHAR(50),
    barcode VARCHAR(50),
    synopsis TEXT,
    cover_url VARCHAR(500),
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    start_date DATE,
    due_date DATE,
    stage_entered_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    completed_at TIMESTAMP WITHOUT TIME ZONE,
    responsible_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    author_id INTEGER REFERENCES aut_author(id) ON DELETE SET NULL,
    horus_cod_item INTEGER,
    visible_to_author BOOLEAN NOT NULL DEFAULT FALSE,
    estimated_pages INTEGER,
    estimated_cost DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    internal_notes TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    CONSTRAINT uix_edt_project_company_local UNIQUE (company_id, local_id)
);

CREATE INDEX IF NOT EXISTS idx_edt_project_company ON edt_project(company_id);
CREATE INDEX IF NOT EXISTS idx_edt_project_pipeline ON edt_project(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_edt_project_stage ON edt_project(stage_id);
CREATE INDEX IF NOT EXISTS idx_edt_project_author ON edt_project(author_id);
CREATE INDEX IF NOT EXISTS idx_edt_project_isbn ON edt_project(isbn);
CREATE INDEX IF NOT EXISTS idx_edt_project_horus_item ON edt_project(horus_cod_item);

-- 5. Tabela de Tarefas / Checklist da Demanda
CREATE TABLE IF NOT EXISTS edt_task (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES edt_project(id) ON DELETE CASCADE,
    stage_id INTEGER REFERENCES edt_stage(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMP WITHOUT TIME ZONE,
    completed_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE INDEX IF NOT EXISTS idx_edt_task_project ON edt_task(project_id);
CREATE INDEX IF NOT EXISTS idx_edt_task_stage ON edt_task(stage_id);

-- 6. Tabela de Arquivos e Anexos da Demanda
CREATE TABLE IF NOT EXISTS edt_file (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES edt_project(id) ON DELETE CASCADE,
    stage_id INTEGER REFERENCES edt_stage(id) ON DELETE SET NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    file_type VARCHAR(100),
    uploaded_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE INDEX IF NOT EXISTS idx_edt_file_project ON edt_file(project_id);

-- 7. Tabela de Histórico e Auditoria de Movimentações
CREATE TABLE IF NOT EXISTS edt_history (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES edt_project(id) ON DELETE CASCADE,
    from_stage_id INTEGER REFERENCES edt_stage(id) ON DELETE SET NULL,
    to_stage_id INTEGER REFERENCES edt_stage(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE INDEX IF NOT EXISTS idx_edt_history_project ON edt_history(project_id);
