-- ============================================================================
-- MIGRATION: Licenciamento Horus PDV Desktop (.EXE) & Sincronizacao por Range
-- Tabela: cmp_settings (PostgreSQL)
-- ============================================================================

ALTER TABLE cmp_settings
  ADD COLUMN IF NOT EXISTS pdv_desktop_license_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pdv_desktop_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pdv_desktop_license_key VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS pdv_horus_range_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE;
