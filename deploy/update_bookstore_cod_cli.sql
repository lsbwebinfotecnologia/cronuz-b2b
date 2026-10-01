-- Atualização do COD_CLI da credencial Erdos Bookstore no Hórus
-- Credencial ID 2: Customer 585 (NATAN HENRIQUE BELMIRO ERDOS / CNPJ: 68.760.554/0001-20)
-- COD_CLI no Hórus = 78787

UPDATE dsp_erdos_credential
SET horus_customer_cod_cli = '78787',
    updated_at = NOW()
WHERE id = 2 AND horus_customer_id = 585;
