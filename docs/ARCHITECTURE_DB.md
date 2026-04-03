# Cronuz B2B - Arquitetura de Banco de Dados Mapeada
Este documento tem como objetivo servir como **âncora de contexto** para qualquer agente IA interagindo com a base de código (SQLAlchemy) do Cronuz B2B, prevenindo infrações silenciosas e quebras de Foreign Keys resultantes de alucinações estruturais.

## Separação de Identidade: Authentication vs CRM
A premissa cardinal do Cronuz B2B é a separação rígida entre **Contas de Acesso** e **Perfis Físicos (Clientes e Empresas)**.

1. **`usr_user` (Model: User)**
   - Representa **exclusivamente** os dados de acesso/sessão (E-mail, Senha Hash, Roles Mestre/Vendedor/Cliente).
   - **Nenhum** registro transacional pesado ou pedido deve se ligar diretamente ao User ID para representar um cliente final. O `User.id` mapeia para os painéis de privilégio.

2. **`crm_customer` (Model: Customer)**
   - Representa o **Perfil do Cliente Final e Perfil Fiscal** (Razão Social, Nome Fantasia, CNPJ/CPF exato, Inscrição Estadual, Tags, Dados Horus).
   - Todos os relatórios de negócio, estatísticas de e-commerce e faturas de venda orbitam o `crm_customer.id`!

> [!WARNING]
> Nunca assuma que `usr_user.id == crm_customer.id`, mesmo quando sincronizados automaticamente. Eles divergem. Sempre grave `ord_order.customer_id` mirando no `crm_customer.id`. Nunca injete a Model `User` em Foreign Keys de CRM!

## Entidade Ordem de Venda: `ord_order` e `ord_order_item`
Mapeia de 1-para-M as faturas originadas por B2B Storefront, Horus e Integrações (Bookinfo / Metabook).

- **`company_id` (cmp_company.id)**: Dona da fatura (Emissor/Distribuidora matriz).
- **`customer_id` (crm_customer.id)**: Comprador (Destinatário/Livraria/Cliente). -> (Falhas de FK comumente ocorrem por associar acidentalmente `usr_user.id` neste campo).
- **`agent_id` (usr_user.id)**: Identidade opcional indicando se foi um Vendedor B2B logado que emitiu para terceiros.
- **Identificadores Externos de Sync**:
    - `horus_pedido_venda`: ID Espelho no ERP (idErp).
    - `external_id`: ID Espelho na Partner Source (ex: Bookinfo UUID). Utilizado para prever duplicidades no Cron.
    - `tracking_code`: Opcional, **livre** de uso estrutural de integridade do Banco, estrito para dados transacionais logísticos. Não poluir com chaves GUID de terceiros.

## Resumo Operacional para Agents e Novas Rotas SQLAlchemy
Ao realizar inserções (`db.add`) em Transações (`db.commit()`), observe:
1. Sempre verifique o módulo do qual originou-se a Foreign Key. Em caso de auto-create (ex: sincronismos de Webhooks/Cron), inicialize a Model correspondente à restrição (e gere as relações espelhos).
2. Não adivinhe colunas (ex: propriedades fantasmas). Inspecione primeiramente as tipagens estáticas na pasta `backend/app/models/*.py`.
3. Para garantir que este documento esteja "na ponta da língua", adicione um aviso em seu Prompt Global.
