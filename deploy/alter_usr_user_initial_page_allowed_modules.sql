-- ==============================================================================
-- Migration: Adiciona colunas initial_page e allowed_modules na tabela usr_user
-- Data: 2026-09-24
-- Descrição: Permite configurar o direcionamento inicial ao logar e o escopo de módulos permitidos por usuário.
-- ==============================================================================

ALTER TABLE usr_user ADD COLUMN IF NOT EXISTS initial_page VARCHAR(100);
ALTER TABLE usr_user ADD COLUMN IF NOT EXISTS allowed_modules JSON;
