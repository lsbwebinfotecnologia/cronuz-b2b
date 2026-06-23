# 📱 Horus B2B Mobile — Arquitetura & Changelog

> **Leia este arquivo antes de implementar qualquer nova rotina.**
> Ele documenta decisões arquiteturais, regras de negócio e o histórico de versões.

---

## 🏗️ Arquitetura Geral

### Stack

| Camada | Tecnologia |
|---|---|
| Framework | **Expo (React Native)** — bare workflow com `expo prebuild` |
| Navegação | **Expo Router** (file-based routing — pasta `app/`) |
| Estado global | **Zustand** (`store/*.store.ts`) |
| HTTP | **Axios** com interceptors JWT automáticos |
| Armazenamento seguro | **expo-secure-store** (token JWT) |
| Ícones | **@expo/vector-icons / Ionicons** |
| Build Android | **Gradle** (release APK assinado) |

### Ambiente de produção

```
API Base URL: https://cronuzb2b.com.br/api
Usuário padrão (seller): seller@fmz.com.br / abc123*
```

---

## 📁 Estrutura de Pastas

```
mobile/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx          ← Tab bar + registro de callback de logout (401)
│   │   ├── index.tsx            ← Dashboard (KPIs, pedidos recentes, versão no rodapé)
│   │   ├── orders/              ← Listagem e detalhe de pedidos
│   │   ├── pdv/
│   │   │   ├── index.tsx        ← Busca de cliente + catálogo Horus
│   │   │   └── cart.tsx         ← Carrinho, tipo de operação, finalização
│   │   └── conferencia/         ← (em desenvolvimento) Rotina de conferência
│   ├── (auth)/
│   │   └── login.tsx            ← Tela de login OAuth2 (form-data)
│   └── _layout.tsx              ← Root layout + AuthGuard + hydrate()
├── constants/
│   ├── theme.ts                 ← Cores, tipografia, espaçamentos
│   └── version.ts               ← ⭐ Versão central do app (atualizar a cada release)
├── services/
│   ├── api.ts                   ← Axios instance (JWT interceptor, logout no 401)
│   ├── auth.service.ts          ← Login, logout, SecureStore
│   ├── pdv.service.ts           ← Busca clientes/produtos, criação de pedido
│   └── orders.service.ts        ← Listagem/detalhe de pedidos
├── store/
│   ├── auth.store.ts            ← Estado de autenticação (Zustand)
│   └── pdv.store.ts             ← Carrinho PDV (cliente, itens, totais)
├── docs/
│   └── mobile_modules_architecture.md  ← Este arquivo
└── utils/
    └── formatters.ts            ← formatCurrency, formatDate, formatOrderStatus
```

---

## 🔑 Autenticação

- **Endpoint:** `POST /token` (OAuth2 `application/x-www-form-urlencoded`)
- **Armazenamento:** `expo-secure-store` — chave `access_token`
- **Expiração:** **7 dias** (aumentado de 1h em v01.007)
- **Refresh:** automático via interceptor — qualquer 401 aciona `signOut()` e redireciona para login
- **Callback:** `registerSessionExpiredCallback()` registrado no `_layout.tsx` das tabs

---

## 🛒 Fluxo do PDV

### Regra de negócio (igual ao portal seller web)

1. **Selecionar cliente** → `GET /mobile/pdv/customers?q=...`
   - Retorna: `id`, `name`, `document`, `id_guid`, `consignment_status`, `discount`, `commercial_policy`
2. **Buscar produto** → `GET /mobile/pdv/products?q=...&customer_id=...`
   - Delega para `list_products` que chama Horus B2B ou catálogo Cronuz
   - Campos mapeados: `base_price → price`, `stock_quantity → stock`, `ean_gtin → barcode`
   - IDs Horus vêm como string `"horus-XXXX"` — tratados corretamente
   - Horus pode levar **até 15-20s** para responder — timeout configurado para 60s
3. **Adicionar ao carrinho** → `usePDVStore.addItem()`
   - Preço usado: `promotional_price ?? base_price`
4. **Tipo de operação** → `V` (Venda Direta) ou `C` (Consignação) — **ambos sempre visíveis**
5. **Finalizar** → `POST /orders` (mesmo endpoint do portal seller)
   - Inclui integração Horus automática se `settings.horus_enabled`
   - `customer_order_ref` = "Meu Pedido" (número interno do vendedor)
   - `discount_amount = 0` (desconto já embutido em `promotional_price`)

### ⚠️ Regras importantes

- **Não mostrar campo de desconto** na finalização — desconto vem da política comercial
- **Enviar ao Horus** somente se o seller usa B2B Horus (`settings.horus_enabled`)
- Ao buscar produtos Horus, **aguardar até 60 segundos** (API é lenta ~15s)
- **Não alterar** `POST /orders` no backend sem validar impacto no portal seller

---

## 📦 Build & Deploy

### Gerar APK de release

```bash
cd mobile
EXPO_PUBLIC_API_URL="https://cronuzb2b.com.br/api" \
EXPO_PUBLIC_APP_NAME="Horus B2B" \
EXPO_PUBLIC_TENANT_ID="horus" \
ANDROID_HOME=$HOME/Library/Android/sdk \
JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home \
./android/gradlew -p android assembleRelease --no-daemon
```

APK gerado em: `android/app/build/outputs/apk/release/app-release.apk`

### Instalar via ADB (emulador/celular USB)

```bash
adb uninstall com.cronuz.b2b
adb install android/app/build/outputs/apk/release/app-release.apk
adb reverse --remove-all && adb forward --remove-all
adb shell am start -n com.cronuz.b2b/.MainActivity
```

> **Build não é necessário para cada ajuste** — use `expo start` + dev build para hot reload.
> Build de release apenas quando aprovar para distribuição.

---

## 🔄 Controle de Versão

**Arquivo:** `mobile/constants/version.ts`
**Formato:** `MM.NNN`
- `MM` = major (mudança estrutural/arquitetural)
- `NNN` = minor (feature, fix, ajuste)

**Regra:** Ao finalizar uma sessão de alterações, incrementar `APP_VERSION` e adicionar entrada no Changelog abaixo.

---

## 📋 Changelog

### v01.023 — 2026-06-22
**Conferência de Expedição — Parâmetros Robustos e Prevenção de Crashes**
- Adicionados fallbacks redundantes para `cod_ped_venda` e `cod_item` (tratando propriedades alternativas e assegurando conversão explícita para string, evitando parâmetros nulos/indefinidos na submissão ao backend).
- Tratamento defensivo no `showError` para converter objetos/arrays de erro (ex: validações 422 de API do FastAPI) em strings, prevenindo crashes de renderização causados por objetos não escalares passados para componentes de texto React Native.
- APK: `HorusB2B-v01.023.apk`

---

### v01.022 — 2026-06-22
**Conferência de Expedição — Correção de Mapeamento de Campos**
- Corrigido problema onde o título do item e a quantidade pedida vinham em branco devido a divergências de nomes de campos retornados pela API do Horus (fallbacks mapeados: `NOM_ITEM`/`DESCRICAO` e `QTD_PEDIDA`/`QT_PEDIDA`).
- APK: `HorusB2B-v01.022.apk`

---

### v01.021 — 2026-06-22
**Conferência de Expedição — Regras e Melhorias**
- Enforçado limite de quantidade conferida (não permite ultrapassar a pedida).
- Bloqueio de bipes de produtos não pertencentes ao pedido com mensagem de erro.
- Adicionado campo de busca por descrição/ISBN no topo da lista.
- Adicionado filtro (funnel) para ocultar itens concluídos (exibir apenas pendentes).
- Permitido clique em qualquer item da lista para abrir o modal de conferência manual (inclusive permitindo quantidade 0).
- Implementada visualização de detalhes da caixa e cancelamento/exclusão direta com estorno no Horus.
- APK: `HorusB2B-v01.021.apk`

---

### v01.020 — 2026-06-22
**Conferência de Expedição — Bipe Seguro + Fix Network Error**
- Reescrita completa de `conferencia/[id].tsx`: scanner → modal de confirmação → submit ao Horus
- `ErrorModal` global: app nunca fecha por erro, apresenta modal elegante em qualquer exception
- **Correção crítica:** `cod_ped_venda` não estava persistido na sessão (`cmp_order_conference`)
  - Nova coluna `cod_ped_venda` na tabela — migration aplicada em produção
  - Backend: persiste na criação; auto-corrige sessões antigas sem o campo
  - Mobile: resolve `cod_ped_venda` da sessão retornada pela API (não mais do param de navegação)
- `BarcodeScannerModal`: campo de **teste manual de ISBN** no rodapé (para emulador sem câmera)
- `.env` unificado: sem distinção local/produção → todos apontam para `https://cronuzb2b.com.br/api`
- APK: `HorusB2B-v01.020.apk`

---

### v01.019 — 2026-06-22

**Versionamento & Documentação**
- Criado sistema de versionamento `constants/version.ts`
- Rodapé de versão no dashboard: `Horus B2B v01.008 · 2026-06-22`
- Criado este documento (`docs/mobile_modules_architecture.md`)

---

### v01.007 — 2026-06-22
**Timeout & Autenticação**
- JWT: `1h → 7 dias` (`backend/app/core/security.py`)
- Interceptor 401: aciona `signOut()` via `registerSessionExpiredCallback` em `api.ts`
- Logout automático registrado no `(tabs)/_layout.tsx`
- Timeout axios: `20s → 75s`
- Timeout Horus httpx: `25s → 60s` (connect=10s, read=60s)
- Debounce busca de produto: `500ms → 800ms`
- Loading visual: "Buscando no catálogo Horus... A API pode levar alguns segundos"

---

### v01.006 — 2026-06-22
**Mapeamento de campos Horus + Modal de erro**
- `pdv.service.ts`: mapeamento correto dos campos da API Horus
  - `base_price → price`, `promotional_price`, `stock_quantity → stock`, `ean_gtin → barcode`
  - IDs `"horus-XXXX"` tratados (sem `product_id` numérico, usa `ean_isbn`)
- `cart.tsx`: `ErrorDetailModal` — exibe erro completo ao invés de fechar o app
- `parseError()`: mensagens amigáveis por código HTTP

---

### v01.005 — 2026-06-22
**Alinhamento PDV com portal seller**
- Endpoint: `POST /mobile/pdv/orders` → `POST /orders` (unificado)
- Tipos de operação: `V` e `C` — sempre visíveis
- Campo "Meu Pedido" salvo como `customer_order_ref`
- `backend/app/schemas/order.py`: `PDVOrderCreate` + `customer_order_ref` + `notes`
- `backend/app/api/mobile_pdv.py`: `/pdv/customers` retorna `commercial_policy`, `consignment_status`, `discount`

---

### v01.004 — 2026-06-22
**ProductCard redesenhado**
- Preço de capa riscado + badge `-XX%` + estoque livre + saldo consignado

---

### v01.003 — 2026-06-21
**Tab bar com ícones vetoriais**
- Substituídos emojis por `Ionicons`, labels removidos

---

### v01.002 — 2026-06-21
**Correções de ambiente**
- Login em produção corrigido (ADB port forwarding)
- Ícone adaptativo Android regenerado via `expo prebuild --clean`
- API URL padrão: `https://cronuzb2b.com.br/api`

---

### v01.001 — 2026-06-19
**Estrutura inicial**
- Projeto criado com `create-expo-app` (TypeScript)
- Autenticação JWT + AuthGuard
- Dashboard com KPIs
- PDV: busca cliente + catálogo + carrinho
- Listagem de pedidos com status DE/PARA
- Tema dark mode

---

## 🚧 Em desenvolvimento

- [ ] **Rotina de Conferência** — inspeção de remessas/consignação (mesma lógica do portal, adaptada para mobile)

---

## 📝 Notas para novas implementações

1. **Sempre ler este arquivo** antes de criar uma nova tela/rotina
2. **Atualizar `constants/version.ts`** ao final de cada sessão de alterações
3. **Adicionar entrada no Changelog** com versão e data
4. **Backend:** nunca alterar `POST /orders` sem validar impacto no portal seller web
5. **Horus:** produtos B2B têm IDs string `"horus-XXXX"` — usar `ean_isbn`/`sku` no payload do pedido
6. **Consignação:** ambos os tipos (V/C) sempre visíveis, independente do `consignment_status` do cliente
7. **Sem campo de desconto** no carrinho — desconto vem da `commercial_policy` embutido no `promotional_price`
8. **Timeout Horus:** API pode levar até 20s — não reduzir abaixo de 60s no backend
