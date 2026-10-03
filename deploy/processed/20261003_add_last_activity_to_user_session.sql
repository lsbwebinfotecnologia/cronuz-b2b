-- =============================================================================
-- Migration: Adicionar coluna last_activity_at na tabela usr_session_logs
-- Data: 2026-10-03
-- Contexto: Monitoramento de acessos e sessões ativas em tempo real para o Master
-- =============================================================================

ALTER TABLE usr_session_logs 
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_usr_session_logs_active_activity 
ON usr_session_logs(is_active, last_activity_at);

CREATE INDEX IF NOT EXISTS idx_usr_session_logs_user_role 
ON usr_session_logs(role, is_active);
