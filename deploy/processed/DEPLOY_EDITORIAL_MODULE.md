# Roteiro de Deploy: Módulo de Produção Editorial Flexível

## 📋 Resumo da Atualização
Este deploy adiciona o suporte ao **Módulo de Produção Editorial Flexível (Pipelines e Demandas Customizáveis)**, permitindo que cada seller organize seu fluxo editorial (Livro Físico, E-book, Reimpressão, etc.) com etapas e SLAs configuráveis.

---

## 🗄️ Execução no Banco de Dados (PostgreSQL de Produção)

Acesse o banco de dados em produção e execute os scripts SQL:

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/create_editorial_module.sql
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/update_editorial_costs_professionals.sql
```

Estruturas criadas/alteradas:
- Coluna `module_editorial` em `cmp_company`
- Tabelas base: `edt_pipeline`, `edt_stage`, `edt_project`, `edt_task`, `edt_file`, `edt_history`
- Colunas de tiragem e custos em `edt_project` (`tiragem`, `preco_capa_sugerido`, `margem_estimada_percentual`, `custo_unitario_exemplar`, `custo_total_orcado`, `custo_total_realizado`)
- Tabelas avançadas:
  - `edt_professional` (cadastro de prestadores, especialidades, Pix e diárias)
  - `edt_project_cost` (grade orçada e realizada por demanda)
  - `edt_pipeline_template` (modelos prontos com seed de Ficção, Não-Ficção, Acadêmico, etc.)

---

## 🚀 Passos de Deploy da Aplicação

1. Atualizar repositório:
```bash
cd /var/www/cronuz && git pull origin main
```

2. Instalar dependências do Backend (fpdf2):
```bash
source /var/www/cronuz/backend/venv/bin/activate
pip install fpdf2
```

3. Executar scripts de banco de dados (conforme comandos acima).

4. Reiniciar Backend:
```bash
systemctl restart cronuz-backend
```

5. Recompilar e reiniciar Frontend:
```bash
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
```

6. Validação:
```bash
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/docs
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000/editorial
```

---

## 📁 Pós-Deploy
Após o deploy e validação bem-sucedida em produção, mova os arquivos para `deploy/processed/`:
```bash
mv deploy/create_editorial_module.sql deploy/processed/
mv deploy/update_editorial_costs_professionals.sql deploy/processed/
mv deploy/DEPLOY_EDITORIAL_MODULE.md deploy/processed/
```
