-- ==============================================================================
-- Script de Alteração de Banco de Dados: Apresentação e Modelos de Eventos
-- Data: 2026-10-01
-- Descrição: Adiciona suporte a HTML customizável, logo, template e vínculo
--            de agendamento por escola na tabela sch_event.
-- ==============================================================================

-- 1. Adicionar colunas de apresentação rica e identidade visual
ALTER TABLE sch_event ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500);
ALTER TABLE sch_event ADD COLUMN IF NOT EXISTS content_html TEXT;

-- 2. Adicionar flag de template e vínculo hierárquico (evento modelo -> ocorrência na escola)
ALTER TABLE sch_event ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sch_event ADD COLUMN IF NOT EXISTS parent_event_id INTEGER REFERENCES sch_event(id) ON DELETE SET NULL;

-- 3. Criar índice para performance em consultas de agendamentos derivados
CREATE INDEX IF NOT EXISTS idx_sch_event_parent ON sch_event(company_id, parent_event_id);
