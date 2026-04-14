# Deploy: Módulo de Serviços
Este documento detalha os requisitos e as instruções exatas de modificação no Banco de Dados PostgreSQL que devem ser realizadas ANTES do próximo Deploy em Produção (cumprindo nossa regra).

## Alterações de Banco de Dados (`PostgreSQL`)
O sistema agora possui duas novas entidades que operam paralelamente ao módulo financeiro e comercial. As modificações devem ser aplicadas **antes de rodar o `git pull` do frontend** e de reiniciar o backend na VPS de produção para evitar erros `500 Internal Server Error` na subida.

**Script oficial responsável por executar essa migração (Idempotente):**
`backend/migrate_service_module.py`

### Novas Tabelas Mapeadas
O script vai executar de forma automatizada o `Base.metadata.create_all()` gerando em Produção:

1. **`svc_service`** (Módulo de Cadastro de Serviço Base):
   - Chave Estrangeira ligada à **Company** e **Categoria Financeira**.
   - Colunas textuais (nome, codigo lc116, CNAE, e descricao do serviço para a NFS-e).
   - Colunas dinâmicas em `BOOLEAN` cobrindo impostos de Retenção: `reter_iss`, `reter_inss`, `reter_ir`, `reter_pis`, `reter_cofins`, `reter_csll`.

2. **`svc_service_order`** (Módulo de Ordens de Serviço contratadas):
   - Chave Estrangeira do **Customer** atendido e do **Serviço base**.
   - Valores flexíveis (o vendedor pode ajustar o preço de tabela para aquele cliente fixo).
   - Flag indicadora de Status da Ordem (Cancelada, Pendente, Em Execucao, Concluido) e Status da possível NFS-e Gerada.

### Instrução Simples de Execução (Deploy Seguro)

Quando formos autorizados a "subir para produção":
1. Faremos acesso SSH na máquina de Prod.
2. Ativaremos o Virtual Environment `source venv/bin/activate` dentro de `backend`.
3. Executaremos `python migrate_service_module.py`
4. Confirmaremos os logs subindo `Created tables successfully`.
5. Só depois então, iremos Buildar o frontend (Next) e recarregar os scripts no servidor PM2 (`pm2 restart all`).
