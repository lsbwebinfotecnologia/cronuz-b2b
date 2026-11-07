-- Migration: Adiciona coluna pdv_supervisor_password na tabela cmp_settings
-- Data: 06/11/2026
-- Descrição: Senha do Supervisor do PDV utilizada para autorizar reabertura de sessões/eventos fechados.

ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS pdv_supervisor_password VARCHAR(100);
