# 📐 Cronuz B2B — Documentação Técnica de Arquitetura

> Documento de referência obrigatório antes de qualquer nova feature.  
> Versão: 2026-08-19 | Branch de referência: `main`

---

## Sumário

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Banco de Dados — Modelos e Tabelas](#2-banco-de-dados--modelos-e-tabelas)
3. [Backend — Routers e Endpoints](#3-backend--routers-e-endpoints)
4. [Integradores Externos](#4-integradores-externos)
5. [Frontend — Estrutura de Páginas](#5-frontend--estrutura-de-páginas)
6. [Frontend — Componentes Globais e Utilitários](#6-frontend--componentes-globais-e-utilitários)
7. [Sistema de Módulos por Empresa](#7-sistema-de-módulos-por-empresa)
8. [Autenticação e Autorização](#8-autenticação-e-autorização)
9. [Padrões e Convenções](#9-padrões-e-convenções)
10. [Mapa de Melhorias Prioritárias](#10-mapa-de-melhorias-prioritárias)

---

## 1. Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                       PRODUÇÃO (DigitalOcean)               │
│  IP: 64.23.182.183  |  /var/www/cronuz                      │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  NGINX       │   │  Next.js     │   │  FastAPI       │  │
│  │  (80/443)    │──▶│  PM2 :3000   │   │  Gunicorn:8000 │  │
│  │  SSL LetsEnc │   │  Frontend    │──▶│  Backend       │  │
│  └──────────────┘   └──────────────┘   └───────┬────────┘  │
│                                                 │           │
│                                    ┌────────────▼────────┐  │
│                                    │  PostgreSQL :5432   │  │
│                                    │  DB: cronuz_b2b     │  │
│                                    └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

LOCAL (Mac):
  Docker: cronuz_b2b_postgres :5432  |  cronuz_postgres :5433
          cronuz_redis :6379          |  cronuz_frontend :4000
          cronuz_backend :3333
  Backend local: uvicorn --reload :8000
  Frontend local: npm run dev :3000
```

### Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS, Shadcn/ui, Framer Motion |
| Backend | FastAPI (Python 3.9), SQLAlchemy, Pydantic v2, Gunicorn/Uvicorn |
| Banco de dados | PostgreSQL 15+ |
| Cache | Redis (local Docker) |
| Autenticação | JWT (Bearer Token) via Cookies + LocalStorage |
| Deploy | DigitalOcean Droplet, PM2 (frontend), systemd (backend), Nginx |

---

## 2. Banco de Dados — Modelos e Tabelas

### Prefixos de Tabela (Convenção)

| Prefixo | Domínio |
|---|---|
| `cmp_` | Company / Empresa |
| `usr_` | Usuário |
| `crm_` | CRM / Clientes |
| `ord_` | Pedidos |
| `prd_` | Produtos |
| `fin_` | Financeiro |
| `svc_` | Serviços (OS) |
| `sub_` | Assinaturas |
| `spl_` | Supplier (Bookinfo) |
| `dsp_` | Dropship (Erdos) |
| `b2b_` | Integradores do sistema |
| `leads` | Leads |

---

### 2.1 `cmp_company` — Empresa (Seller)

**Arquivo:** `backend/app/models/company.py`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | Integer PK | ID da empresa |
| `name` | String(255) | Nome fantasia |
| `document` | String(50) | CNPJ |
| `domain` | String(255) | Subdomínio B2B |
| `custom_domain` | String(255) | Domínio próprio |
| `tenant_id` | String(50) | ID do tenant (ex: "horus", "cronuz") |
| `logo` | String(500) | URL do logo |
| `active` | Boolean | Status da empresa |
| `module_b2b_native` | Boolean | Módulo B2B nativo |
| `module_horus_erp` | Boolean | ERP Horus integrado |
| `module_products` | Boolean | Catálogo de produtos |
| `module_orders` | Boolean | Pedidos |
| `module_customers` | Boolean | Clientes |
| `module_marketing` | Boolean | Marketing |
| `module_subscriptions` | Boolean | Assinaturas |
| `module_pdv` | Boolean | PDV |
| `module_agents` | Boolean | Agentes comerciais |
| `module_financial` | Boolean | Financeiro |
| `module_services` | Boolean | Serviços / OS |
| `module_commercial` | Boolean | Políticas comerciais |
| `module_crm` | Boolean | CRM 360° |
| `module_consignment` | Boolean | Consignação Horus |
| `module_proposals` | Boolean | Propostas |
| `module_logistica_horus` | Boolean | Logística Horus |
| `module_dropship` | Boolean | Dropshipping (Erdos) |
| `mobile_modules` | JSONB | Módulos do app mobile |

> [!IMPORTANT]
> Ao adicionar novo módulo: (1) coluna na tabela, (2) model company.py, (3) CompanyBase schema, (4) CompanyUpdate schema, (5) ModuleUpdate em main.py, (6) dashboard/metrics endpoint, (7) Sidebar.tsx, (8) companies/[id]/modules/page.tsx, (9) interface Company no layout.tsx

---

### 2.2 `cmp_settings` — Configurações da Empresa

**Arquivo:** `backend/app/models/company_settings.py`

| Coluna | Tipo | Descrição |
|---|---|---|
| `company_id` | FK → cmp_company | Empresa dona |
| `horus_url` | String | URL da API Horus |
| `horus_company` | String | Código empresa Horus |
| `horus_branch` | String | Código filial Horus |
| `horus_api_mode` | String | "B2B" ou "MASTER" |
| `bookinfo_api_key` | String | Chave API Bookinfo |
| `inter_cert_content` | Text | Certificado Banco Inter (base64) |
| `inter_key_content` | Text | Chave privada Inter (base64) |
| `nfse_enabled` | Boolean | NFS-e ativa |
| `nfse_environment` | String | PRODUCAO / HOMOLOGACAO |
| `smtp_*` | vários | Configurações de e-mail |

---

### 2.3 `usr_user` — Usuários

| Coluna | Tipo | Descrição |
|---|---|---|
| `type` | Enum | MASTER, SELLER, AGENT, CUSTOMER |
| `tenant_id` | String(50) | Restringe MASTER a um tenant |
| `company_id` | FK → cmp_company | Empresa do usuário (SELLER/AGENT) |
| `failed_login_attempts` | Integer | Proteção brute-force |
| `locked_until` | DateTime | Lock temporário |
| `is_2fa_enabled` | Boolean | 2FA habilitado |

---

### 2.4 `crm_customer` — Clientes

| Coluna | Tipo | Descrição |
|---|---|---|
| `company_id` | FK → cmp_company | Seller dono |
| `name` | String | Nome / Razão social |
| `document` | String | CPF / CNPJ |
| `type` | Enum | PF / PJ |
| `horus_client_code` | String | Código no ERP Horus |
| `groups` | M2M | Grupos de clientes |
| Relacionamentos | contacts, addresses, interactions, crm_tasks |

---

### 2.5 `ord_order` — Pedidos

| Coluna | Tipo | Descrição |
|---|---|---|
| `company_id` | FK → cmp_company | Seller |
| `customer_id` | FK → crm_customer | Cliente |
| `status` | Enum | NEW → PROCESSING → SENT_TO_HORUS → DISPATCH → INVOICED |
| `horus_order_id` | String | ID no ERP |
| `payment_term_id` | Integer | Condição de pagamento |
| Relacionamentos | items, interactions, logs, installments |

---

### 2.6 `svc_service` + `svc_service_order` — Serviços / OS

| Modelo | Tabela | Descrição |
|---|---|---|
| Service | `svc_service` | Catálogo de serviços (template) |
| ServiceOrder | `svc_service_order` | OS individual |

**ServiceOrder colunas-chave:**

| Coluna | Tipo | Descrição |
|---|---|---|
| `status` | Enum | PENDENTE, EM_EXECUCAO, CONCLUIDO, CANCELADO, FATURADO |
| `recurrence_day` | Integer | Dia do vencimento recorrente (1–28) |
| `execution_date` | Date | Data de execução |
| `negotiated_value` | Float | Valor acordado |
| `nfse_status` | String | Status da NFS-e |
| `financial_transaction_id` | FK → fin_transaction | Lançamento financeiro gerado |

---

### 2.7 `fin_transaction` + `fin_installment` — Financeiro

| Modelo | Tabela | Descrição |
|---|---|---|
| FinancialTransaction | `fin_transaction` | Lançamento (PAYABLE/RECEIVABLE) |
| FinancialInstallment | `fin_installment` | Parcela individual |

**Regras importantes:**
- Toda OS faturada gera uma `fin_transaction` + N `fin_installments`
- Um `fin_installment` pode ter boleto emitido pelo Banco Inter
- Status de installment: PENDING, PAID, OVERDUE, CANCELLED, CONCILIATED

---

### 2.8 `dsp_*` — Dropshipping (Erdos)

| Tabela | Descrição |
|---|---|
| `dsp_order` | Pedidos dropship sincronizados da Erdos |
| `dsp_price_table` | Tabela de preços importada via planilha |
| `dsp_stock_sync_log` | Logs de sincronização de estoque |
| `dsp_stock_sent_erdos` | Controle de estoque enviado à Erdos |

---

### 2.9 `spl_*` — Bookinfo / Compras

| Tabela | Descrição |
|---|---|
| `spl_supplier` | Fornecedor Bookinfo |
| `spl_purchase_transmission` | Cabeçalho de transmissão de pedido de compra |
| `spl_purchase_transmission_item` | Itens da transmissão |
| `spl_purchase_log` | Logs de compra |

---

### 2.10 Outros Modelos

| Tabela | Descrição |
|---|---|
| `sub_plan` | Planos de assinatura |
| `sub_subscriber` | Assinantes |
| `cmp_seller_branch` | Filiais do seller (Sefaz/Horus) |
| `prd_product` | Produtos do catálogo |
| `leads` | Leads capturados pelo sistema |
| `b2b_system_integrators` | Catálogo de integrações disponíveis |
| `cmp_company_note` | Notas internas por empresa |
| `usr_session_logs` | Auditoria de sessões |

---

## 3. Backend — Routers e Endpoints

### 3.1 Endpoints no `main.py` (sem router)

| Método | Path | Descrição |
|---|---|---|
| GET | `/` | Health check |
| POST | `/companies` | Criar empresa (MASTER) |
| GET | `/companies` | Listar empresas (MASTER) |
| POST | `/users` | Criar usuário |
| GET | `/users` | Listar usuários |
| PATCH | `/users/{id}/status` | Ativar/desativar usuário |
| PATCH | `/users/{id}/password` | Alterar senha |
| PATCH | `/users/{id}/email` | Alterar e-mail |
| DELETE | `/users/{id}` | Excluir usuário |
| GET | `/companies/{id}` | Detalhe da empresa |
| PUT | `/companies/{id}` | Atualizar empresa |
| PATCH | `/companies/{id}/status` | Ativar/desativar empresa |
| PATCH | `/companies/{id}/modules` | **Atualizar módulos** (usa `ModuleUpdate`) |
| GET | `/companies/{id}/users` | Usuários da empresa |
| GET | `/companies/{id}/agents` | Agentes da empresa |
| GET | `/companies/{id}/settings` | Config da empresa |
| PUT | `/companies/{id}/settings` | Salvar config |
| POST | `/companies/{id}/settings/test-horus` | Testar conexão Horus |

---

### 3.2 `auth.py` — Autenticação

| Método | Path | Descrição |
|---|---|---|
| POST | `/auth/login` | Login → retorna JWT |
| POST | `/auth/refresh` | Renovar token |
| POST | `/auth/logout` | Invalidar sessão |
| GET | `/auth/me` | Usuário logado |

---

### 3.3 `dashboard.py` — Métricas

| Método | Path | Descrição |
|---|---|---|
| GET | `/dashboard/metrics` | **Endpoint principal da Sidebar** — retorna módulos, métricas de pedidos, financeiro, serviços |
| GET | `/dashboard/crm-tasks` | Tarefas CRM do período |
| POST | `/dashboard/smtp-test` | Teste de envio SMTP |

> [!IMPORTANT]
> O endpoint `/dashboard/metrics` é o coração da Sidebar. **Sempre que um novo módulo for adicionado ao `cmp_company`, ele deve ser lido aqui e retornado no response** para que a Sidebar exiba o menu correto.

---

### 3.4 `orders.py` — Pedidos B2B

| Método | Path | Descrição |
|---|---|---|
| POST | `/orders` | Criar pedido |
| GET | `/orders` | Listar pedidos (filtros: status, data, cliente) |
| GET | `/orders/{id}` | Detalhe do pedido |
| DELETE | `/orders/{id}` | Cancelar pedido |
| POST | `/orders/{id}/interactions` | Adicionar interação |
| PUT | `/orders/{id}/interactions/{iid}/read` | Marcar como lido |
| POST | `/orders/{id}/sync-horus` | Sincronizar com Horus ERP |
| GET | `/orders/{id}/horus-debug-preview` | Preview do payload Horus |
| GET | `/metrics` | Métricas de pedidos |

---

### 3.5 `services.py` — Ordens de Serviço

| Método | Path | Descrição |
|---|---|---|
| POST/GET | `/services` | CRUD de serviços (catálogo) |
| POST | `/service-orders` | Criar OS |
| GET | `/service-orders` | Listar OS (filtros: status, execução, cliente) |
| PUT | `/service-orders/{id}` | Editar OS |
| DELETE | `/service-orders/{id}` | Excluir OS |
| PATCH | `/service-orders/{id}/status` | Alterar status |
| POST | `/service-orders/{id}/bill` | Faturar OS → gera fin_transaction |
| POST | `/service-orders/bulk/bill` | Faturar múltiplas OS |
| POST | `/service-orders/bulk/issue-nf` | Emitir NFS-e em lote |
| POST | `/service-orders/{id}/nfse/cancel` | Cancelar NFS-e |
| GET | `/service-orders/{id}/details` | Detalhes + transações financeiras |
| POST | `/service-orders/{id}/split` | Parcelar OS |
| PATCH | `/service-orders/bulk/recurrence-day` | Alterar dia de vencimento recorrente |
| PATCH | `/service-orders/bulk/execution-date` | Alterar data de execução em lote |
| GET | `/service-orders/{id}/pdf` | PDF da OS |

---

### 3.6 `financial.py` — Financeiro

| Método | Path | Descrição |
|---|---|---|
| GET | `/financial/installments` | Listar parcelas (filtros: tipo, status, data) |
| POST | `/financial/installments/{id}/pay` | Pagar parcela |
| GET | `/financial/summary` | Resumo financeiro |
| GET/POST | `/financial/categories` | Categorias financeiras |
| POST | `/financial/transactions` | Criar lançamento avulso |
| GET | `/financial/reports/dre` | DRE (Demonstrativo de Resultado) |
| GET | `/financial/cashflow` | Fluxo de caixa |
| GET/POST/PATCH | `/financial/accounts` | Contas bancárias |
| POST | `/financial/accounts/transfer` | Transferência entre contas |
| POST | `/financial/installments/{id}/issue-inter-slip` | Emitir boleto Banco Inter |

---

### 3.7 `dropship.py` — Dropshipping (Erdos)

| Método | Path | Descrição |
|---|---|---|
| GET/POST | `/dropship/config/{company_id}` | Configuração da integração Erdos |
| POST | `/dropship/config/{company_id}/test-connection` | Testar conexão |
| POST | `/dropship/orders/{company_id}/sync` | Sincronizar pedidos da Erdos |
| GET | `/dropship/orders/{company_id}` | Listar pedidos dropship |
| GET | `/dropship/orders/{company_id}/{order_id}` | Detalhe |
| POST | `/dropship/orders/{company_id}/{order_id}/send-to-horus` | Enviar ao ERP |
| POST | `/dropship/orders/{company_id}/{order_id}/confirm-dispatch` | Confirmar despacho |
| POST | `/dropship/stock/{company_id}/push` | Empurrar estoque à Erdos |
| GET | `/dropship/stock/{company_id}/logs` | Logs de estoque |
| GET/POST | `/dropship/price-table/{company_id}` | Tabela de preços |
| POST | `/dropship/price-table/{company_id}/upload` | Upload de planilha |

---

### 3.8 `horus.py` — Integração ERP Horus

| Método | Path | Descrição |
|---|---|---|
| GET | `/inventory/horus/status` | Status da conexão |
| GET | `/inventory/horus/products` | Produtos do ERP |
| GET | `/companies/{id}/horus/customers/{cnpj}/consignment/summary` | Resumo consignação |
| POST | `/companies/{id}/horus/customers/{cnpj}/consignment/submit` | Submeter consignação |

---

### 3.9 Outros Routers

| Router | Prefix | Descrição |
|---|---|---|
| `horus_logistics` | `/logistics` | Conferência de pedidos, filiais |
| `bookinfo_hub` | — | Pedidos/compras Bookinfo |
| `bookinfo_purchases` | — | Transmissão de compras |
| `subscriptions` | — | Planos, assinantes, hotsite, webhook EFI |
| `customers` | — | CRUD clientes, endereços, contatos, CRM |
| `products` | — | CRUD produtos, histórico |
| `proposals` | — | Propostas comerciais, conversão para pedido |
| `leads` | — | Captura e gestão de leads |
| `commercial_policies` | — | Políticas de preço e desconto |
| `financial/bank_slips` | — | Boletos (Banco Inter) |
| `upload` | — | Upload de imagens, certificados, notas |
| `mobile` | `/seller` | Módulos do App Mobile |
| `storefront` | — | Vitrine pública do seller |
| `customer_auth/portal` | — | Login e portal do cliente B2B |
| `sefaz_download` | — | Download de XMLs da Sefaz |
| `email_templates` | `/settings/email-templates` | Templates de e-mail |

---

## 4. Integradores Externos

### 4.1 Horus ERP — `integrators/horus.py`

**Classe base:** `HorusClient`  
**Subclasses:** `HorusOrders`, `HorusProducts`, `HorusClients`, `HorusLogisticsClient`

```python
# Instanciação padrão
client = HorusOrders(
    url=settings.horus_url,
    username=settings.horus_username,
    password=settings.horus_password,
    company=settings.horus_company,
    branch=settings.horus_branch,
    offset=settings.horus_offset,  # Multi-tenant: OFFSET/LIMIT por seller
    limit=settings.horus_limit,
)
```

> [!IMPORTANT]
> **SEMPRE** usar o `offset` e `limit` configurados por seller. Nunca consultar o Horus sem esses parâmetros — isso é crítico para isolamento multi-tenant.

**Principais métodos:**
- `HorusOrders.send_order(order)` — envia pedido ao ERP
- `HorusOrders.sta_transmitido_pedido_compra()` — status de transmissão
- `HorusProducts.get_products()` — busca produtos
- `HorusClients.get_client(cnpj)` — busca cliente
- `HorusLogisticsClient.get_orders()` — pedidos para conferência

---

### 4.2 Erdos (Dropship) — `integrators/erdos_client.py`

**Classe:** `ErdosClient`  
**Autenticação:** API Key configurada em `dsp_config`

**Principais métodos:**
- `get_orders()` — busca pedidos pendentes
- `get_stock()` — consulta estoque
- `push_stock(items)` — atualiza estoque na Erdos
- `confirm_dispatch(order_id)` — confirma despacho

---

### 4.3 Bookinfo — `app/api/bookinfo_hub.py` + `bookinfo_purchases.py`

**Autenticação:** `bookinfo_api_key` da empresa  
**Fluxo de compra:**

```
search_horus_orders() → seleciona pedidos → send_transmission() → sync_transmission()
```

- `send_transmission` → envia pedido de compra ao Bookinfo
- `sync_transmission` → consulta status e atualiza local

---

### 4.4 Banco Inter — `integrators/inter_client.py`

**Classe:** `BancoInterClient`  
**Autenticação:** mTLS (cert + key armazenados em `cmp_settings` como base64)

**Fluxo de boleto:**
1. Ler `inter_cert_content` e `inter_key_content` do banco
2. Criar arquivo temporário (`tempfile`)
3. Fazer requisição mTLS
4. **Destruir arquivo temporário** no `finally`

---

### 4.5 NFS-e — `integrators/nfse/`

**Classe:** `NFSeCrypto`  
**Certificado:** `.pfx` salvo em `certs/nfse/<company_id>/<arquivo>.pfx`  
**Ambiente:** PRODUCAO / HOMOLOGACAO configurado por empresa  
**Fluxo:** OS faturada → `issue-nf` → envia XML → retorna número da NF

---

### 4.6 EFI Pay (Assinaturas) — `integrators/efi_pay.py`

**Classe:** `EFIPayIntegration`  
**Uso:** Cobranças recorrentes de assinantes via webhook `/webhook/efi`

---

### 4.7 Sefaz — `integrators/sefaz_sp_service.py` + `sefaz_chave_service.py`

- Download de XMLs por CNPJ + NSU
- Consulta por chave de acesso
- Certificado digital por filial (`cmp_seller_branch.sefaz_cert_content`)

---

## 5. Frontend — Estrutura de Páginas

### 5.1 Área Administrativa / Dashboard `/(dashboard)`

#### 🏢 Empresas (MASTER)
| Rota | Descrição |
|---|---|
| `/companies` | Lista de empresas |
| `/companies/new` | Criar empresa |
| `/companies/[id]` | Visão geral |
| `/companies/[id]/profile` | Dados cadastrais |
| `/companies/[id]/modules` | **Toggles de módulos** |
| `/companies/[id]/users` | Usuários da empresa |
| `/companies/[id]/settings` | Configurações (Horus, Bookinfo, NFS-e) |
| `/companies/[id]/horus` | Configuração Horus |
| `/companies/[id]/bookinfo` | Bookinfo da empresa |
| `/companies/[id]/dropship` | Configuração Dropship |
| `/companies/[id]/integrations` | Integrações genéricas |
| `/companies/[id]/notes` | Notas internas |
| `/companies/[id]/contracts` | Contratos |
| `/companies/[id]/invoices` | Faturas |
| `/companies/[id]/proposals` | Propostas da empresa |

#### 📦 Pedidos
| Rota | Descrição |
|---|---|
| `/orders` | Lista de pedidos (filtros, ordenação por execução) |
| `/orders/new` | Novo pedido |
| `/orders/[id]` | Detalhe/edição do pedido |
| `/orders/dropship` | Pedidos Erdos (Dropship) |
| `/orders/dropship/[orderId]` | Detalhe do pedido dropship |
| `/orders/dropship/price-table` | Tabela de preços Erdos |
| `/orders/dropship/stock-logs` | Logs de estoque |

#### 🔧 Serviços / OS
| Rota | Descrição |
|---|---|
| `/services` | Catálogo de serviços |
| `/services/new` | Novo serviço |
| `/services/create` | Criar OS |
| `/services/orders` | Lista de OS (filtros, ordenação, atalhos de data) |
| `/services/orders/[id]` | Detalhe/edição da OS (faturamento, NFS-e) |

#### 💰 Financeiro
| Rota | Descrição |
|---|---|
| `/financial` | Lançamentos (parcelas) |
| `/financial/accounts` | Contas bancárias |
| `/financial/categories` | Categorias |
| `/financial/bank-slips` | Boletos Banco Inter |
| `/financial/reports` | DRE |
| `/financial/statement` | Extrato de conta |
| `/financial/reconciliation` | Conciliação bancária |
| `/financial/transactions/[id]` | Detalhe de transação |

#### 👤 Clientes
| Rota | Descrição |
|---|---|
| `/customers` | Lista de clientes |
| `/customers/new` | Novo cliente |
| `/customers/[id]` | Perfil (dados, contatos, endereços) |
| `/customers/[id]/crm` | CRM 360° do cliente |
| `/customers/[id]/consignment` | Consignação Horus |
| `/customers/groups` | Grupos de clientes |

#### 📄 Outros Módulos
| Rota | Módulo | Descrição |
|---|---|---|
| `/proposals` | Propostas | Lista e criação |
| `/subscriptions` | Assinaturas | Planos |
| `/subscribers` | Assinaturas | Gestão de assinantes |
| `/marketing` | Marketing | Dashboard |
| `/marketing/showcases` | Marketing | Vitrines |
| `/marketing/navigation` | Marketing | Navegação |
| `/commercial-policies` | Comercial | Políticas de preço |
| `/logistics/conference` | Logística | Conferência Horus |
| `/logistics/branches` | Logística | Filiais |
| `/leads` | Leads | Captura de leads (MASTER) |
| `/agents` | Agentes | Gestão de agentes |
| `/pdv` | PDV | Ponto de Venda |
| `/settings` | Config | Configurações do seller |
| `/settings/modules` | Config | Módulos do seller (self-service) |
| `/settings/bookinfo` | Config | Bookinfo do seller |

---

### 5.2 Área Pública / Storefront

| Rota | Descrição |
|---|---|
| `/h/[slug]` | Vitrine pública do seller |
| `/h/[slug]/checkout` | Checkout |
| `/h/[slug]/login` | Login do cliente |
| `/h/[slug]/portal` | Portal do cliente |
| `/store/*` | Storefront interno (seller logado) |
| `/public/proposals/[id]` | Proposta pública para aceite |
| `/domain/[hostname]/*` | Rotas por domínio customizado |

---

## 6. Frontend — Componentes Globais e Utilitários

### 6.1 Componentes (`/src/components/`)

| Componente | Descrição |
|---|---|
| `Sidebar.tsx` | **Navegação principal** — lê módulos de `/dashboard/metrics`, monta menus condicionais por tipo de usuário (MASTER, SELLER, AGENT) e por módulo ativo |
| `Header.tsx` | Cabeçalho — notificações, tema, avatar |
| `FetchInterceptor.tsx` | Intercepta respostas 401 e força logout automático |
| `CurrencyInput.tsx` | Input monetário com máscara (R$ format) |
| `CustomerAutocomplete.tsx` | Campo de busca de clientes com debounce |
| `HorusConsignmentManager.tsx` | Componente completo de gestão de consignação |
| `HotsiteBuilder.tsx` | Builder visual do hotsite de assinaturas |
| `ThemeProvider.tsx` | Provider de tema claro/escuro |
| `ThemeToggle.tsx` | Botão de alternância de tema |

---

### 6.2 Utilitários (`/src/lib/`)

#### `auth.ts` — Gestão de Autenticação

```typescript
// FUNÇÕES EXPORTADAS — usar sempre estas, nunca acesso direto a cookies/localStorage
setToken(token, user)   // Salva JWT + user com chave por hostname (isolamento multi-tenant)
getToken()              // Recupera token (cookie por hostname → fallback localStorage)
getUser()               // Recupera usuário logado
removeToken()           // Logout — limpa todos os domínios possíveis
```

> [!IMPORTANT]
> A chave do cookie é gerada por hostname (`cronuz_b2b_token_app.cronuzb2b.com.br`). Isso permite que sellers em domínios diferentes não interfiram entre si. **NUNCA** acesse `localStorage` diretamente — use sempre `getToken()` e `getUser()`.

#### `utils.ts`

```typescript
cn(...inputs: ClassValue[])  // Merge de classes Tailwind com clsx + tailwind-merge
```

#### `image_helper.ts`

Funções auxiliares para URLs de imagem.

#### `lc116.ts`

Tabela de códigos LC 116/2003 para NFS-e.

---

## 7. Sistema de Módulos por Empresa

### Fluxo completo de um módulo

```
MASTER ativa toggle na UI
       ↓
PATCH /companies/{id}/modules  (ModuleUpdate no main.py)
       ↓
cmp_company.module_X = true   (banco de dados)
       ↓
SELLER faz login / navega
       ↓
Sidebar chama GET /dashboard/metrics
       ↓
Response inclui module_X: true
       ↓
Sidebar renderiza menu condicional
       ↓
Página verifica module_X para renderizar conteúdo
```

### Módulos e seus menus correspondentes

| Campo em cmp_company | Menu na Sidebar | Rota |
|---|---|---|
| `module_products` | Produtos | `/products` |
| `module_orders` | Pedidos | `/orders` |
| `module_customers` | Clientes/Empresas | `/customers` |
| `module_marketing` | Marketing | `/marketing` |
| `module_subscriptions` | Assinaturas | `/subscriptions` |
| `module_pdv` | PDV | `/pdv` |
| `module_agents` | Agentes | `/agents` |
| `module_financial` | Financeiro | `/financial` |
| `module_services` | OS (Serviços) | `/services` |
| `module_commercial` | Políticas e Preços | `/commercial-policies` |
| `module_crm` | CRM (via customers) | `/customers/[id]/crm` |
| `module_consignment` | Consignação (via customers) | `/customers/[id]/consignment` |
| `module_proposals` | Propostas | `/proposals` |
| `module_logistica_horus` | Logística Horus | `/logistics` |
| `module_dropship` | Dropship | `/orders/dropship` |

### Regras de exclusão mútua

- `module_horus_erp = true` → `module_b2b_native = false` + `module_products = false`
- `module_b2b_native = true` → `module_horus_erp = false` + `module_products = true`

---

## 8. Autenticação e Autorização

### Tipos de usuário

| Tipo | Acesso | Restrição |
|---|---|---|
| `MASTER` | Todas as empresas | Pode ter `tenant_id` para restringir a uma marca |
| `SELLER` | Apenas sua `company_id` | Acesso ao sistema B2B |
| `AGENT` | Apenas sua `company_id` | Acesso limitado (propostas, pedidos) |
| `CUSTOMER` | Portal do cliente | Acesso ao storefront e seus pedidos |

### Dependências FastAPI

```python
# Backend — sempre usar estas dependências
get_current_user         # JWT obrigatório — retorna User ou 401
get_current_user_optional  # JWT opcional — retorna User ou None
```

### Proteção de endpoints

- Endpoints de MASTER verificam: `current_user.type == UserRole.MASTER`
- Endpoints de Seller verificam: `current_user.company_id == company_id`
- Endpoints públicos (storefront, proposta pública) não usam autenticação

---

## 9. Padrões e Convenções

### 9.1 Backend

#### Padrão de endpoint com autenticação e DB
```python
@router.get("/endpoint")
def minha_rota(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    company_id = current_user.company_id
    # query sempre filtrando por company_id
    items = db.query(Model).filter(Model.company_id == company_id).all()
    return items
```

#### Padrão de query com paginação
```python
items = db.query(Model)\
    .filter(Model.company_id == company_id)\
    .order_by(Model.created_at.desc())\
    .offset(skip).limit(limit).all()
```

#### Tratamento de erro padrão
```python
item = db.query(Model).filter(Model.id == id).first()
if not item:
    raise HTTPException(status_code=404, detail="Não encontrado")
```

#### Query de transações vinculadas a OS (boundary regex)
```python
# CORRETO — evita match de OS #138 em OS #1380
db.query(FinancialTransaction)\
  .filter(FinancialTransaction.description.op('~')(r'OS #' + str(order_id) + r'(\D|$)'))
```

### 9.2 Frontend

#### Padrão de fetch autenticado
```typescript
const token = getToken();
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/endpoint`, {
  headers: { Authorization: `Bearer ${token}` }
});
if (!res.ok) throw new Error('Falha');
const data = await res.json();
```

#### Padrão de toast de feedback
```typescript
toast.success('Salvo com sucesso!');
toast.error(`Erro: ${body?.detail || 'Falha inesperada'}`);
```

#### Variável de ambiente de API
```typescript
// SEMPRE usar esta forma — nunca hardcode de URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
```

---

## 10. Mapa de Melhorias Prioritárias

### 🔴 Crítico — Confiabilidade

| # | Problema | Localização | Solução Proposta |
|---|---|---|---|
| 1 | `main.py` com 665 linhas e endpoints misturados com routers | `backend/main.py` | Mover `/companies`, `/users` para `api/companies.py` e `api/users.py` com routers próprios |
| 2 | Schemas de módulos definidos em 3 lugares sem sync | `main.py (ModuleUpdate)`, `schemas/company.py`, `companies/[id]/layout.tsx` | Criar `ModuleFields` como base única — DRY |
| 3 | Horus `offset/limit` não validado em todos os integradores | `integrators/horus_*.py` | Garantir que `offset` e `limit` são sempre passados e validados antes de chamar a API |
| 4 | Nenhum retry automático em chamadas Horus/Erdos | `integrators/` | Implementar `tenacity` com retry exponencial para HTTP 5xx e timeout |
| 5 | Certificados NFS-e sem verificação de expiração antes de emitir | `services.py` | Checar validade do `.pfx` antes de cada emissão e alertar antecipadamente |

### 🟡 Importante — Qualidade

| # | Problema | Localização | Solução Proposta |
|---|---|---|---|
| 6 | Muitas páginas Next.js com >500 linhas (serviços, financial, pedidos) | `services/orders/[id]/page.tsx`, `financial/page.tsx` | Extrair seções em componentes filhos |
| 7 | `fetch` sem `AbortController` — requisições zumbis em troca de página | Todo o frontend | Adicionar `useEffect` cleanup com `AbortController` |
| 8 | Ausência de `React.Suspense` / `ErrorBoundary` | App router geral | Adicionar `loading.tsx` e `error.tsx` em cada módulo |
| 9 | Tokens de empresas em múltiplos domínios não são invalidados no logout | `auth.ts` | Implementar blacklist de JTI no Redis com TTL = expiração do token |
| 10 | Queries sem índice explícito em colunas de busca frequente | Models: `ord_order.status`, `svc_service_order.execution_date` | Adicionar `index=True` nas colunas mais usadas em filtros |

### 🟢 Melhoria — Performance

| # | Problema | Localização | Solução Proposta |
|---|---|---|---|
| 11 | `/dashboard/metrics` faz múltiplas queries não otimizadas | `dashboard.py` | Usar `func.count` e `func.sum` em queries agregadas únicas |
| 12 | Sidebar refetch a cada navegação (não usa cache) | `Sidebar.tsx` | Usar `useSWR` ou React Context para cachear as métricas por 60s |
| 13 | Upload de imagens sem compressão | `upload.py` | Comprimir com `Pillow` antes de salvar |
| 14 | Listagens sem paginação real em alguns módulos | `customers.py`, `financial.py` | Padronizar `skip/limit` + retornar `{items, total}` em todos |
| 15 | `mobile_modules` como JSONB sem validação de schema | `company.py` | Adicionar Pydantic validator para garantir estrutura do JSON |

### ⚪ Técnico — Manutenibilidade

| # | Problema | Localização | Solução Proposta |
|---|---|---|---|
| 16 | Tipo `Company` duplicado em 3 layouts diferentes | `companies/[id]/layout.tsx`, `settings/layout.tsx`, etc | Criar `types/company.ts` compartilhado |
| 17 | Ausência de migrations formais (Alembic) | Backend todo | Implementar Alembic para versionamento de schema |
| 18 | Logs de erro sem estrutura (apenas `print` e `except: pass`) | `app/api/*.py` | Implementar `logging` estruturado com `structlog` |
| 19 | Variável `NEXT_PUBLIC_API_URL` duplicada em cada arquivo | Frontend todo | Centralizar em `lib/api.ts` com função `apiFetch(path, options)` |
| 20 | Ausência de testes automatizados | Projeto todo | Iniciar com testes de integração nos endpoints críticos (auth, orders, services) |

---

## Checklist para Nova Feature

Antes de iniciar qualquer nova funcionalidade, verificar:

- [ ] Criar branch `feature/nome-da-feature` a partir da `main` atualizada
- [ ] O modelo de banco já existe ou precisa de nova coluna/tabela?
- [ ] Se nova coluna: criar SQL em `deploy/` + aplicar localmente
- [ ] O endpoint já existe ou precisa ser criado?
- [ ] O endpoint filtra por `company_id` corretamente?
- [ ] O schema Pydantic (request + response) está atualizado?
- [ ] Se novo módulo: seguir checklist da seção 7
- [ ] A página frontend consome o endpoint correto?
- [ ] Existe loading state e tratamento de erro no fetch?
- [ ] Testar localmente (backend HTTP 200, frontend HTTP 200/307)
- [ ] Commit na feature branch
- [ ] Aprovação para merge em `main` e deploy

---

*Documento mantido em: `/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/.agents/ARCHITECTURE.md`*
