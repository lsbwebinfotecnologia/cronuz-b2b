# Roteiro de Deploy — Módulo Portal do Autor

## 📋 Resumo das Alterações
Este deploy introduz a infraestrutura do **Portal do Autor** com:
- Ativação do módulo por seller (`modulo_autores_ativo` na tabela `cmp_company`).
- Tabela `aut_author` para gestão de autores vinculados via Horus ERP, controle de primeiro acesso e permissões de vendas.

---

## 🗄️ 1. Alterações no Banco de Dados (PostgreSQL)

Executar o script SQL no banco de produção `cronuz_b2b`:

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/deploy_modulo_autores.sql
```

Ou manualmente via `psql`:

```sql
ALTER TABLE cmp_company 
ADD COLUMN IF NOT EXISTS modulo_autores_ativo BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS aut_author (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    cod_empresa INTEGER,
    cod_filial INTEGER,
    cod_fornecedor INTEGER NOT NULL,
    id_guid VARCHAR(100) NOT NULL,
    id_doc VARCHAR(50) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    cnpj VARCHAR(30),
    cpf VARCHAR(30),
    insc_estadual VARCHAR(50),
    num_telefone VARCHAR(50),
    end_email VARCHAR(255),
    emailb2b VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDENTE_ATIVACAO',
    classificacao_autor VARCHAR(100) NOT NULL DEFAULT 'Autor Principal',
    b2b_mostrar_vendas VARCHAR(1) NOT NULL DEFAULT 'S',
    b2b_mostrar_da VARCHAR(1) NOT NULL DEFAULT 'N',
    activation_token_hash VARCHAR(255),
    activation_token_expires_at TIMESTAMP WITH TIME ZONE,
    reset_token_hash VARCHAR(255),
    reset_token_expires_at TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_company_author_email UNIQUE (company_id, emailb2b),
    CONSTRAINT uq_company_author_guid UNIQUE (company_id, id_guid)
);

CREATE INDEX IF NOT EXISTS idx_aut_author_company ON aut_author(company_id);
CREATE INDEX IF NOT EXISTS idx_aut_author_email ON aut_author(emailb2b);
CREATE INDEX IF NOT EXISTS idx_aut_author_id_guid ON aut_author(id_guid);
```

---

## 🚀 2. Deploy de Código

```bash
cd /var/www/cronuz && git pull origin main
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```

---

## ✅ 3. Validação

```bash
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/dashboard/metrics -H 'Authorization: Bearer <TOKEN>'
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000
```
