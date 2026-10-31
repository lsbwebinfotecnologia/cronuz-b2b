-- =============================================================================
-- DEPLOY: Storefront B2C — Banners, Vitrines, Destaques, Cores e URL Amigável
-- =============================================================================

ALTER TABLE cmp_settings
ADD COLUMN IF NOT EXISTS b2c_showcases_config JSON;
