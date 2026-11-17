-- =============================================================================
-- DEPLOY: DBM Proposals - Campo Assunto (subject) e Snapshot Completo da Mesa
-- Tabela: dbm_proposal
-- =============================================================================

ALTER TABLE dbm_proposal
    ADD COLUMN IF NOT EXISTS subject VARCHAR(255) NULL;

ALTER TABLE dbm_proposal
    ADD COLUMN IF NOT EXISTS desk_snapshot_json JSON NULL;

CREATE INDEX IF NOT EXISTS ix_dbm_proposal_subject
    ON dbm_proposal (subject);
