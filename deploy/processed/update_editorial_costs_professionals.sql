-- ==============================================================================
-- Deploy Script: Expansao do Modulo Editorial (Profissionais, Custos, Tiragem & Templates)
-- Banco de Dados: PostgreSQL
-- Ambiente: Local / Producao
-- ==============================================================================

-- 1. Novas colunas em edt_project (Tiragem e Custos)
ALTER TABLE edt_project ADD COLUMN IF NOT EXISTS tiragem INTEGER DEFAULT 1000;
ALTER TABLE edt_project ADD COLUMN IF NOT EXISTS preco_capa_sugerido NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE edt_project ADD COLUMN IF NOT EXISTS margem_estimada_percentual NUMERIC(5, 2) DEFAULT 0.00;
ALTER TABLE edt_project ADD COLUMN IF NOT EXISTS custo_unitario_exemplar NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE edt_project ADD COLUMN IF NOT EXISTS custo_total_orcado NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE edt_project ADD COLUMN IF NOT EXISTS custo_total_realizado NUMERIC(10, 2) DEFAULT 0.00;

-- 2. Tabela de Profissionais e Prestadores de Servicos Editoriais
CREATE TABLE IF NOT EXISTS edt_professional (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    specialty VARCHAR(50) NOT NULL,
    email VARCHAR(150),
    phone VARCHAR(30),
    pix_key VARCHAR(150),
    pix_type VARCHAR(20),
    rate_type VARCHAR(30) DEFAULT 'UNITARIO',
    default_rate NUMERIC(10, 2) DEFAULT 0.00,
    rating INTEGER DEFAULT 5,
    portfolio_url VARCHAR(300),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_edt_prof_company ON edt_professional(company_id);
CREATE INDEX IF NOT EXISTS idx_edt_prof_spec ON edt_professional(specialty);

-- 3. Tabela de Servicos e Custos Vinculados por Demanda/Projeto
CREATE TABLE IF NOT EXISTS edt_project_cost (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES edt_project(id) ON DELETE CASCADE,
    stage_id INTEGER REFERENCES edt_stage(id) ON DELETE SET NULL,
    professional_id INTEGER REFERENCES edt_professional(id) ON DELETE SET NULL,
    service_type VARCHAR(50) NOT NULL,
    description VARCHAR(255) NOT NULL,
    unit_type VARCHAR(30) DEFAULT 'FECHADO',
    quantity NUMERIC(10, 2) DEFAULT 1.00,
    unit_value NUMERIC(10, 2) DEFAULT 0.00,
    estimated_total NUMERIC(10, 2) DEFAULT 0.00,
    actual_total NUMERIC(10, 2) DEFAULT 0.00,
    payment_status VARCHAR(30) DEFAULT 'ORCADO',
    paid_at TIMESTAMP WITHOUT TIME ZONE,
    invoice_number VARCHAR(100),
    notes TEXT,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_edt_cost_project ON edt_project_cost(project_id);
CREATE INDEX IF NOT EXISTS idx_edt_cost_prof ON edt_project_cost(professional_id);

-- 4. Tabela de Modelos Profissionais de Esteiras (Templates de Mercado)
CREATE TABLE IF NOT EXISTS edt_pipeline_template (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    color VARCHAR(30) DEFAULT '#6366f1',
    stages_json JSONB NOT NULL,
    default_services_json JSONB,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- Seed de Modelos Profissionais caso a tabela esteja vazia
INSERT INTO edt_pipeline_template (name, category, description, color, stages_json, default_services_json)
SELECT 
    'Livro Comercial & Ficção (Fluxo Completo)',
    'FICCAO',
    'Esteira editorial padrão para romances, contos e livros de entretenimento comercial.',
    '#6366f1',
    '[
        {"name": "Preparação de Original", "color": "#3b82f6", "sla_days": 10, "is_initial": true, "is_final": false},
        {"name": "1ª Revisão de Texto", "color": "#06b6d4", "sla_days": 15, "is_initial": false, "is_final": false},
        {"name": "Diagramação (Miolo)", "color": "#8b5cf6", "sla_days": 10, "is_initial": false, "is_final": false},
        {"name": "Criação de Capa", "color": "#ec4899", "sla_days": 7, "is_initial": false, "is_final": false},
        {"name": "2ª Revisão (Prova/Cotejo)", "color": "#f59e0b", "sla_days": 7, "is_initial": false, "is_final": false},
        {"name": "Aprovação Final & Ficha/ISBN", "color": "#10b981", "sla_days": 3, "is_initial": false, "is_final": false},
        {"name": "Orçamento & Gráfica", "color": "#64748b", "sla_days": 15, "is_initial": false, "is_final": false},
        {"name": "Publicado / Entregue", "color": "#14b8a6", "sla_days": 0, "is_initial": false, "is_final": true}
    ]'::jsonb,
    '[
        {"service_type": "REVISAO_1", "description": "1ª Revisão Gramatical e Ortográfica", "unit_type": "LAUDA", "quantity": 250, "unit_value": 10.00},
        {"service_type": "DIAGRAMACAO", "description": "Diagramação de Miolo (InDesign)", "unit_type": "PAGINA", "quantity": 200, "unit_value": 5.50},
        {"service_type": "CAPA", "description": "Projeto Gráfico de Capa Completa", "unit_type": "FECHADO", "quantity": 1, "unit_value": 1200.00},
        {"service_type": "REVISAO_2", "description": "2ª Revisão (Cotejo de Prova)", "unit_type": "PAGINA", "quantity": 200, "unit_value": 3.00},
        {"service_type": "IMPRESSAO_GRAFICA", "description": "Impressão Gráfica Offset/Digital", "unit_type": "EXEMPLAR", "quantity": 1000, "unit_value": 9.50}
    ]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM edt_pipeline_template WHERE name = 'Livro Comercial & Ficção (Fluxo Completo)');

INSERT INTO edt_pipeline_template (name, category, description, color, stages_json, default_services_json)
SELECT 
    'Acadêmico & Técnico (Com Pareceristas)',
    'ACADEMICO',
    'Esteira rigorosa para teses, livros didáticos, universitários e artigos técnicos com comitê editorial.',
    '#0284c7',
    '[
        {"name": "Submissão & Triagem", "color": "#64748b", "sla_days": 7, "is_initial": true, "is_final": false},
        {"name": "Parecer / Conselho Editorial", "color": "#3b82f6", "sla_days": 25, "is_initial": false, "is_final": false},
        {"name": "Adequações pelo Autor", "color": "#eab308", "sla_days": 15, "is_initial": false, "is_final": false},
        {"name": "Revisão Técnica & ABNT", "color": "#06b6d4", "sla_days": 15, "is_initial": false, "is_final": false},
        {"name": "Diagramação Técnica", "color": "#8b5cf6", "sla_days": 14, "is_initial": false, "is_final": false},
        {"name": "Ficha Catalográfica & DOI", "color": "#10b981", "sla_days": 5, "is_initial": false, "is_final": false},
        {"name": "Publicação Acadêmica", "color": "#14b8a6", "sla_days": 0, "is_initial": false, "is_final": true}
    ]'::jsonb,
    '[
        {"service_type": "LEITURA_CRITICA", "description": "Honorários / Parecer Técnico", "unit_type": "FECHADO", "quantity": 1, "unit_value": 800.00},
        {"service_type": "REVISAO_1", "description": "Revisão Textual e Normas ABNT", "unit_type": "LAUDA", "quantity": 300, "unit_value": 12.00},
        {"service_type": "DIAGRAMACAO", "description": "Diagramação Técnica (Tabelas e Gráficos)", "unit_type": "PAGINA", "quantity": 250, "unit_value": 7.00},
        {"service_type": "CAPA", "description": "Capa Padrão Coleção Acadêmica", "unit_type": "FECHADO", "quantity": 1, "unit_value": 600.00},
        {"service_type": "IMPRESSAO_GRAFICA", "description": "Impressão Gráfica Sob Demanda (POD)", "unit_type": "EXEMPLAR", "quantity": 300, "unit_value": 16.00}
    ]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM edt_pipeline_template WHERE name = 'Acadêmico & Técnico (Com Pareceristas)');

INSERT INTO edt_pipeline_template (name, category, description, color, stages_json, default_services_json)
SELECT 
    'Reimpressão Rápida / Nova Tiragem',
    'REIMPRESSAO',
    'Fluxo ágil para obras do catálogo que necessitam apenas de pequenas erratas e cotação gráfica.',
    '#10b981',
    '[
        {"name": "Levantamento de Erratas", "color": "#f59e0b", "sla_days": 3, "is_initial": true, "is_final": false},
        {"name": "Ajuste de Miolo & Ficha", "color": "#8b5cf6", "sla_days": 4, "is_initial": false, "is_final": false},
        {"name": "Cotação & Impressão", "color": "#06b6d4", "sla_days": 10, "is_initial": false, "is_final": false},
        {"name": "Reimpressão Finalizada", "color": "#14b8a6", "sla_days": 0, "is_initial": false, "is_final": true}
    ]'::jsonb,
    '[
        {"service_type": "DIAGRAMACAO", "description": "Ajuste de Erratas e Atualização de Ficha", "unit_type": "FECHADO", "quantity": 1, "unit_value": 250.00},
        {"service_type": "IMPRESSAO_GRAFICA", "description": "Reimpressão Gráfica", "unit_type": "EXEMPLAR", "quantity": 1000, "unit_value": 8.80}
    ]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM edt_pipeline_template WHERE name = 'Reimpressão Rápida / Nova Tiragem');

INSERT INTO edt_pipeline_template (name, category, description, color, stages_json, default_services_json)
SELECT 
    'E-book & Audiobook First',
    'EBOOK',
    'Fluxo focado em publicação digital (ePub, Kindle, audiolivro e distribuição em plataformas).',
    '#8b5cf6',
    '[
        {"name": "Preparação de Texto", "color": "#3b82f6", "sla_days": 7, "is_initial": true, "is_final": false},
        {"name": "Revisão Textual", "color": "#06b6d4", "sla_days": 10, "is_initial": false, "is_final": false},
        {"name": "Conversão ePub / KF8", "color": "#8b5cf6", "sla_days": 5, "is_initial": false, "is_final": false},
        {"name": "Gravação de Audiolivro", "color": "#ec4899", "sla_days": 20, "is_initial": false, "is_final": false},
        {"name": "Validação & Metadados", "color": "#10b981", "sla_days": 3, "is_initial": false, "is_final": false},
        {"name": "Distribuído nas Lojas", "color": "#14b8a6", "sla_days": 0, "is_initial": false, "is_final": true}
    ]'::jsonb,
    '[
        {"service_type": "REVISAO_1", "description": "Revisão Textual Digital", "unit_type": "LAUDA", "quantity": 200, "unit_value": 9.00},
        {"service_type": "CAPA", "description": "Capa Digital / E-book", "unit_type": "FECHADO", "quantity": 1, "unit_value": 700.00},
        {"service_type": "DIAGRAMACAO", "description": "Conversão e Validação ePub 3.0", "unit_type": "FECHADO", "quantity": 1, "unit_value": 650.00}
    ]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM edt_pipeline_template WHERE name = 'E-book & Audiobook First');
