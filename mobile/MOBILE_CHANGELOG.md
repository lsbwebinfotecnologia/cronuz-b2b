# 📱 Mobile App — Changelog de Versões

> **Regra obrigatória:** a cada rebuild do APK que vai para teste ou produção,
> incrementar a versão em `mobile/app.json` e `mobile/android/app/build.gradle`
> e registrar as mudanças aqui.

---

## Formato de versão

```
MAJOR.MINOR.PATCH
│     │     └── Correção de bug (sem novas funcionalidades)
│     └── Nova funcionalidade ou ajuste de fluxo
└── Mudança arquitetural grande / breaking change
```

| Arquivo | Campo |
|---|---|
| `mobile/app.json` | `expo.version` e `expo.android.versionCode` |
| `mobile/android/app/build.gradle` | `versionCode` e `versionName` |

---

## v1.1.0 — 2026-06-22
**versionCode: 2**

### ✅ Conferência de Expedição (bipe)
- Reescrita completa de `conferencia/[id].tsx` com novo fluxo seguro:
  - Scanner captura código → Modal de Confirmação → Submit ao Horus
  - Modal mostra: nome do produto, qtd pedida / conferida / restante, input de qty
  - Botões `−` e `+` para ajustar quantidade antes de confirmar
- **App nunca fecha por erro** — `ErrorModal` elegante captura todo exception
- `try/catch` global em todas as funções async (loadConference, submitItem, closeVolume, finalize)
- `BarcodeScannerModal` protegido contra crash no `handleBarcode`

### 🐛 Correção crítica: Network Error no bipe
- **Causa:** `cod_ped_venda` não estava sendo persistido na sessão local (`cmp_order_conference`)
- **Efeito:** ao retomar uma conferência da lista, o campo chegava vazio ao Horus → rejeição
- **Fix backend:** nova coluna `cod_ped_venda` na tabela; persistida na criação; auto-corrigida em sessões antigas
- **Fix mobile:** resolve `cod_ped_venda` da sessão retornada pela API (não mais do parâmetro de navegação)
- **Migration aplicada em produção:** `ALTER TABLE cmp_order_conference ADD COLUMN cod_ped_venda VARCHAR(50)`

### 🔧 Scanner Modal
- Campo de **teste manual de ISBN** no rodapé da câmera (para testes no emulador sem câmera física)
- Ícone `camera-off-outline` corrigido para `camera-outline` (Ionicons v5)
- `onScanned` protegido contra throw silencioso

### ⚙️ Infra
- `local.properties` configurado: `sdk.dir=/Users/licivandosilva/Library/Android/sdk`
- `.env`, `.env.local`, `.env.production` unificados → todos apontam para `https://cronuzb2b.com.br/api`
- Serviço de produção: `cronuz-backend.service` em `/var/www/cronuz`

---

## v1.0.0 — 2026-06-15
**versionCode: 1**

### 🚀 Lançamento inicial
- Autenticação JWT com SecureStore
- Dashboard com KPIs
- Módulo PDV: seleção de cliente, busca de produto por ISBN, carrinho
- Módulo Pedidos: listagem com filtros
- Módulo Conferência de Expedição:
  - Listagem de conferências por filial
  - Sessão de bipe com abertura/fechamento de caixas
  - Integração Horus: ConfereItem_Pedido, InsVolume_Pedido
- BarcodeScannerModal com lock-in de 3 leituras consecutivas
- Suporte a câmera (expo-camera) com permissão Android
