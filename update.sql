ALTER TABLE crm_customer ADD COLUMN IF NOT EXISTS nfse_notes TEXT;
ALTER TABLE cmp_print_point ADD COLUMN IF NOT EXISTS serie VARCHAR(50);
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS nfse_default_print_point_id INTEGER REFERENCES cmp_print_point(id);

CREATE TABLE IF NOT EXISTS system_updates (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50),
    description TEXT,
    environment VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO system_updates (version, description, environment) 
VALUES ('1.6.0-NFS-e', 'NFS-e e UX Financeira', 'PROD');
