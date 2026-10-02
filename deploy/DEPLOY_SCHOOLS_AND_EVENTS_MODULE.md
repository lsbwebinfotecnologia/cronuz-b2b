# Roteiro de Deploy — Módulo de Escolas, Passeios, Eventos & Amigo Secreto

## 📅 Data de Criação: 2026-10-01
## 🎯 Escopo:
- Adição da flag de módulo `module_schools` em `cmp_company`.
- Criação das tabelas `sch_school_detail`, `sch_class`, `sch_event`, `sch_event_participant`.
- Adição de campos em `ord_order` para suporte a entrega na escola e amarrações de Amigo Secreto / Eventos.

---

## 🗄️ Execução no Banco de Dados (PostgreSQL de Produção)

Conectar no banco de dados `cronuz_b2b`:
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/create_schools_and_events_module.sql
```

Ou diretamente via psql:
```sql
\i /var/www/cronuz/deploy/create_schools_and_events_module.sql
```

---

## 🚀 Passos de Deploy da Aplicação (Quando Autorizado)

```bash
# 1. No servidor DigitalOcean:
cd /var/www/cronuz
git pull origin main

# 2. Executar migração SQL
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f deploy/create_schools_and_events_module.sql

# 3. Reiniciar Backend
systemctl restart cronuz-backend

# 4. Build e Restart Frontend
cd /var/www/cronuz/frontend
npm run build
pm2 restart cronuz-frontend

# 5. Mover arquivos para deploy/processed/
mv deploy/create_schools_and_events_module.sql deploy/processed/
mv deploy/DEPLOY_SCHOOLS_AND_EVENTS_MODULE.md deploy/processed/
```
