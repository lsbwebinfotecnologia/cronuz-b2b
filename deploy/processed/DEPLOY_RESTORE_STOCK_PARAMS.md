# Deploy — Restauração dos Parâmetros de Estoque Hórus (SD_COD_EMPRESA / SD_COD_FILIAL)

## Problema Identificado:
O ERP Hórus no endpoint `Busca_AcervoB2B` exige os parâmetros `SD_COD_EMPRESA` e `SD_COD_FILIAL` para identificar a empresa e filial e retornar o `SALDO_DISPONIVEL` real de cada produto. Sem esses parâmetros, o Hórus retornava `SALDO_DISPONIVEL = 0` para todos os itens do acervo.

## Correção Efetuada:
1. Em `backend/app/integrators/horus_products.py`:
   - Restaurado o envio de `SD_COD_EMPRESA`, `SD_COD_FILIAL` e `SD_LOCAL_ESTOQUE` no `Busca_AcervoB2B`.
2. Em `backend/app/jobs/dropship_stock_job.py`:
   - Adicionado parâmetro `full_sync` para permitir sincronização de período amplo de 4 anos.
3. Executada carga de estoque ampla de 4 anos diretamente em produção para atualizar a posição no Hub-Erdos com os saldos reais.
