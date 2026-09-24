-- Altera tamanho da coluna triggered_by de VARCHAR(20) para VARCHAR(50)
ALTER TABLE dsp_stock_sync_log ALTER COLUMN triggered_by TYPE VARCHAR(50);
