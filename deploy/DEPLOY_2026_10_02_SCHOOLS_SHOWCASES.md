# Roteiro de Deploy: Módulo de Escolas, Passeios, Amigo Secreto & Vitrines Dinâmicas
Data: 2026-10-02

## 1. Migração de Banco de Dados
Arquivo SQL: 

Comando de Execução em Produção:
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_2026_10_02_SCHOOLS_SHOWCASES.sql
```

## 2. Tabelas Criadas / Modificadas
- `cmp_company`: adicionado campo `module_schools`
- `cmp_settings`: adicionados campos `horus_endpoint`, `horus_api_key`
- `mkt_dynamic_showcase`: tabela de vitrines dinâmicas
- `mkt_dynamic_showcase_item`: itens da vitrine vinculados a `prd_product`
- `sch_school_detail`: dados complementares da escola
- `sch_class`: turmas e séries da escola
- `sch_event`: passeios, feiras e amigo secreto
- `sch_event_participant`: participantes, wishlist e atribuições de amigo secreto
- `ord_order`: vínculos com evento, participante, entrega escolar e aluno

## 3. Deploy de Código e Serviços
```bash
cd /var/www/cronuz && git pull origin main
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```
