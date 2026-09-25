# Deploy - Confirmação de Envio de Notas Fiscais ao WMS MKT e Filtros de Interface

## 1. Regra de Negócio Implementada
- O envio de notas fiscais para a MKT Logística é realizado exclusivamente para:
  1. Pedidos que possuem ID/remessa gravado no WMS (id_ord_sys_log IS NOT NULL).
  2. Pedidos com status faturado no ERP Horus (status_horus == 'FAT').
- A proteção anti-429 foi reforçada com delay de 6s e backoff adaptativo.

## 2. Alterações de Interface
- Filtro padrão de 15 dias na abertura da tela Pedidos (Horus Direct).
- Novo botão de filtro 'NF Enviada MKT' com contagem dinâmica.
- Badge visual destacado 'NF Enviada MKT' com número da NF e chave de acesso.
