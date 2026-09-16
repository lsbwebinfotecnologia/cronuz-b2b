-- Migration SQL: Adicionar supervisor_pin no inv_inventory
ALTER TABLE inv_inventory ADD COLUMN IF NOT EXISTS supervisor_pin VARCHAR(50) DEFAULT '1234';
UPDATE inv_inventory SET supervisor_pin = '1234' WHERE supervisor_pin IS NULL;
