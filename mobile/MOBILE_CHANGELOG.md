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

## v1.1.2 — 2026-06-23
**versionCode: 4**

### 🐛 Correção Crítica: Mismatch de Código de Cliente (LEX Check)
- **Fix do Bypass do LEX**: Passagem do `conference_id` como parâmetro opcional na busca de pedido (`/orders/search`), assegurando que a conferência em andamento seja localizada no banco com precisão pelo ID físico, eliminando qualquer risco de falha na consulta por divergências de formatação/zeros à esquerda no código do cliente.
- **Busca Flexível**: Adicionada busca flexível com limpeza de zeros à esquerda (`ltrim`) no backend para garantir que buscas no modal "Novo" também localizem registros já existentes e evitem a validação `LEX`.
- APK: `HorusB2B-v01.025.apk`

## v1.1.1 — 2026-06-23
**versionCode: 3**

### ✅ Consulta de Conferências Finalizadas & Melhorias de Busca
- **Consulta de finalizadas**: Permitido abrir conferências com status `COMPLETED` na tela mobile para visualização de detalhes e volumes de forma read-only.
- **Bypass de validação LEX**: Ajustada a busca de pedido no backend (`horus_logistics.py`) para ignorar a validação de status `LEX` quando a conferência já estiver salva no banco.
- **Resiliência a erros**: Caso o Horus falhe ou não retorne mais o pedido da conferência consultada, o aplicativo mobile reconstrói a listagem de itens a partir dos volumes locais persistidos.
- **Filtro Padrão**: Definido o filtro padrão da lista de conferências no mobile para exibir inicialmente as conferências `"Em andamento"`.
- **Busca por Pedido e Cliente**: Refinado o input de busca para filtrar a lista estritamente por número do pedido e código do cliente.
- **Data de Abertura**: Exibida a data e hora de criação da conferência na visualização de detalhes do mobile.
- APK: `HorusB2B-v01.024.apk`

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
