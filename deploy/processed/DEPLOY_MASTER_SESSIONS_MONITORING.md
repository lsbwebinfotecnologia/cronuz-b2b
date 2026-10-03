# Roteiro de Deploy: Monitoramento de Sessões e Acessos em Tempo Real (Master)

## 1. Contexto e Motivação
- Criação de tela exclusiva para o Master monitorar quem está conectado na plataforma.
- Acompanhamento de acessos para MASTER, SELLER/Equipe e CLIENTE B2B (Storefront).
- Atualização otimizada/throttled de presença e última atividade (last_activity_at) a cada 60s.
- Possibilidade de derrubar sessões ativas com 1 clique (revogação imediata).

## 2. Alterações no Banco de Dados (PostgreSQL)
Executar o script SQL presente em:
- `deploy/20261003_add_last_activity_to_user_session.sql`

Comando psql em produção:
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/20261003_add_last_activity_to_user_session.sql
```

## 3. Rollback (se necessário)
```sql
ALTER TABLE usr_session_logs DROP COLUMN IF EXISTS last_activity_at;
DROP INDEX IF EXISTS idx_usr_session_logs_active_activity;
DROP INDEX IF EXISTS idx_usr_session_logs_user_role;
```

## 4. Reinicialização de Serviços
```bash
systemctl restart cronuz-backend
cd /var/www/cronuz/frontend && npm run build && pm2 restart cronuz-frontend
```
