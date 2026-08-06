-- Deploy: Adicionar coluna recurrence_fixed_day na tabela svc_service_orders
-- Data: 2026-08-06
-- Descrição: Armazena o dia fixo de vencimento mensal para O.S. recorrentes (1-28)

ALTER TABLE svc_service_order
  ADD COLUMN IF NOT EXISTS recurrence_fixed_day INTEGER;

-- Comentário: Após executar, nenhum dado existente é afetado.
-- O campo NULL significa "sem dia fixo definido" (comportamento legado).
