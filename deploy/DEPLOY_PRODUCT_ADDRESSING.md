# Roteiro de Deploy — Módulo de Endereçamento de Produtos (Multi-endereço)

## 1. Visão Geral
Este deploy introduz a funcionalidade de **Endereçamento Físico de Produtos**, permitindo associar múltiplos endereços físicos a um mesmo produto (ISBN / Código do Item) por filial e local de estoque, com suporte a:
- Upload de planilhas (.xlsx e .csv) com limite rígido de 10 MB.
- Coletor Mobile offline-ready (IndexedDB + Web Audio API).
- Exibição de endereços diretamente na consulta de saldo do **Busca Preço**.
- Novo item de menu "Endereçamento" posicionado diretamente abaixo de "Busca Preço".

---

## 2. Alterações no Banco de Dados (PostgreSQL)

Execute o script `deploy/create_prd_product_address_table.sql` no banco `cronuz_b2b`:

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/create_prd_product_address_table.sql
```

### Conteúdo do Script SQL (`create_prd_product_address_table.sql`):
```sql
CREATE TABLE IF NOT EXISTS prd_product_address (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES cmp_seller_branch(id) ON DELETE CASCADE,
    cod_local_estoque VARCHAR(50),
    isbn VARCHAR(32) NOT NULL,
    horus_cod_item VARCHAR(50),
    title VARCHAR(255),
    address VARCHAR(100) NOT NULL,
    notes TEXT,
    created_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices de consulta de alta performance
CREATE INDEX IF NOT EXISTS idx_prd_address_company_branch ON prd_product_address(company_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_prd_address_isbn ON prd_product_address(company_id, isbn);
CREATE INDEX IF NOT EXISTS idx_prd_address_horus_cod ON prd_product_address(company_id, horus_cod_item);
CREATE INDEX IF NOT EXISTS idx_prd_address_location ON prd_product_address(company_id, branch_id, address);

-- Garante idempotência: evita duplicidade do exato mesmo endereço para o mesmo produto na mesma filial e local
CREATE UNIQUE INDEX IF NOT EXISTS uq_prd_address_exact ON prd_product_address(company_id, branch_id, COALESCE(cod_local_estoque, ''), isbn, address);
```

---

## 3. Comandos de Deploy no Servidor de Produção

Quando o usuário autorizar explicitamente o deploy em produção ("sobe pra producao"):

```bash
# 1. Atualizar repositório
cd /var/www/cronuz
git pull origin main

# 2. Executar migração SQL
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f deploy/create_prd_product_address_table.sql

# 3. Reiniciar Backend
systemctl restart cronuz-backend

# 4. Compilar Frontend e reiniciar PM2
cd /var/www/cronuz/frontend
npm run build
pm2 restart cronuz-frontend

# 5. Validação
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/addressing/template
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000/addressing
```
