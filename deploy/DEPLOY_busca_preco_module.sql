-- ============================================================
-- DEPLOY: Adição da coluna module_busca_preco na tabela cmp_company
-- Módulo: Busca Preço
-- Data: 2026-08-25
-- ============================================================

-- Adiciona a coluna com valor padrão FALSE (sem ativar para nenhum seller)
ALTER TABLE cmp_company
  ADD COLUMN IF NOT EXISTS module_busca_preco BOOLEAN NOT NULL DEFAULT FALSE;

-- Verificação (opcional — apenas para confirmar após rodar):
-- SELECT id, name, module_busca_preco FROM cmp_company LIMIT 10;
