-- Deploy: Adicionar módulo Dropshipping por empresa
-- Data: 2026-08-18
-- Executar em produção após o deploy do código

ALTER TABLE cmp_company
  ADD COLUMN IF NOT EXISTS module_dropship BOOLEAN NOT NULL DEFAULT FALSE;
