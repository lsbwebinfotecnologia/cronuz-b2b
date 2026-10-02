-- Adjust foreign key on sch_event.showcase_id
-- Drop the legacy FK pointing exclusively to mkt_showcase so it can store either mkt_dynamic_showcase.id or mkt_showcase.id
ALTER TABLE sch_event DROP CONSTRAINT IF EXISTS sch_event_showcase_id_fkey;
