# 📱 Mobile App — Arquitetura e Guia de Desenvolvimento

> **Leia este documento antes de implementar qualquer nova feature no app mobile.**
> Atualizado em: Junho/2026

---

## 1. Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Framework | Expo (React Native) SDK 53 |
| Linguagem | TypeScript 5.x |
| Navegação | Expo Router v4 (file-based) |
| Estado Global | Zustand 5.x |
| HTTP Client | Axios 1.x |
| Storage Seguro | expo-secure-store |
| Ícones | @expo/vector-icons (Ionicons) |
| Build Android | Gradle + Hermes JIT |

---

## 2. Branding Dinâmico (Multi-tenant)

| Tenant | App Name | Cor | Logo |
|---|---|---|---|
| **Horus** | Horus B2B | `#a4a1ff` | `assets/brands/horus/logo.png` |
| **Cronuz** | Cronuz B2B | `#0F172A` | `assets/brands/cronuz/logo.png` |

O backend retorna `tenant_id` no login → hook `useBrand()` carrega branding dinâmico.

### Build de produção (URL real):
```bash
# 1. Desativar .env.local (OBRIGATÓRIO)
mv mobile/.env.local mobile/.env.local.bak

# 2. Build limpo forçado
rm -rf mobile/android/app/build/
EXPO_PUBLIC_API_URL="https://cronuzb2b.com.br/api" \
./android/gradlew -p android assembleRelease --rerun-tasks

# 3. Restaurar .env.local
mv mobile/.env.local.bak mobile/.env.local

# APK em: mobile/android/app/build/outputs/apk/release/app-release.apk
```

---

## 3. Estrutura de Pastas

```
mobile/
├── app/
│   ├── _layout.tsx               # Root layout (AuthGuard)
│   ├── (auth)/login.tsx          # Tela de login
│   └── (tabs)/
│       ├── _layout.tsx           # TabBar (ícones emoji 28px)
│       ├── index.tsx             # Dashboard (KPIs)
│       ├── pdv/
│       │   ├── index.tsx         # PDV — busca produto/cliente
│       │   └── cart.tsx          # Carrinho + checkout
│       ├── orders/
│       │   ├── index.tsx         # Lista de pedidos
│       │   └── [id].tsx          # Detalhe do pedido
│       └── conferencia/
│           ├── index.tsx         # Lista de pedidos para conferir
│           └── [id].tsx          # Detalhe da conferência (scan)
├── services/
│   ├── api.ts                    # Axios + interceptors
│   ├── auth.service.ts           # Login /token (form-data)
│   ├── dashboard.service.ts      # GET /mobile/dashboard
│   ├── orders.service.ts         # GET /mobile/orders
│   └── pdv.service.ts            # PDV endpoints + createPDVOrder
├── store/
│   ├── auth.store.ts             # user, token, modules
│   └── pdv.store.ts              # carrinho PDV (Zustand)
├── components/
│   ├── ModuleGuard.tsx           # Protege tela por módulo
│   └── ui/Button Card Input Badge
├── constants/theme.ts            # Cores, tipografia, espaços
└── utils/formatters.ts           # formatCurrency, formatOrderStatus (DE/PARA)
```

---

## 4. Autenticação

**Endpoint:** `POST /token` (OAuth2 form-data)

```
username=seller@empresa.com&password=senha
```

**Resposta:** `access_token` + `user` (name, email, company_id, tenant_id) + `mobile_modules`

Dados salvos em `expo-secure-store`. Axios injeta `Bearer {token}` automaticamente.

---

## 5. Módulos Mobile

Controlados pelo MASTER via `/companies/{id}/modules` → coluna `mobile_modules JSONB` na `cmp_company`.

| Módulo | Chave | Rota |
|---|---|---|
| App Mobile | `app_enabled` | Login habilitado |
| PDV | `pdv` | Tab PDV |
| Resultado de Vendas | `vendas` | Dashboard |
| Consulta de Pedidos | `pedidos` | Tab Pedidos |
| Catálogo | `catalogo` | Busca PDV |
| Clientes | `clientes` | Busca PDV |
| Conferência | `conferencia` | Tab Conferência |

---

## 6. Endpoints da API Mobile

Base: `https://cronuzb2b.com.br/api` | Auth: `Bearer {token}`

| Método | Rota | Descrição |
|---|---|---|
| POST | `/token` | Login |
| GET | `/mobile/dashboard` | KPIs do seller |
| GET | `/mobile/pdv/customers?q=` | Busca clientes |
| GET | `/mobile/pdv/products?q=` | Busca produtos |
| GET | `/mobile/pdv/payment-terms` | Condições de pagamento |
| **POST** | `/mobile/pdv/orders` | **Criar pedido (PDV)** |
| GET | `/mobile/orders` | Lista pedidos |
| GET | `/mobile/orders/{id}` | Detalhe do pedido |
| GET | `/mobile/conference/orders` | Pedidos para conferência |
| POST | `/mobile/conference/orders/{id}/scan` | Registrar bipe |
| POST | `/mobile/conference/orders/{id}/close` | Fechar conferência |

---

## 7. Fluxo PDV

```
pdv/index.tsx
  → Busca cliente (/mobile/pdv/customers)
  → Busca produto (/mobile/pdv/products)
  → Adiciona ao carrinho (Zustand)
  → Navega para pdv/cart.tsx

pdv/cart.tsx
  → Exibe itens + quantidades
  → Seleciona condição de pagamento
  → Meu Pedido (opcional) = external_order_number
  → Tipo de Venda = V/B/A/T
  → SEM campo de desconto (política comercial já nos preços)
  → POST /mobile/pdv/orders
  → Sucesso → clearCart → redireciona
```

### Payload criação de pedido:
```json
{
  "customer_id": 123,
  "payment_condition": "Boleto 30d",
  "payment_term_id": 5,
  "total_amount": 59.94,
  "external_order_number": "PED-001",
  "order_type": "V",
  "notes": "obs opcional",
  "source": "pdv_mobile",
  "items": [
    { "product_id": 456, "name": "...", "quantity": 2, "unit_price": 29.97 }
  ]
}
```

**Regras críticas:**
- ⛔ Sem desconto manual — política comercial já aplicada
- Horus ERP: se `module_horus_erp=true`, pedido é enviado automaticamente ao Horus
- `type_order`: V=Venda | B=Bonificação | A=Amostra | T=Troca

---

## 8. Status de Pedidos — DE/PARA

| Status Interno | Exibido | Cor |
|---|---|---|
| `PENDING` | Pendente | Laranja |
| `APPROVED` | Aprovado | Verde |
| `PROCESSING` | Em Processamento | Azul |
| `SENT_TO_HORUS` | Enviado ao ERP | Roxo |
| `INVOICED` | Faturado | Verde escuro |
| `SHIPPED` | Enviado | Verde |
| `CANCELLED` | Cancelado | Vermelho |
| `PROCESSADO` | Processado | Azul |
| `RECEBIDO` | Recebido | Cinza |

Mapeamento em: `mobile/utils/formatters.ts → formatOrderStatus()`

---

## 9. Fluxo Conferência de Expedição

```
conferencia/index.tsx
  → Lista pedidos aprovados (GET /mobile/orders?status=approved)
  → Busca por cliente/pedido

conferencia/[id].tsx
  → Carrega itens do pedido
  → Scanner de código de barras (câmera)
  → Bipe por item → registra quantidade conferida
  → Progresso: X de Y itens
  → Finaliza conferência
```

---

## 10. Regras de Deploy

### Backend (produção):
```bash
# Upload arquivo modificado
rsync -avz backend/app/api/arquivo.py root@cronuzb2b.com.br:/var/www/cronuz/backend/app/api/

# Restart
ssh root@cronuzb2b.com.br "systemctl restart cronuz-backend"
```

### Frontend Next.js:
```bash
ssh root@cronuzb2b.com.br "cd /var/www/cronuz/frontend && npm run build && pm2 reload cronuz-frontend"
```

### Migrations PostgreSQL:
> ⚠️ NUNCA executar UPDATE/DELETE sem autorização.
> ADD COLUMN é seguro com IF NOT EXISTS.

```sql
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS nova_coluna JSONB DEFAULT NULL;
```

Sempre criar documento `DEPLOY_*.md` detalhando a migration.

---

## 11. Lições Aprendidas

| Problema | Causa | Solução |
|---|---|---|
| APK com URL errada | `.env.local` sobrepõe `.env.production` | Renomear antes do build |
| Gradle cache | Não rastreia env vars | `--rerun-tasks` + deletar `app/build/` |
| Crash no pedido | Endpoint `/orders` sem auth mobile | Usar `/mobile/pdv/orders` |
| SENT_TO_HORUS visível | `formatOrderStatus` incompleto | Adicionado DE/PARA completo |
| Ícone pequeno na tab | fontSize: 22 | Aumentado para 28 |
| `mobile_modules` 500 | Coluna inexistente em prod | Migration com ADD COLUMN |

---

## 12. Roadmap

- [x] Auth seller + módulos
- [x] Dashboard KPIs
- [x] PDV — produto/cliente/carrinho/checkout
- [x] Lista e detalhe de pedidos
- [x] Conferência de expedição (estrutura base)
- [ ] Scanner de código de barras (câmera nativa)
- [ ] Impressão Bluetooth (Stone/PagSeguro)
- [ ] Notificações push
- [ ] Modo offline
- [ ] iOS (CocoaPods)
