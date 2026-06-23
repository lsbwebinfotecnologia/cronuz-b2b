# DEPLOY — Módulos Mobile (Sistema de Permissões por Seller)

## Data: 2026-06-19
## Ambiente: Produção (Digital Ocean)

---

## Alterações no Banco de Dados (PostgreSQL)

### 1. Adicionar coluna `mobile_modules` na tabela `cmp_company`

```sql
ALTER TABLE cmp_company
ADD COLUMN IF NOT EXISTS mobile_modules JSONB DEFAULT '{
  "pdv": false,
  "conferencia": false,
  "vendas": false,
  "pedidos": false,
  "catalogo": false,
  "clientes": false
}'::jsonb;
```

> ⚠️ Usar `ADD COLUMN IF NOT EXISTS` para ser idempotente.

---

## Arquivos Modificados

| Arquivo | Tipo | Descrição |
|---|---|---|
| `backend/app/api/auth.py` | MODIFY | Login retorna `mobile_modules` para SELLER |
| `backend/app/api/mobile.py` | NEW | GET/PUT `/seller/mobile/modules/{company_id}` |
| `backend/main.py` | MODIFY | Import e registro do router mobile |
| `mobile/services/auth.service.ts` | MODIFY | Persiste módulos no SecureStore |
| `mobile/store/auth.store.ts` | MODIFY | State + `hasModule()` helper |

---

## Novos Endpoints

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/seller/mobile/modules/{company_id}` | MASTER ou próprio SELLER | Lista módulos ativos |
| `PUT` | `/seller/mobile/modules/{company_id}` | MASTER apenas | Ativa/desativa módulos |

---

## Verificação pós-deploy

```bash
# 1. Verificar se coluna existe
psql $DATABASE_URL -c "\d cmp_company" | grep mobile_modules

# 2. Testar endpoint de módulos
curl -H "Authorization: Bearer <TOKEN_MASTER>" \
  https://api.cronuz.com.br/seller/mobile/modules/1

# 3. Ativar um módulo para seller (company_id=1)
curl -X PUT \
  -H "Authorization: Bearer <TOKEN_MASTER>" \
  -H "Content-Type: application/json" \
  -d '{"pdv": true, "conferencia": true}' \
  https://api.cronuz.com.br/seller/mobile/modules/1
```
