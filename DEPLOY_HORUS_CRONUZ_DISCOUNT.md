# DEPLOY — Desconto Cronuz no B2B Horus

## Feature
Nova regra de negócio: sellers no modelo `B2B_HORUS` podem optar por usar o desconto
configurado no cadastro do customer no Cronuz (campo `crm_customer.discount`) em vez do
desconto automático calculado pelo Horus ERP.

## Alterações no Banco de Dados

Execute o SQL abaixo **antes** de subir o novo código em produção:

```sql
-- Adiciona flag de controle na tabela de configurações da empresa
ALTER TABLE cmp_settings
ADD COLUMN IF NOT EXISTS horus_use_cronuz_discount BOOLEAN NOT NULL DEFAULT FALSE;
```

> O comando é idempotente graças ao `IF NOT EXISTS`. Pode ser executado em produção
> com segurança, sem downtime.

## Arquivos Alterados

| Arquivo | Tipo |
|---------|------|
| `backend/app/models/company_settings.py` | Model — nova coluna |
| `backend/app/schemas/company_settings.py` | Schema — novo campo no contrato da API |
| `backend/app/api/storefront.py` | Lógica de cálculo de preço (busca de produtos) |
| `backend/app/integrators/horus_orders.py` | Lógica de envio de `VLR_LIQUIDO` ao Horus |
| `backend/migrate_horus_cronuz_discount.py` | Script de migração Python (para rodar localmente) |
| `frontend/.../settings/horus/page.tsx` | Toggle na tela de configurações Horus |

## Comportamento Esperado

| Cenário | Resultado |
|---------|-----------|
| `B2B_HORUS` + flag `False` (padrão) | Sem mudança — Horus calcula desconto, `VLR_LIQUIDO` não enviado |
| `B2B_HORUS` + flag `True` | Backend usa `VLR_CAPA × (1 - customer.discount%)`, `VLR_LIQUIDO` enviado ao Horus |
| `B2B_CRONUZ` (qualquer flag) | Sem mudança — comportamento original mantido |

## Verificação Pós-Deploy

```bash
# 1. Confirmar coluna criada
psql $DATABASE_URL -c "\d cmp_settings" | grep horus_use_cronuz_discount

# 2. Health check da API
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/openapi.json
# Esperado: 200
```
