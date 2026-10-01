# Cronuz B2B — Arquitetura, Segurança e Performance

> Documento de referência técnica para desenvolvedores e agentes.  
> Atualizado em: 2026-09-01

---

## 📁 Estrutura do Projeto

```
cronuz-b2b/
├── backend/                    # FastAPI + SQLAlchemy + PostgreSQL
│   ├── main.py                 # Ponto de entrada — routers + middlewares + seed
│   ├── requirements.txt        # Dependências Python (sem pymssql/PyMySQL)
│   ├── .env                    # Variáveis de ambiente (nunca commitado)
│   └── app/
│       ├── api/                # Routers FastAPI por domínio (40 arquivos)
│       ├── core/               # Segurança, dependências, utils, scheduler
│       │   ├── security.py     # Hash de senha (bcrypt)
│       │   ├── dependencies.py # get_current_user (JWT)
│       │   ├── utils.py        # Utilitários compartilhados (parse_host_port etc)
│       │   ├── scheduler.py    # APScheduler (background jobs)
│       │   └── horus_sql_crypto.py  # Criptografia Fernet para credenciais SQL
│       ├── db/
│       │   └── session.py      # Engine SQLAlchemy com pool configurado
│       ├── integrators/        # Clientes de APIs externas e SQL Server
│       ├── models/             # Modelos SQLAlchemy (38 tabelas)
│       └── schemas/            # Schemas Pydantic (validação de request/response)
├── frontend/                   # Next.js 14 + TypeScript + Tailwind
│   └── src/
│       ├── app/(dashboard)/    # Rotas autenticadas (Master e Seller)
│       └── components/         # Componentes reutilizáveis (Sidebar, etc)
├── deploy/                     # Scripts e roteiros de deploy (SQL, instruções)
├── deploy/processed/           # Deploys finalizados e executados
├── tests/                      # Scripts de teste e validação
├── uploads/                    # Arquivos dinâmicos (imagens, boletos, NFs) — .gitignore
├── certs/                      # Certificados NFS-e por cliente — .gitignore
└── ARCHITECTURE.md             # Este arquivo
```

---

## 🔒 SEGURANÇA — Regras obrigatórias

### 1. Credenciais — nunca no código-fonte

| Item | Regra |
|------|-------|
| `SECRET_KEY` | Obrigatório no `.env` — **nunca** hardcoded em `security.py` |
| `DATABASE_URL` | Obrigatório no `.env` — **sem fallback hardcoded** em `session.py` |
| `MASTER_SEED_PASSWORD` | `.env` em produção — sem hardcoded no `main.py` |
| `HORUS_SQL_ENCRYPTION_KEY` | Fernet key no `.env` — **nunca** no repositório |
| Senhas de terceiros (`vindi_api_key`, `smtp_password`, etc.) | Banco de dados — criptografia Fernet |
| Certificados NFS-e `.pfx` | Disco em `certs/nfse/<company_id>/` — **fora do git** |
| Certificados MTLS (Banco Inter) | Banco de dados — arquivo temporário descartado após uso |

### 2. Autorização por ownership (Multi-tenancy IDOR Prevention)

Todo endpoint que recebe `company_id` na rota DEVE obrigatoriamente validar que o usuário pertence àquela empresa ou possui privilégio MASTER. Use SEMPRE o utilitário centralizado:

```python
from app.core.utils import assert_company_ownership

@router.get("/companies/{company_id}/modulo/endpoint")
def meu_endpoint(company_id: int, current_user = Depends(get_current_user)):
    assert_company_ownership(current_user, company_id)  # [SEC] Primeira linha do handler
```

> **Atenção especial a Foreign Keys e Clientes:** Ao criar ou alterar registros vinculados a uma empresa (ex: Pedidos, Ordens de Serviço, Parcelas, Clientes), garanta que os IDs passados no payload pertençam estritamente à mesma empresa do usuário autenticado:
```python
customer = db.query(Customer).filter(
    Customer.id == payload.customer_id,
    Customer.company_id == current_user.company_id
).first()
```

### 3. Validação e Limite Mandatório de Uploads (Proteção contra DoS / OOM)

Todo upload de arquivos DEVE obrigatoriamente utilizar o módulo [app/core/upload_security.py](file:///Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend/app/core/upload_security.py):

| Categoria | Tipos Permitidos | Limite Máximo |
|-----------|------------------|---------------|
| **Imagens / Capas** (`category="image"`) | `.jpg, .jpeg, .png, .webp` | **5 MB** |
| **Planilhas** (`category="sheet"`) | `.xlsx, .csv, .ods` | **10 MB** (streaming chunked) |
| **Documentos / Fiscais** (`category="doc"`) | `.pdf, .xml, .txt` | **10 MB** |
| **Certificados** (`category="cert"`) | `.pfx, .p12, .crt, .key, .pem` | **10 MB** |
| **Teto Absoluto do Sistema** | Qualquer arquivo | **15 MB** (bloqueio imediato) |

**Padrão de Implementação em Novos Endpoints:**
```python
from app.core.upload_security import validate_file_size_and_extension, sanitize_filename, read_file_safely

@router.post("/meu-upload")
async def meu_upload(file: UploadFile = File(...)):
    # 1. Valida tamanho de cabeçalho e extensão
    validate_file_size_and_extension(file, category="sheet")

    # 2. Sanitiza nome do arquivo contra Path Traversal (ex: ../../../malicious.php)
    clean_name = sanitize_filename(file.filename)

    # 3. Lê com segurança em chunks (aborta streaming se exceder limite em trânsito)
    content = await read_file_safely(file, max_size_bytes=10 * 1024 * 1024)
```

### 4. Proteção contra Ataques de Força Bruta (Brute-Force & Lockout)

- Rotinas de autenticação (`/token`, `/customer/login`, etc.) contam tentativas consecutivas em `user.failed_login_attempts`.
- Ao atingir 5 tentativas inválidas, a conta é suspensa temporariamente por 15 minutos em `user.locked_until`, retornando `HTTP 429 Too Many Requests`.
- Logins bem-sucedidos resetam o contador e limpam `user.locked_until`.

### 5. Respostas de erro — sem information disclosure

- Respostas 500 NUNCA devem devolver tracebacks, strings de exceção (`str(exc)`), erros de SQL ou detalhes de tabelas para clientes externos.
- O traceback completo é exclusivo dos logs internos do servidor (`_main_logger.error`).
- Resposta para o cliente: `{"detail": "Ocorreu um erro interno no servidor. Por favor, tente novamente mais tarde."}`.

### 6. Headers de Segurança HTTP

Todo response da API inclui cabeçalhos de proteção contra ataques clássicos de web:
- `X-Content-Type-Options: nosniff` (impede MIME-sniffing malicioso)
- `X-Frame-Options: SAMEORIGIN` (proteção contra Clickjacking)
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

### 7. SQL Injection & Horus Consultas

- **pytds**: SEMPRE usar tuplas de parâmetros separados (`cur.execute("SELECT ... WHERE COD = %s", (param,))`). NUNCA interpolar variáveis de usuário em strings SQL.
- **Regra OFFSET/LIMIT**: Toda consulta no Horus ERP DEVE checar a flag `horus_legacy_pagination` do `cmp_settings`. Se `True`, omitir `OFFSET/LIMIT`. Se `False`, utilizar paginação segura com limites máximos definidos.

### 8. Arquivos sensíveis — .gitignore obrigatório

```gitignore
.env
certs/
*.pfx *.p12 *.pem *.key *.crt
uploads/
```

---

## 📋 CHECKLIST MANDATÓRIO PARA NOVOS MÓDULOS E FEATURES

Antes de finalizar qualquer nova rota, módulo ou endpoint no backend, execute este checklist:

1. [ ] **Multi-tenancy**: Se o endpoint recebe `company_id`, executou `assert_company_ownership(current_user, company_id)`?
2. [ ] **Payload Validation**: Se o endpoint cria/atualiza vínculos (ex: `customer_id`, `order_id`), validou que o registro pertence à empresa autenticada?
3. [ ] **Upload Seguro**: Se recebe arquivos, invocou `validate_file_size_and_extension` e `read_file_safely` respeitando os tetos (5MB/10MB/15MB)?
4. [ ] **Path Traversal**: Se grava arquivo em disco, sanitizou o nome com `sanitize_filename` e salvou na subpasta isolada `uploads/<company_id>/...`?
5. [ ] **Foreign Keys**: Se criou novos relacionamentos no SQLAlchemy com referências múltiplas, especificou `foreign_keys=[...]` para evitar ambiguidade?
6. [ ] **PostgreSQL Exclusivo**: O código utiliza 100% PostgreSQL? Não há referências a SQLite?
7. [ ] **Deploy Script**: Se houve alteração de DDL no banco (novas tabelas/colunas/índices), criou o script SQL correspondente na pasta `deploy/` usando `IF NOT EXISTS` (zero perda de dados)?
8. [ ] **Indexação de Foreign Keys e Filtros**: Toda chave estrangeira (`company_id`, relacionamentos frequentes) e campos de status/data em queries foram indexados (`index=True` ou composite `Index`)?
9. [ ] **Prevenção de N+1**: Em queries que iteram listas e consultam entidades relacionadas, foi usado `joinedload`/`selectinload` ou cache em memória para evitar requisições N+1 ao banco?
10. [ ] **Healthcheck**: A API sobe e responde `HTTP 200` em teste de saúde local?


---

## ⚡ PERFORMANCE — Configurações e padrões

### 1. Pool de conexões PostgreSQL

```python
# app/db/session.py
engine = create_engine(
    DATABASE_URL,
    pool_size=20,          # conexões mantidas no pool
    max_overflow=10,       # extras em pico de carga
    pool_pre_ping=True,    # detecta conexões mortas antes de usar
    pool_recycle=1800,     # recicla a cada 30min (evita timeout idle)
    echo=False,            # SQL logging só em debug
)
```

### 2. Pool SQL Server (Horus) — pytds

- Pool em memória por `company_id` com TTL de 10 minutos
- **Thread-safe via `threading.Lock()`**
- **Atenção:** pool é por processo — com múltiplos workers Uvicorn, cada processo tem pool separado
- Recomendação para produção: `--workers 1` no serviço que usa Horus SQL
- Cleanup automático a cada 15min via APScheduler

### 3. Chamadas pytds em endpoints async — run_in_executor

pytds é síncrono. Chamadas diretas em handlers `async def` bloqueiam o event loop.
**Sempre usar `run_in_executor`:**

```python
import asyncio

async def get_horus_releases(company_id: int, ...):
    loop = asyncio.get_event_loop()
    # client.query() é síncrono — executar em thread pool
    rows = await loop.run_in_executor(None, client.query, sql, params)
    return rows
```

### 4. Cursor pytds — sempre fechar com context manager

```python
# CORRETO
with conn.cursor() as cur:
    cur.execute(sql, params)
    rows = cur.fetchmany(max_rows)  # limite máximo de linhas

# ERRADO — cursor nunca fechado
cur = conn.cursor()
cur.execute(sql)
rows = cur.fetchall()  # pode trazer milhões de linhas
```

### 5. Sidebar React — fetch único por montagem

Dados de módulos mudam raramente — não re-buscar a cada mudança de rota:

```typescript
const _settingsFetchedRef = useRef(false);

useEffect(() => {
  if (_settingsFetchedRef.current) return;
  _settingsFetchedRef.current = true;
  fetchSettings();
}, [pathname]); // pathname ainda no deps para auto-open de menus
```

### 6. Índices Estratégicos Implementados (Migration Fase 2)

Todos os comandos devem ser sempre executados com `CREATE INDEX IF NOT EXISTS` para assegurar idempotência e integridade sem perda de dados:

```sql
-- prd_product
CREATE INDEX IF NOT EXISTS idx_prd_product_company_id ON prd_product (company_id);
CREATE INDEX IF NOT EXISTS idx_prd_product_category_id ON prd_product (category_id);
CREATE INDEX IF NOT EXISTS idx_prd_product_brand_id ON prd_product (brand_id);
CREATE INDEX IF NOT EXISTS idx_prd_product_status ON prd_product (status);
CREATE INDEX IF NOT EXISTS idx_prd_product_company_status ON prd_product (company_id, status);

-- crm_customer & subentidades
CREATE INDEX IF NOT EXISTS idx_crm_customer_company_id ON crm_customer (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_customer_company_doc ON crm_customer (company_id, document);
CREATE INDEX IF NOT EXISTS idx_crm_address_customer_id ON crm_address (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_contact_customer_id ON crm_contact (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_interaction_customer_id ON crm_interaction (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_interaction_seller_id ON crm_interaction (seller_id);
CREATE INDEX IF NOT EXISTS idx_crm_favorite_customer_id ON crm_customer_favorite (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_favorite_product_id ON crm_customer_favorite (product_id);

-- ord_order & ord_order_item
CREATE INDEX IF NOT EXISTS idx_ord_order_item_order_id ON ord_order_item (order_id);
CREATE INDEX IF NOT EXISTS idx_ord_order_item_product_id ON ord_order_item (product_id);

-- fin_installment
CREATE INDEX IF NOT EXISTS idx_fin_installment_account_id ON fin_installment (account_id);
CREATE INDEX IF NOT EXISTS idx_fin_installment_status ON fin_installment (status);
CREATE INDEX IF NOT EXISTS idx_fin_installment_due_date ON fin_installment (due_date);
CREATE INDEX IF NOT EXISTS idx_fin_installment_status_due ON fin_installment (status, due_date);

-- cmp_company & usr_user
CREATE INDEX IF NOT EXISTS idx_cmp_company_tenant_id ON cmp_company (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cmp_company_active ON cmp_company (active);
CREATE INDEX IF NOT EXISTS idx_usr_user_company_id ON usr_user (company_id);
```

### 7. Otimizações de Query & Agregação (Fase 3)

1. **Agregações em SQL Direto vs. `.all()` na memória**:
   - NUNCA carregar milhares de linhas na memória com `.all()` para calcular somas em Python com `sum(...)`.
   - Utilizar agregação nativa do PostgreSQL via `db.query(..., func.sum(...)).group_by(...)`. Isso reduz o consumo de RAM em até 95% e o tempo de resposta em até 10x.
2. **Prevenção de N+1 em Paginações**:
   - Ao iterar sobre uma lista de resultados paginados onde cada item precisa de contagens filhas (ex: número de parcelas por transação), extrair a lista de IDs (`trans_ids = list({trans.id for ...})`) e fazer uma única consulta agregada com `IN (...)` agrupada por ID pai, montando um mapa em memória.
3. **Eager Loading com `joinedload`**:
   - Sempre que o endpoint retornar dados de relacionamentos directos (ex: `Product.brand_rel`, `Product.category`, `Order.customer`), aplicar `.options(joinedload(...))` na query principal.
4. **Respeito Obrigatório à Flag de Paginação do Horus (`horus_legacy_pagination`)**:
   - Qualquer consulta ao ERP Horus DEVE verificar `getattr(self._settings, 'horus_legacy_pagination', False)`. Se verdadeiro, os parâmetros `OFFSET` e `LIMIT` NÃO devem ser enviados na requisição à API Horus.

---

## 🏗️ ARQUITETURA — Padrões obrigatórios

### Estrutura de um novo módulo e Regras Mandatórias

Ao criar qualquer novo módulo ou feature (ex: `horus_financial`, `editorial`, `inventory`):

1. **Endpoint** → `app/api/<modulo>.py` (router FastAPI isolado com tags claras)
2. **Modelo** → `app/models/<modulo>.py` (se precisar de tabela no PostgreSQL — SEM SQLite)
3. **Schema** → `app/schemas/<modulo>.py` (Pydantic com validação rigorosa de campos)
4. **Integrador / Service** → `app/integrators/<modulo>.py` ou `app/services/` (lógica de negócio isolada do handler)
5. **Router** → registrado no `main.py` via `app.include_router(modulo.router)`

### 🔐 Regras Mandatórias para Todo Novo Módulo / Feature:

1. **Guard de Ownership (Primeira Linha)**:
   ```python
   from app.core.utils import assert_company_ownership

   @router.get("/companies/{company_id}/meu-modulo")
   def meu_endpoint(
       company_id: int,
       db: Session = Depends(get_db),
       current_user: User = Depends(get_current_user),
   ):
       assert_company_ownership(current_user, company_id)  # [SEC] Mandatório antes de qualquer query
   ```
2. **Validação Rígida de Uploads (Se houver arquivos)**:
   - Utilizar obrigatoriamente `validate_file_size_and_extension` e `read_file_safely` de `app.core.upload_security`.
   - Tetos: 5MB fotos, 10MB planilhas/documentos, 15MB teto absoluto.
   - Gravar SEMPRE na pasta isolada da empresa: `uploads/<company_id>/<modulo>/...`.
   - Sanitizar nomes de arquivos com `sanitize_filename(file.filename)`.
3. **Relacionamentos SQLAlchemy Sem Ambiguidade**:
   - Sempre declarar `foreign_keys=[...]` nos relationships caso a tabela aponte mais de uma vez para o mesmo modelo.
4. **Consultas ao ERP Horus**:
   - Respeitar a flag `horus_legacy_pagination` do `cmp_settings`.
5. **Indexação Estratégica & Não Destrutiva (Zero Perda de Dados)**:
   - Todo campo `company_id`, chaves estrangeiras (`ForeignKey`) e pares de busca frequente (ex: `company_id + status`, `company_id + document`) DEVEM ser indexados.
   - Qualquer migração DDL de índices DEVE utilizar a cláusula `CREATE INDEX IF NOT EXISTS` para assegurar idempotência e integridade absoluta dos dados existentes.
6. **Prevenção Rígida de Queries N+1**:
   - Em rotinas de listagem, jobs em background (APScheduler) e relatórios, NUNCA executar `db.query(...)` dentro de loops `for item in items`.
   - Utilizar `joinedload` / `selectinload` para relacionamentos diretos ou cache em dicionário local (`cache[id] = ...`) para metadados por empresa.
   - Sempre limitar queries em background com `.limit(N)` (ex: 50 ou 100 por execução) para não travar a memória RAM nem o pool de conexões do PostgreSQL.
7. **Dados que nunca devem ser retornados ao cliente**:

| Campo | Substituição |
|-------|-------------|
| `horus_sql_password` | `"SET"` se configurado, `null` se não |
| `efi_client_secret`, `smtp_password` etc | `"SET"` se configurado, `null` se não |
| Stack trace de erros 500 | `{"detail": "Ocorreu um erro interno no servidor. Por favor, tente novamente mais tarde."}` |
| Hashes de senha / segredos de token | Nunca em nenhum schema de response |
| Credenciais do banco PostgreSQL | Nunca em nenhum response |

---

## 🔌 INTEGRAÇÕES EXTERNAS

### SQL Server Horus (pytds)
- Driver: `python-tds` (pure Python TDS) — **não** `pymssql` (FreeTDS falha no Linux/Mac)
- Conexão: `IP,PORTA` ou `IP:PORTA` suportados via `parse_host_port()` em `app/core/utils.py`
- Autenticação: `sa` (SQL Auth) — senha criptografada com Fernet no banco
- Pool: TTL 10min, thread-safe, cleanup automático a cada 15min

### PostgreSQL
- Driver: `psycopg2-binary`
- Pool: SQLAlchemy `pool_size=20, max_overflow=10, pool_pre_ping=True, pool_recycle=1800`
- Encoding: `UTF8` forçado via `os.environ["PGCLIENTENCODING"]`

### Vindi (gateway de pagamento)
- Autenticação: Basic Auth (`vindi_api_key + ":"`)
- Base URL: `https://app.vindi.com.br/api/v1/`
- `bill.code` = `COD_PEDIDO_ORIGEM` no Horus = ID do pedido no Cronuz

### Banco Inter (MTLS)
- Certificado `.crt` e `.key` armazenados **no banco de dados** (colunas `inter_cert_content`, `inter_key_content`)
- Arquivo físico temporário criado em `tempfile` apenas durante a requisição e destruído no `finally`

---

## 📋 HORUS DIRECT — Tabelas SQL Server (Baixa Financeira)

| Tabela | Alias | Função |
|--------|-------|--------|
| `LANCTOS_CRECEBER` | `LR` | Lançamentos a receber — tabela principal |
| `LANCTOS_CRECEBERA` | — | Espelho/arquivo (também atualizado no borderô) |
| `PEDIDOS_VENDA` | `PV` | Pedidos — `COD_PEDIDO_ORIGEM` = ID do pedido web |
| `NF_MESTRE` | `NF` | Notas fiscais vinculadas ao pedido |
| `BORDERO` | — | Cabeçalho do borderô gerado |

**Status válido para borderô:** `STA_LANCTO_CRECEBER = 'AB'` (aberto)

**Configurações obrigatórias para gerar borderô** (`cmp_settings`):
`horus_banco_forma_pagto`, `horus_banco_codigo`, `horus_banco_agencia`, `horus_banco_conta`, `horus_banco_carteira`

---

## 🚀 DEPLOY

Ver arquivos em `deploy/` para instruções de cada feature.  
Após deploy executado com sucesso, mover para `deploy/processed/`.

### Checklist antes de qualquer deploy

1. `git checkout main && git pull origin main`
2. Criar feature branch: `git checkout -b feature/nome`
3. Implementar localmente
4. Validar: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/` → `200`
5. Verificar worker sem zumbi: `ps aux | grep uvicorn | grep -v grep`
6. Somente após autorização explícita do usuário: `git push`

### Servidor produção
- Provider: DigitalOcean
- IP: `64.23.182.183`
- App: `/var/www/cronuz/`
- Serviço: `systemctl restart cronuz-backend`
- Logs: `/var/www/cronuz/backend/uvicorn.log`

---

## ❌ PROIBIÇÕES ABSOLUTAS

- `git push / deploy` sem autorização explícita no prompt
- `UPDATE/DELETE` no banco de produção sem autorização
- Credenciais hardcoded no código (senhas, tokens, chaves)
- `pymssql` ou `PyMySQL` (não utilizados — removidos do requirements)
- SQLite (projeto usa PostgreSQL exclusivamente)
- Traceback em responses de erro
- ForeignKeys ambíguas sem `foreign_keys=` explícito nos relationships SQLAlchemy
