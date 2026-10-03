# Roteiro de Deploy: Controle de Caixa, Validação de Estoque e Relatórios PDV

## 1. Contexto e Motivação
- Configuração de trava de validação de saldo por sessão de PDV (`validate_stock`).
- Abertura de caixa com fundo de troco inicial (`initial_cash_amount`).
- Fechamento de caixa com apuração de valores em gaveta, sobra/falta de caixa e histórico.
- Endpoints analíticos de relatório com exportação em Excel (`.xlsx`) e PDF (`.pdf`).

## 2. Alterações no Banco de Dados (PostgreSQL)
Executar os scripts SQL presentes em:
1. `deploy/20261003_add_branch_to_pos_session.sql` (Filial vinculada à sessão de PDV)
2. `deploy/20261003_pos_cash_control_and_stock_validation.sql` (Controle de Caixa e Validação de Estoque)
3. `deploy/20261003_add_products_count_to_pos_session.sql` (Coluna products_count)

Comandos psql em produção:
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/20261003_add_branch_to_pos_session.sql
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/20261003_pos_cash_control_and_stock_validation.sql
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/20261003_add_products_count_to_pos_session.sql
```

## 3. Rollback (se necessário)
```bash
ALTER TABLE pos_session 
DROP COLUMN IF EXISTS validate_stock,
DROP COLUMN IF EXISTS initial_cash_amount,
DROP COLUMN IF EXISTS closed_cash_amount,
DROP COLUMN IF EXISTS expected_cash_amount,
DROP COLUMN IF EXISTS cash_difference,
DROP COLUMN IF EXISTS closing_notes,
DROP COLUMN IF EXISTS closed_by_user_id;
```

## 4. Reinicialização de Serviços
```bash
systemctl restart cronuz-backend
cd /var/www/cronuz/frontend && npm run build && pm2 restart cronuz-frontend
```
