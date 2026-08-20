-- Deploy: adiciona módulo Notificações em cmp_company
-- Data: 2026-08-20
-- Permite que sellers gerenciem alertas programáveis para seus customers
ALTER TABLE cmp_company
    ADD COLUMN IF NOT EXISTS module_notifications BOOLEAN NOT NULL DEFAULT FALSE;
