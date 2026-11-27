# Roteiro de Deploy — Compras Horus (Status AB/AP/AE/CA, Troca de Fornecedor, Pendência e Mesclagem)

## 1. Resumo das Alterações de Banco de Dados (PostgreSQL)

Adicionadas colunas idempotentes (`VARCHAR(1)` com valor padrão `'S'` = **SIM**) para parametrizar e registrar a opção **Gerar Pendência (`GERAR_PEND`)** do Horus ERP:

1. Tabela `pur_horus_branch_config`:
   - `gerar_pendencia_default VARCHAR(1) NOT NULL DEFAULT 'S'` — Define o padrão da filial na tela de Compras (`'S'` = SIM por padrão, `'N'` = NÃO).
2. Tabela `pur_horus_order`:
   - `gerar_pendencia VARCHAR(1) NOT NULL DEFAULT 'S'` — Armazena o parâmetro `GERAR_PEND` enviado ao `PEDIDOS_COMPRA` do Horus SQL Server.

## 2. Script SQL de Migração em Produção

Executar no servidor `64.23.182.183` antes de reiniciar o `cronuz-backend`:

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_HORUS_COMPRAS_STATUS_FORNEC_PENDENCIA.sql
```

Conteúdo exato do script (`deploy/DEPLOY_HORUS_COMPRAS_STATUS_FORNEC_PENDENCIA.sql`):

```sql
ALTER TABLE pur_horus_branch_config
    ADD COLUMN IF NOT EXISTS gerar_pendencia_default VARCHAR(1) NOT NULL DEFAULT 'S';

ALTER TABLE pur_horus_order
    ADD COLUMN IF NOT EXISTS gerar_pendencia VARCHAR(1) NOT NULL DEFAULT 'S';
```

## 3. Passos Completos do Deploy (Quando Autorizado)

```bash
cd /var/www/cronuz && git pull origin main
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_HORUS_COMPRAS_STATUS_FORNEC_PENDENCIA.sql
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```

Após execução e validação em produção, mover os arquivos deste deploy para `deploy/processed/`.
