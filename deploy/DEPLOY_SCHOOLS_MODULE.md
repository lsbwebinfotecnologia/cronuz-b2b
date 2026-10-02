# Roteiro de Deploy: Módulo de Escolas, Passeios, Eventos & Amigo Secreto

Este documento orienta a aplicação das alterações estruturais de banco de dados e atualização de serviços quando for autorizada a subida para produção.

---

## 🗄️ 1. Alterações no Banco de Dados (PostgreSQL)

Execute o script SQL idempotente preparado em deploy/create_schools_and_events_module.sql no banco cronuz_b2b:

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/create_schools_and_events_module.sql
```

### O que este script realiza:
1. **cmp_company**: Adiciona coluna module_schools BOOLEAN NOT NULL DEFAULT FALSE.
2. **sch_school_detail**: Cria tabela com detalhes pedagógicos e coluna reference_code VARCHAR(100) com índice composto idx_sch_school_detail_reference (company_id, reference_code).
3. **sch_class**: Cria tabela para gerenciar turmas, turnos e anos letivos.
4. **sch_event**: Cria tabela para eventos, passeios escolares, feiras de livros e amigo secreto com suporte a vitrines e configurações específicas.
5. **sch_event_participant**: Cria tabela de participantes/alunos para sorteio de amigo secreto e vinculação de presentes.
6. **ord_order**: Adiciona referências opcionais school_customer_id e school_event_id para pedidos gerados pelas vitrines e checkout coletivo.

---

## 🚀 2. Deploy da Aplicação

### Atualização do Repositório e Frontend:
```bash
cd /var/www/cronuz
git pull origin main
cd /var/www/cronuz/frontend
npm run build
pm2 restart cronuz-frontend
```

### Reinicialização do Backend:
```bash
systemctl restart cronuz-backend
```

### Validação de Status (HTTP 200):
```bash
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000
```
