# Instruções de Deploy — Fase 1: Segurança Imediata e Upload Limits

> **Data:** 2026-09-30  
> **Status:** Pronto para deploy noturno em produção (conforme alinhado com o usuário).

---

## 🔒 1. Variáveis de Ambiente Obrigatórias em Produção

No servidor de produção (`64.23.182.183`), antes de reiniciar o backend:

1. Acesse o arquivo `/var/www/cronuz/backend/.env`.
2. Adicione ou defina uma chave forte para `SECRET_KEY`:
   ```bash
   # Gerar chave aleatória de 32 bytes (64 caracteres hexadecimais):
   python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))"
   ```
3. Garanta que a linha gerada esteja presente no `/var/www/cronuz/backend/.env`.
4. Defina `ENVIRONMENT=production` no `.env`.

> [!WARNING]
> A rotação de `SECRET_KEY` invalidará tokens JWT anteriores. Os usuários (sellers, agentes e master) precisarão fazer login novamente após o reinício do serviço.

---

## 🚀 2. Passos de Deploy

```bash
# 1. Conectar via SSH
ssh root@64.23.182.183

# 2. Atualizar código do repositório
cd /var/www/cronuz
git pull origin main

# 3. Reiniciar o serviço backend
systemctl restart cronuz-backend

# 4. Validar status do worker e healthcheck
systemctl status cronuz-backend --no-pager
curl -s -o /dev/null -w "Backend HTTP Code: %{http_code}\n" http://localhost:8000/
```

---

## 🛡️ 3. Resumo das Proteções Aplicadas nesta Fase

- **Segurança de JWT**: `SECRET_KEY` não fica mais exposta no código-fonte.
- **Prevenção de Information Disclosure**: Erros 500 não expõem mais tabelas, drivers ou tracebacks no payload de resposta HTTP.
- **Headers de Segurança HTTP**: Inclusão de `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` e `X-XSS-Protection`.
- **Prevenção de DoS/OOM em Uploads**:
  - Imagens: limite de 5MB
  - Planilhas e Documentos: limite de 10MB
  - Teto absoluto do sistema: 15MB
  - Leitura em chunks controlados via `read_file_safely`
  - Sanitização de nomes de arquivos contra Path Traversal
- **Proteção Anti-Brute-Force**: Bloqueio de 15 minutos após 5 tentativas consecutivas de senha incorreta em `/token`.
- **Prevenção contra IDOR Multi-tenant**: Validação estrita de `Customer.company_id == current_user.company_id` na criação de pedidos.
