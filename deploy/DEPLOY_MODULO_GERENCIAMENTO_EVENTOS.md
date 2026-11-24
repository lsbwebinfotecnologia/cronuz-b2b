# Roteiro de Deploy — Módulo Gerenciamento de Eventos (`module_event_management`)

Este documento detalha todas as alterações estruturais de banco de dados PostgreSQL e passos operacionais necessários quando este módulo for publicado no servidor de produção (`64.23.182.183` / `/var/www/cronuz`).

---

## 1. Alterações no Banco de Dados PostgreSQL (`cronuz_b2b`)

### Coluna adicionada em tabela existente:
- **`cmp_company.module_event_management`**: `BOOLEAN NOT NULL DEFAULT FALSE` (Habilita o módulo Gerenciamento de Eventos por Seller no Painel Master).

### Novas tabelas criadas (`evm_*`):
1. **`evm_venue`**: Pré-cadastro de Casas de Show e Espaços de Eventos por Seller.
2. **`evm_contact`**: CRM perpétuo de convidados do Seller com constraint única `uq_evm_contact_comp_phone (company_id, phone_canonical)` e índice secundário `phone_base_8` para bloquear duplicidade de DDD + Número (com ou sem 9º dígito).
3. **`evm_event`**: Cadastro mestre do evento, datas/horários, vínculo com casa de show ou endereço avulso, setores/cotas e modo híbrido de ingressos/disparo.
4. **`evm_event_guest`**: Lista de convidados vinculada ao evento (`UNIQUE(event_id, contact_id)`), acompanhantes, status RSVP (`rsvp_token`), entrega de ingresso e check-in mobile.
5. **`evm_ticket`**: Cofre blindado de ingressos PDF/ZIP fatiados com trava de arquivo duplicado `UNIQUE(event_id, file_sha256)` e trava exclusiva de titular `assigned_guest_id UNIQUE`.
6. **`evm_invite_template`**: Modelos de convites com imagem do evento, variáveis dinâmicas e saudações variadas (`Spintax`).
7. **`evm_whatsapp_config`**: Credenciais do gateway WhatsApp por Seller (`Evolution API`, `Z-API` ou `WAHA`), parâmetros de intervalo humano anti-bloqueio e regras do Bot receptor de Cartão de Contato (`vCard`).
8. **`evm_dispatch_queue`**: Fila assíncrona cadenciada de disparo WhatsApp com chave de idempotência `UNIQUE(company_id, idempotency_key)`.
9. **`evm_audit_log`**: Histórico completo de auditoria (criação/edição de eventos, importação de convidados, upload/envio de ingressos PDF, respostas RSVP e check-in).

---

## 2. Estrutura de Diretórios de Uploads (Isolamento por Seller)

Nenhuma alteração no `.gitignore` é necessária (a pasta `uploads/` já é ignorada e preservada em produção). O módulo cria dinamicamente:
- `backend/uploads/<company_id>/event_management/banners/` (Imagens e flyers de eventos/convites, máx. 5 MB)
- `backend/uploads/<company_id>/event_management/events/<event_id>/tickets/` (PDFs unitários e extraídos de `.ZIP`/fatiados, máx. 10 MB PDF / 15 MB ZIP)
- `backend/uploads/<company_id>/event_management/events/<event_id>/qr_cards/` (Cards VIP de Cortesia com QR Code nativo)

---

## 3. Comandos Exatos para Execução no Deploy em Produção

> [!IMPORTANT]
> Executar **somente mediante autorização explícita** de deploy e, após concluído com sucesso, mover este arquivo e `20261123_modulo_gerenciamento_eventos.sql` para `deploy/processed/`.

```bash
# 1. Atualizar código da branch main após merge
cd /var/www/cronuz && git pull origin main

# 2. Aplicar migration SQL no PostgreSQL de Produção
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/20261123_modulo_gerenciamento_eventos.sql

# 3. Reiniciar Backend e checar saúde
systemctl restart cronuz-backend
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/health

# 4. Build e Restart do Frontend
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000
```
