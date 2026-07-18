# DEPLOY — Módulo Download SEFAZ SP (NFC-e / NF-e)

**Data:** 2026-07-15  
**Branch:** feature/sefaz-download  
**Responsável:** Executar manualmente em produção após aprovação.

---

## ⚠️ PRÉ-REQUISITOS

- [ ] Backup do banco de produção realizado
- [ ] API em modo de manutenção ou janela de baixo tráfego

---

## 1. Migração de Banco de Dados (PostgreSQL)

Execute no banco de produção:

```sql
-- Adiciona colunas de configuração SEFAZ à tabela de filiais do seller
ALTER TABLE cmp_seller_branch
  ADD COLUMN IF NOT EXISTS sefaz_environment VARCHAR(20) NOT NULL DEFAULT 'HOMOLOGACAO',
  ADD COLUMN IF NOT EXISTS uf VARCHAR(2) NOT NULL DEFAULT 'SP',
  ADD COLUMN IF NOT EXISTS sefaz_cert_content TEXT,
  ADD COLUMN IF NOT EXISTS sefaz_cert_password VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cod_local_estoque JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sefaz_ultimo_nsu VARCHAR(15) DEFAULT '0';

-- Índice para buscas por ambiente (opcional, baixo impacto)
CREATE INDEX IF NOT EXISTS idx_seller_branch_sefaz_env
  ON cmp_seller_branch (company_id, sefaz_environment);
```

> ⚠️ **NÃO execute UPDATE ou DELETE sem autorização explícita.**

---

## 2. Código — Arquivos Novos/Modificados

| Arquivo | Ação |
|---|---|
| `backend/app/models/seller_branch.py` | MODIFY — novos campos SEFAZ |
| `backend/app/schemas/seller_branch.py` | MODIFY — novos campos no schema |
| `backend/app/integrators/sefaz_sp_service.py` | NEW — serviço SOAP SEFAZ-SP |
| `backend/app/api/sefaz_download.py` | NEW — router endpoints |
| `backend/main.py` | MODIFY — registro do router |
| `frontend/src/app/(dashboard)/settings/SefazBranchesTab.tsx` | NEW |
| `frontend/src/app/(dashboard)/settings/page.tsx` | MODIFY — nova aba |
| `frontend/src/app/(dashboard)/settings/sefaz-download/page.tsx` | NEW |

---

## 3. Restart do Worker

```bash
sudo systemctl restart cronuz-backend
# Aguardar ~5 segundos e validar:
curl -s http://localhost:8000/ | python3 -m json.tool
# Esperado: HTTP 200 com detalhes da API
```

---

## 4. Validação Pós-Deploy

```bash
# Listar filiais SEFAZ (deve retornar 200 com array vazio)
curl -s -X GET http://localhost:8000/sefaz/branches \
  -H "Authorization: Bearer <TOKEN>" | python3 -m json.tool

# Criar filial de teste (HML)
curl -s -X POST http://localhost:8000/sefaz/branches \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Filial Teste","cnpj":"00000000000000","cod_empresa":"1","cod_filial":"1","sefaz_environment":"HOMOLOGACAO"}' | python3 -m json.tool
```

---

## 5. Observações

- O certificado .pfx é armazenado como **base64 no banco de dados** (coluna `sefaz_cert_content`). Nenhum arquivo físico é persistido no servidor.
- Durante a consulta à SEFAZ, um arquivo temporário é criado em `/tmp` e destruído imediatamente após a requisição (via `tempfile` + `try/finally`).
- A pasta `certs/` NÃO é utilizada por este módulo.
