-- Deploy: Adição do campo module_encomendas na tabela cmp_company
-- Data: 2026-10-11
-- Compatível com PostgreSQL

ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_encomendas BOOLEAN NOT NULL DEFAULT FALSE;
