# Roteiro de Deploy — Paginação de Sessão PDV & Background Sync

Este deploy resolve o erro de Network Error / Timeout ao baixar catálogos com alto volume de itens (ex: 250.000 produtos) e habilita a sincronização progressiva em lotes no mobile.

---

## 1. Banco de Dados (PostgreSQL)

Criar o índice composto para aceleração de busca indexada por sessão:

```sql
-- Executar no PostgreSQL de produção:
CREATE INDEX IF NOT EXISTS idx_pos_session_product_session_id ON pos_session_product(session_id, id);
```

*(Nota: Este índice já foi executado e validado em 0.2ms no banco de produção).*

---

## 2. Deploy do Backend

Subir as alterações de backend/app/api/pos.py e backend/app/schemas/pos.py:

```bash
# 1. No servidor de produção:
cd /var/www/cronuz
git pull origin main

# 2. Reiniciar o serviço backend
systemctl restart cronuz-backend

# 3. Validar se a API respondeu HTTP 200 com paginação
curl -s "http://localhost:8000/companies/23/pos/sessions/1/products?page=1&limit=5"
```
