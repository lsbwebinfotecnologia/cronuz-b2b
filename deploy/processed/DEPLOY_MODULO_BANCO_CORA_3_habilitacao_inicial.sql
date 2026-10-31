-- =============================================================================
-- DEPLOY: Hub de Pagamentos — PARTE 3 (carga inicial de habilitação)
-- Somente INSERT em tabela nova (pay_provider_enablement), idempotente (ON CONFLICT DO NOTHING).
-- Marca como HABILITADOS no Hub os intermediadores que cada seller JÁ usa hoje (configurados em
-- cmp_settings), para que o Hub reflita a realidade sem mudar o comportamento atual.
-- O Banco Cora só é habilitado para quem já tinha a flag antiga cmp_company.module_cora = TRUE;
-- os demais devem ser ativados pelo Master no Hub.
-- =============================================================================
BEGIN;

INSERT INTO pay_provider_enablement (company_id, provider, enabled)
SELECT company_id, 'INTER', TRUE FROM cmp_settings
WHERE inter_enabled IS TRUE AND inter_client_id IS NOT NULL AND inter_client_id <> ''
ON CONFLICT (company_id, provider) DO NOTHING;

INSERT INTO pay_provider_enablement (company_id, provider, enabled)
SELECT company_id, 'EFI', TRUE FROM cmp_settings
WHERE efi_client_id IS NOT NULL AND efi_client_id <> '' AND efi_client_secret IS NOT NULL AND efi_client_secret <> ''
ON CONFLICT (company_id, provider) DO NOTHING;

INSERT INTO pay_provider_enablement (company_id, provider, enabled)
SELECT company_id, 'VINDI', TRUE FROM cmp_settings
WHERE vindi_api_key IS NOT NULL AND vindi_api_key <> ''
ON CONFLICT (company_id, provider) DO NOTHING;

INSERT INTO pay_provider_enablement (company_id, provider, enabled)
SELECT company_id, 'CIELO', TRUE FROM cmp_settings
WHERE cielo_merchant_id IS NOT NULL AND cielo_merchant_id <> ''
ON CONFLICT (company_id, provider) DO NOTHING;

INSERT INTO pay_provider_enablement (company_id, provider, enabled)
SELECT company_id, 'REDE', TRUE FROM cmp_settings
WHERE rede_pv IS NOT NULL AND rede_pv <> '' AND rede_token IS NOT NULL AND rede_token <> ''
ON CONFLICT (company_id, provider) DO NOTHING;

-- Banco Cora: sellers já habilitados pela flag antiga cmp_company.module_cora ou com credenciais cadastradas
INSERT INTO pay_provider_enablement (company_id, provider, enabled)
SELECT id, 'CORA', TRUE FROM cmp_company
WHERE module_cora IS TRUE
ON CONFLICT (company_id, provider) DO NOTHING;

INSERT INTO pay_provider_enablement (company_id, provider, enabled)
SELECT DISTINCT company_id, 'CORA', TRUE FROM fin_cora_account
WHERE client_id IS NOT NULL AND client_id <> ''
ON CONFLICT (company_id, provider) DO NOTHING;

COMMIT;
