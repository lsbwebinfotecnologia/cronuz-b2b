# DEPLOY — Dropship: Sincronização Erdos em Tempo Real

**Data:** 2026-07-15

## Banco de Dados (Produção)

```sql
ALTER TABLE dsp_order
    ADD COLUMN IF NOT EXISTS erdos_status       VARCHAR(50),
    ADD COLUMN IF NOT EXISTS erdos_checked_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS erdos_alert        BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS logs               JSONB NOT NULL DEFAULT '[]'::jsonb;
```

## Arquivos Alterados

### Backend
- `app/models/dropship.py` — campos: erdos_status, erdos_checked_at, erdos_alert, logs
- `app/api/dropship.py` — check_erdos_status reescrito + DropshipOrderResponse atualizado + PATCH preparando em send-to-horus

### Frontend
- `orders/dropship/[orderId]/page.tsx` — auto-check na abertura, banner bloqueante, badge Erdos, logs timeline

## Cenários

| Erdos / Local | PENDING | SENT_TO_HORUS | DISPATCHED | CANCELLED |
|---|---|---|---|---|
| cancelado | Auto-cancela | ALERTA BLOQUEANTE | Log critico | Sem acao |
| postado | Log | Captura rastreio | OK | Log |
| entregue | Log inconsistencia | Log | OK | Log |
| preparando | Log inconsistencia | OK | OK | Log |
| aguardando | OK | Log inconsistencia | Log inconsistencia | Log |
