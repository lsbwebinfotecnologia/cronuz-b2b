# Roteiro de Deploy — Exclusão de Transferências do Resultado Caixa e Relatórios

## 📋 Resumo das Alterações
1. **Transferências Bancárias (`transfer_account` em `backend/app/api/financial.py`)**:
   - As transações e parcelas geradas na transferência entre contas bancárias agora são marcadas com `exclude_from_reports = True`.
2. **Dashboard (`backend/app/api/dashboard.py`)**:
   - A consulta de `financial_metrics` (Recebimentos, Pagamentos e Resultado Caixa) agora realiza join com `FinancialCategory` e exclui explicitamente categorias com nome `'Transferência entre Contas'`.
   - Adicionada a trava `exclude_from_reports == False` para garantir que apenas receitas e despesas operacionais da empresa (PJ) componham o resultado de caixa.

---

## 🗄️ Alterações no Banco de Dados (PostgreSQL)

Execute o comando SQL abaixo para atualizar retroativamente todas as transferências já criadas anteriormente, garantindo que não impactem relatórios nem o painel da empresa:

```sql
-- Atualiza transações de transferência entre contas para exclude_from_reports = TRUE
UPDATE fin_transaction
SET exclude_from_reports = TRUE
WHERE category_id IN (
    SELECT id FROM fin_category WHERE name = 'Transferência entre Contas'
);

-- Atualiza parcelas vinculadas a transferências entre contas para exclude_from_reports = TRUE
UPDATE fin_installment
SET exclude_from_reports = TRUE
WHERE transaction_id IN (
    SELECT id FROM fin_transaction WHERE category_id IN (
        SELECT id FROM fin_category WHERE name = 'Transferência entre Contas'
    )
);
```

---

## 🚀 Passos para Deploy em Produção (Quando Autorizado):

```bash
# 1. SSH no servidor
ssh root@64.23.182.183

# 2. Atualizar código
cd /var/www/cronuz && git pull origin main

# 3. Aplicar SQL no PostgreSQL
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -c "
UPDATE fin_transaction SET exclude_from_reports = TRUE WHERE category_id IN (SELECT id FROM fin_category WHERE name = 'Transferência entre Contas');
UPDATE fin_installment SET exclude_from_reports = TRUE WHERE transaction_id IN (SELECT id FROM fin_transaction WHERE category_id IN (SELECT id FROM fin_category WHERE name = 'Transferência entre Contas'));
"

# 4. Reiniciar backend
systemctl restart cronuz-backend

# 5. Validação
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/docs
```
