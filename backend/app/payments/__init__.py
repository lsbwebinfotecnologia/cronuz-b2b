"""
Camada de Pagamentos (Hub) — interface única para intermediadores (Cora, Inter, Efí, Cielo, Rede, Vindi).

  base.py      → contrato PaymentProvider + estruturas de dados normalizadas
  catalog.py   → metadados dos intermediadores (formas suportadas, onde configura, status de configuração)
  registry.py  → habilitação (Master), roteamento canal × forma e instanciação do provedor
  service.py   → ciclo de vida das cobranças (pay_charge): emitir, sincronizar, cancelar, reemitir, webhook, painel
  providers/   → implementações por intermediador
"""
