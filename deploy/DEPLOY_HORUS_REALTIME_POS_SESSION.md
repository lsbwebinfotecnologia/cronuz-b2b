# Roteiro de Deploy: Consulta em Tempo Real no Horus com Filial no PDV

## 1. Contexto e Motivação
Adição da opção de busca de produtos no PDV em tempo real diretamente na API do Horus (Busca_Acervo + Busca_Estoque_Filial), vinculando a sessão do PDV a uma filial específica cadastrada no seller ().

## 2. Alterações no Banco de Dados (PostgreSQL)
Executar o script SQL presente em:
`deploy/20261003_add_branch_to_pos_session.sql`

Comando via psql em produção:
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -c "ALTER TABLE pos_session ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES cmp_seller_branch(id) ON DELETE SET NULL; CREATE INDEX IF NOT EXISTS idx_pos_session_branch_id ON pos_session(branch_id);"
```

## 3. Rollback
```bash
ALTER TABLE pos_session DROP COLUMN IF EXISTS branch_id;
```

## 4. Passos pós-deploy
1. Reiniciar o serviço do backend (`systemctl restart cronuz-backend`).
2. Buildar e reiniciar o frontend (`npm run build && pm2 restart cronuz-frontend`).
3. Validar rotas de filial e busca em tempo real.
