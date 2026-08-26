-- Adiciona coluna company_id na tabela sit_hosted_sites
ALTER TABLE sit_hosted_sites ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES cmp_company(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_sit_hosted_sites_company_id ON sit_hosted_sites(company_id);
