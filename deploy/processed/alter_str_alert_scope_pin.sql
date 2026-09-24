-- Deploy: adiciona scope e pin_to_top em str_alert
-- Data: 2026-08-20
-- scope: 'all' = todas as páginas do store | 'home' = somente homepage
-- pin_to_top: true = faixa fixada ACIMA do StoreHeader (sem dismiss), para instabilidade/lançamentos
ALTER TABLE str_alert
    ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'all',
    ADD COLUMN IF NOT EXISTS pin_to_top BOOLEAN NOT NULL DEFAULT FALSE;
