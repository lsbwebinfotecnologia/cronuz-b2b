# Roteiro de Deploy — Tarifa do Boleto Cora no Contas a Pagar + Fechamento Bancário Horus ERP

## 1. Resumo das Alterações
- **Banco de Dados PostgreSQL (`fin_cora_config`)**:
  - Inclusão das colunas de parametrização para lançamento e baixa automática da tarifa do boleto no Contas a Pagar do Horus (`dbo.LANCTOS_CPAGAR_GERAL`):
    - `horus_cpagar_tarifa_enabled` (`BOOLEAN NOT NULL DEFAULT FALSE`)
    - `horus_cp_cod_grp_fornecedor` (`VARCHAR(20)`)
    - `horus_cp_cod_fornecedor` (`VARCHAR(20)`)
    - `horus_cp_cod_departamento` (`VARCHAR(20)`)
    - `horus_cp_cod_centro_custo` (`VARCHAR(20)`)
    - `horus_cp_cod_grup_desp` (`VARCHAR(20)`)
    - `horus_cp_cod_despesa` (`VARCHAR(20)`)
    - `horus_cp_cod_forma` (`VARCHAR(20)`)
- **Motor de Baixa (`backend/app/payments/settlement.py`)**:
  - Ao baixar um título do Cora no Horus (`LANCTOS_CRECEBERA` / `LANCTOS_CRECEBER`), caso `horus_cpagar_tarifa_enabled = True` e `horus_tarifa_boleto > 0`, executa `_settle_horus_cpagar_tarifa`:
    1. Insere o lançamento em `dbo.LANCTOS_CPAGAR_GERAL` com `STA_LANCTO_CPAGAR = 'AB'` (com todos os textos em `UPPERCASE`);
    2. Atualiza `STA_LANCTO_CPAGAR = 'PG'` informando `VLR_LANCTO_PAGO`, `DAT_PAGTO_CPAGAR`, `COD_BANCO_PAGTO`, `COD_AGENCIA_PAGTO`, `COD_CONTAC_PAGTO` e `COD_FORMA_BAIXA`, disparando a trigger nativa `TRG_IMP_LANCTO_CPAGAR` que cria o lançamento de saída (`STA_LANCTO = 'S'`, `STA_RASTREIO = 'CAP'`, `COD_TPOLAN = 5 - CONTAS A PAGAR`, `STA_FECHADO = 'N'`) em `dbo.BLANCTOS`.

## 2. Comandos SQL (PostgreSQL Produção)
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_CORA_TARIFA_CPAGAR_HORUS.sql
```

## 3. Comandos de Deploy no Servidor (`64.23.182.183`)
```bash
cd /var/www/cronuz && git pull origin main
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_CORA_TARIFA_CPAGAR_HORUS.sql
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```
