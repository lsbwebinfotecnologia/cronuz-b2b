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
| `DATABASE_URL` | Obrigatório no `.env` — **sem fallback hardcoded** em `session.py` |
| `MASTER_SEED_PASSWORD` | `.env` em produção — sem hardcoded no `main.py` |
| `HORUS_SQL_ENCRYPTION_KEY` | Fernet key no `.env` — **nunca** no repositório |
| Senhas de terceiros (`vindi_api_key`, `smtp_password`, etc.) | Banco de dados — criptografia Fernet (roadmap) |
| Certificados NFS-e `.pfx` | Disco em `certs/nfse/<company_id>/` — **fora do git** |
| Certificados MTLS (Banco Inter) | Banco de dados — arquivo temporário descartado após uso |

### 2. Autorização por ownership — obrigatório em todos os endpoints de empresa

Todo endpoint que recebe `company_id` na rota DEVE validar que o usuário pertence àquela empresa ou é MASTER:

```python
# app/api/horus_sql.py — padrão a seguir em todos os módulos novos
def _assert_ownership(current_user: dict, company_id: int) -> None:
    user_type = current_user.get("type", "")
    user_company = current_user.get("company_id")
    if user_type != "MASTER" and user_company != company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
```

### 3. CORS — apenas HTTPS

```python
# main.py
allow_origin_regex=r"https://.*"  # http:// NUNCA permitido
```

### 4. Respostas de erro — sem information disclosure

```python
# CORRETO — traceback apenas em log interno, nunca no response
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    _main_logger.error("[500] %s", traceback.format_exc())
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})
```

### 5. SQL Injection — pytds

O cliente pytds (`horus_sql_client.py`) sempre usa parâmetros separados:
```python
cur.execute("SELECT * FROM TABLE WHERE ID = %s", (id_value,))
# NUNCA: cur.execute(f"SELECT * WHERE ID = {id_value}")
```

### 6. Arquivos sensíveis — .gitignore obrigatório

```gitignore
.env
certs/
*.pfx *.p12 *.pem *.key *.crt
uploads/
```

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

### 6. Índices recomendados (migrations futuras)

```sql
-- Filtros frequentes em produção
CREATE INDEX idx_cmp_company_active ON cmp_company (active) WHERE active = true;
CREATE INDEX idx_cmp_company_tenant ON cmp_company (tenant_id);
CREATE INDEX idx_ord_order_company_status ON ord_order (company_id, status);
CREATE INDEX idx_ord_order_horus_pedido ON ord_order (company_id, horus_pedido_venda)
  WHERE horus_pedido_venda IS NOT NULL;
CREATE INDEX idx_crm_customer_company_doc ON crm_customer (company_id, document);
CREATE INDEX idx_fin_installment_status_due ON fin_installment (status, due_date);
```

---

## 🏗️ ARQUITETURA — Padrões obrigatórios

### Estrutura de um novo módulo

Ao criar qualquer novo módulo (ex: Horus Direct Financeiro Vindi):

1. **Endpoint** → `app/api/horus_financial.py` (router FastAPI isolado)
2. **Modelo** → `app/models/horus_financial.py` (se precisar de tabela)
3. **Schema** → `app/schemas/horus_financial.py` (Pydantic)
4. **Integrador** → `app/integrators/vindi_parser.py` (lógica de negócio separada)
5. **Router** → registrado no `main.py` via `app.include_router()`

### Guard de ownership — padrão mínimo

```python
@router.get("/companies/{company_id}/modulo/endpoint")
def meu_endpoint(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _assert_ownership(current_user, company_id)  # [SEC] SEMPRE primeiro
    # ... lógica do endpoint
```

### Módulos por seller — dois níveis de controle

```
cmp_company.module_horus_sql = True/False    ← toggle mestre (Master ativa para o seller)
cmp_settings.horus_sql_feature_vindi_baixa   ← sub-feature (Master ativa funcionalidade)
```

O seller vê o menu **"Horus Direct"** somente quando `module_horus_sql = True`.  
As sub-features aparecem somente quando ativas individualmente.

### Dados que nunca devem ser retornados ao cliente

| Campo | Substituição |
|-------|-------------|
| `horus_sql_password` | `"SET"` se configurado, `null` se não |
| `efi_client_secret`, `smtp_password` etc | `"SET"` se configurado, `null` se não |
| Stack trace de erros 500 | `{"detail": "Internal Server Error"}` |
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
