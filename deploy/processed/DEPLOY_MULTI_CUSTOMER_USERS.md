# Deploy: Múltiplos Acessos (Logins) B2B por Cliente (`CUSTOMER`)

## 1. Alterações no Banco de Dados (PostgreSQL)

Para permitir que um mesmo cliente (`crm_customer` / CNPJ ou CPF) possua múltiplos logins de acesso (`usr_user` do tipo `CUSTOMER`) dentro da mesma empresa (`company_id`), cada um com seu e-mail e senha exclusivos, deve ser removida a constraint única `uq_usr_document_type_company` da tabela `usr_user` e criado o índice de performance em `usr_user(document)`.

### Comando SQL para Executar em Produção:
```sql
ALTER TABLE usr_user DROP CONSTRAINT IF EXISTS uq_usr_document_type_company;
CREATE INDEX IF NOT EXISTS ix_usr_user_document ON usr_user (document);
```

### Execução Direta via SSH no Servidor de Produção (`64.23.182.183`):
```bash
ssh root@64.23.182.183 "PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -c 'ALTER TABLE usr_user DROP CONSTRAINT IF EXISTS uq_usr_document_type_company; CREATE INDEX IF NOT EXISTS ix_usr_user_document ON usr_user (document);'"
```

---

## 2. Arquivos Modificados
- `backend/app/models/user.py`
- `backend/app/api/customers.py`
- `backend/app/api/auth.py`
- `frontend/src/app/(dashboard)/customers/[id]/page.tsx`
