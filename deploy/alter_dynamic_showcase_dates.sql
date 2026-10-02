-- Add start_date and end_date to mkt_dynamic_showcase
ALTER TABLE mkt_dynamic_showcase 
ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE NULL;

CREATE INDEX IF NOT EXISTS idx_mkt_dynamic_showcase_dates ON mkt_dynamic_showcase(company_id, active, start_date, end_date);
