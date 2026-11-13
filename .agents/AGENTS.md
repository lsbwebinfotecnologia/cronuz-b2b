# Regras de Desenvolvimento e Arquitetura - Cronuz B2B

Este documento estabelece diretrizes críticas de segurança, banco de dados, deploy e organização de arquivos para qualquer agente ou desenvolvedor atuando neste repositório.

---

## 🖥️ 0. Infraestrutura de Produção

> [!IMPORTANT]
> **SEMPRE use este servidor quando o usuário pedir para subir para produção ou fazer deploy.**
> Nunca assuma outro IP ou servidor sem confirmação explícita do usuário.

### Servidor de Produção (DigitalOcean)
| Item | Valor |
|---|---|
| **IP** | `64.23.182.183` |
| **Usuário SSH** | `root` |
| **Acesso** | `ssh root@64.23.182.183` |
| **Diretório do projeto** | `/var/www/cronuz` |
| **Frontend** | PM2 — processo `cronuz-frontend` — porta `3000` |
| **Backend** | systemd — serviço `cronuz-backend` — porta `8000` |

### Banco de Dados PostgreSQL (Produção)
| Item | Valor |
|---|---|
| **Host** | `localhost` (no próprio servidor) |
| **Banco** | `cronuz_b2b` |
| **Usuário** | `cronuz_admin` |
| **Senha** | `cronuz_password_123` |
| **Conexão psql** | `PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b` |

### Comandos Padrão de Deploy
```bash
# Pull + Build Frontend + Restart
cd /var/www/cronuz && git pull origin main
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend

# Restart Backend
systemctl restart cronuz-backend

# Validação final
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/dashboard/metrics -H 'Authorization: Bearer test'
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000
```

---

## 📁 1. Organização de Arquivos e Pastas

Para manter a raiz do projeto limpa e organizada, aplicam-se as seguintes regras de diretórios:

### 🧪 Arquivos de Teste e Validação:
* **NÃO crie arquivos de teste, scripts temporários ou patches diretamente na raiz do projeto.**
* Todos os arquivos de teste, scripts de validação e patches de ajuste (ex: `test_*.py`, `patch_*.py`, `fix_*.py`) devem obrigatoriamente ser colocados dentro da pasta `tests/` localizada na raiz do projeto.

### 🚀 Controle de Deploy:
* Todos os arquivos que controlam ou guiam deploys em produção (como roteiros de deploy `DEPLOY_*.md` ou scripts SQL de alteração de banco de dados `.sql`) devem ser criados dentro da pasta `deploy/` na raiz do projeto.
* Assim que um deploy for **finalizado e executado com sucesso**, todos os arquivos e instruções correspondentes àquele deploy devem ser movidos para a pasta **`deploy/processed/`**.

### 📦 Pasta de Uploads e Arquivos Dinâmicos (`uploads/`):
* A pasta `uploads/` localizada na raiz do projeto armazena imagens, capas, boletos e notas fiscais dinamicamente. **Ela NUNCA deve ser removida do servidor de produção**, pois contém arquivos ativos de cada seller/cliente.
* **Manter o `.gitignore` Intacto**: Essa pasta já está devidamente configurada no `.gitignore`. **NUNCA altere ou remova as regras de ignore já existentes no `.gitignore`**. Toda nova feature ou módulo deve obrigatoriamente armazenar seus arquivos dinâmicos dentro das estruturas já ignoradas pelo Git.
* **Estrutura e Isolamento Obrigatório por Seller**:
  - Cada seller/empresa deve ter **sua própria pasta e estrutura isolada** de arquivos: `uploads/<company_id>/...` (ex: `uploads/<company_id>/products/`, `uploads/<company_id>/sheets/`, `uploads/<company_id>/invoices/`).
  - **NUNCA grave arquivos soltos na raiz de `uploads/`**.
  - O backend deve sempre verificar e criar a subpasta do seller dinamicamente antes de gravar o arquivo (ex: `Path.mkdir(parents=True, exist_ok=True)`).

### 🛡️ Regra Mandatória: Limite de Tamanho de Arquivos (Proteção do Software):
> [!IMPORTANT]
> **Todo e qualquer upload de arquivos realizado por sellers (planilhas de produtos/estoque, fotos/capas, PDFs, notas fiscais, boletos, etc.) DEVE OBRIGATORIAMENTE possuir limite rígido de tamanho de arquivo.**
> Essa diretriz é vital para **preservar a vida útil do software**, a estabilidade dos workers (evitando estouro de memória RAM / OOM Killer do Uvicorn/Gunicorn) e o espaço em disco do servidor de produção.

#### Diretrizes de Limites de Tamanho por Tipo:
1. **Imagens e Capas de Produtos (`JPG`, `PNG`, `WEBP`)**:
   - Limite máximo permitido: **5 MB** por arquivo.
   - Sempre que possível, aplicar compressão no backend antes de persistir em disco.
2. **Planilhas de Importação (`XLSX`, `CSV`, `ODS`)**:
   - Limite máximo permitido: **10 MB** por arquivo.
   - O processamento deve ser streaming/chunked para não carregar planilhas gigantescas inteiras na memória RAM de uma só vez.
3. **Documentos e Fiscais (`PDF`, `XML`, `TXT`)**:
   - Limite máximo permitido: **10 MB** por arquivo.
4. **Teto Máximo Absoluto do Sistema**:
   - Nenhum endpoint de upload deve permitir arquivos superiores a **15 MB**.
5. **Validação em Duas Camadas**:
   - **No Frontend**: Validar `file.size` no cliente antes do envio, bloqueando e alertando o usuário imediatamente com mensagem amigável caso o arquivo ultrapasse o limite.
   - **No Backend**: O endpoint deve obrigatoriamente checar o tamanho do stream/payload antes de salvar em disco. Se exceder, abortar imediatamente retornando `HTTP 413 (Payload Too Large)` ou `HTTP 400`: *"O arquivo excede o limite máximo permitido de X MB para este tipo de envio."*.

---

## 🔒 2. Segurança e Armazenamento de Credenciais/Certificados

> [!IMPORTANT]
> **NUNCA armazene certificados, chaves privadas, tokens ou arquivos de credenciais diretamente na estrutura de pastas físicas do projeto (como a pasta `certs/`).**

### Diretriz:
1. **Armazenamento em Banco de Dados**: Todos os certificados e chaves (como os do Banco Inter MTLS) devem ser armazenados exclusivamente no banco de dados (ex: colunas `inter_cert_content` e `inter_key_content` da tabela `cmp_settings`).
2. **Arquivos Temporários (Stateless)**: Se uma biblioteca ou API exigir um caminho de arquivo físico para autenticação (como o MTLS do Banco Inter), o backend deve:
   * Criar um arquivo temporário em disco no diretório temporário do sistema operacional (usando a biblioteca `tempfile` do Python).
   * Escrever o conteúdo do banco de dados no arquivo temporário.
   * Utilizar o arquivo na requisição.
   * **Destruir/apagar** o arquivo temporário imediatamente após o encerramento do ciclo da requisição (ex: usando blocos `try/finally` ou destrutores de classe `__del__`).
3. **Certificados NFS-e (`.pfx`) — Arquivos Persistentes em Disco**:
   * Os certificados digitais para emissão de NFS-e ficam salvos **fisicamente em disco** no servidor de produção, sob o caminho:
     * `certs/nfse/<company_id>/<nome_do_arquivo>.pfx`
   * Esses arquivos são exclusivos de cada cliente (seller) e **NUNCA devem ser removidos** por processos de deploy, limpeza de Git (`git clean -fd`) ou qualquer outra operação automática.
   * A pasta `certs/` e suas subpastas estão no `.gitignore` justamente para proteção, mas isso também significa que o Git **não as rastreia** — portanto, backups manuais ou via scripts de deploy devem ser previstos.
   * Se um certificado `.pfx` for perdido (ex: após uma limpeza indevida), o sistema retornará erro `REJECTED: Certificado não encontrado em: /var/www/cronuz/certs/nfse/<id>/...`. Nesse caso, o usuário deverá re-enviar o certificado via painel de configurações.
4. **Controle do Git**: Garanta que a pasta `certs/` e quaisquer extensões de certificados (como `.crt`, `.key`, `.pem`, `.pfx`, `.p12`) estejam permanentemente configuradas no `.gitignore`.

---

## 🗄️ 3. Regras de Banco de Dados (PostgreSQL)

> [!CAUTION]
> **NÃO execute comandos de UPDATE ou DELETE no banco de dados de produção sem autorização prévia explícita do usuário.**

* **Banco Local e Produção**: O banco de dados do projeto é PostgreSQL. **NÃO utilize SQLite** em hipótese alguma.
* **Mapeamento de Banco (Migrations)**: Sempre que realizar alterações de estrutura no banco de dados (DDL), crie um arquivo de deploy detalhado na pasta `deploy/` com os comandos SQL exatos necessários para o deploy em produção.
* **Foreign Keys**: Ao criar relacionamentos no SQLAlchemy, garanta explicitamente a ausência de chaves estrangeiras ambíguas, especificando sempre `foreign_keys` nos relacionamentos para referências duplas.

---

## ⚙️ 4. Regras de Deploy e Execução de Processos

* **Deploy Seguro**: Nunca faça `git push`, deploy ou modificações diretas no servidor de produção a menos que explicitamente autorizado no prompt atual (ex: *"sobe pra producao"*). Se o usuário disser *"apenas no local"*, restrinja-se a simulações e execuções no ambiente local.
* **Integridade do Worker**: Antes de finalizar qualquer tarefa relacionada ao backend, verifique se o worker do Uvicorn/Gunicorn no servidor de produção não ficou travado em estado Zumbi.
* **Validação de API**: Após qualquer alteração que afete o backend, valide se a API subiu corretamente respondendo com status HTTP 200 OK na porta `8000` via teste local (ex: `curl`).

---

## 🌿 5. Estratégia de Git Branching

### Branch `main` — Produção
* A branch `main` é a branch de **produção/código estável**.
* Ela é a única implantada no servidor de produção (DigitalOcean).
* **Nunca desenvolva diretamente na `main`.** Todo código novo deve passar por uma feature branch antes de ser mesclado.

### Criando uma Feature Branch (Windows ou Mac)
Antes de iniciar qualquer funcionalidade ou correção, crie uma branch isolada a partir da `main` atualizada:

```bash
git checkout main
git pull origin main
git checkout -b feature/nome-da-funcionalidade
```

* Tudo o que for desenvolvido ficará isolado nessa branch até estar testado e aprovado.
* Use nomes descritivos para as branches (ex: `feature/busca-por-cpf`, `fix/trava-valor-os`, `feat/dia-vencimento-recorrente`).

### Publicando para Produção
Somente quando a funcionalidade estiver **testada e aprovada**, faça o merge da feature branch para a `main`:

```bash
git checkout main
git pull origin main
git merge feature/nome-da-funcionalidade
git push origin main
```

* Após o merge, a `main` é implantada no servidor de produção mediante autorização explícita do usuário (ex: *"sobe pra producao"*).
* Feature branches concluídas podem ser deletadas após o merge:

```bash
git branch -d feature/nome-da-funcionalidade
git push origin --delete feature/nome-da-funcionalidade
```

> [!IMPORTANT]
> Esta regra se aplica tanto ao desenvolvimento no **Windows** quanto no **Mac**. Nenhum agente ou desenvolvedor deve fazer commits diretos na `main` sem passar pelo fluxo de feature branch.

---

## 📱 6. Padrão de UI e Responsividade — Mobile First

> [!IMPORTANT]
> **Todo e qualquer desenvolvimento de interface (UI/UX) daqui em diante DEVE obrigatoriamente seguir o modelo Mobile First.**
> Esta regra se aplica a **todo o projeto**: Painel Administrativo (Seller e Master), Storefront (Loja B2B) e Portais Públicos.

### Diretrizes Obrigatórias para Novas Telas e Componentes:
1. **Abordagem Mobile First**: Qualquer tela, modal, tabela, formulário ou componente criado ou modificado deve ser desenhado e testado primeiramente pensando na usabilidade em telas móveis (smartphones e tablets).
2. **Preservação da Experiência Desktop**: O código responsivo deve utilizar classes condicionais do Tailwind CSS (ex: `hidden md:flex`, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, `p-3 md:p-6`), garantindo que a visão em monitores e laptops permaneça limpa, espaçosa e inalterada.
3. **Navegação e Touch Targets**:
   - Menus laterais em mobile devem utilizar gaveta deslizante (`Mobile Drawer`) ou abas roláveis horizontais.
   - Botões, campos de entrada e áreas clicáveis devem ter dimensões adequadas para toque em telas de celular.
4. **Tabelas e Listagens**:
   - Todas as tabelas de dados no dashboard ou loja devem ser contidas em elementos com `overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800` para evitar estouros de tela em celulares.

---

## 💰 7. Padrão Obrigatório de Máscara Automática para Valores e Moedas (Frontend)

> [!IMPORTANT]
> **Todo e qualquer campo de entrada (input) que envolva valores financeiros (R$, preço unitário, custo, frete, subtotal, total) ou percentuais (desconto %, comissão %, etc.) DEVE OBRIGATORIAMENTE possuir máscara automática em tempo real no padrão brasileiro (BRL / pt-BR).**
> Esta diretriz é mandatória para todo novo módulo, tela, modal ou componente criado no Cronuz B2B.

### Diretrizes Mandatórias:
1. **PROIBIDO o uso de `<input type="number">` cru para valores financeiros e percentuais**:
   - Inputs numéricos crus geram problemas com separadores decimais (vírgula vs ponto), setas (`spinners`) indesejadas na interface, falhas de precisão e péssima experiência de digitação móvel.
2. **Componente Padrão Oficial (`CurrencyInput`)**:
   - Todo campo financeiro ou percentual deve utilizar o componente padronizado [`CurrencyInput`](file:///Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/frontend/src/components/CurrencyInput.tsx) (`@/components/CurrencyInput`).
3. **Valores Monetários em Reais (R$)**:
   - Configurar sempre com prefixo monetário: `prefixStr="R$ "` (ex: `R$ 1.250,50`).
   - Digitação contínua estilo ATM (onde cada dígito entra como centavo).
4. **Percentuais de Desconto ou Margem (%)**:
   - Configurar sempre com sufixo percentual: `suffixStr="%"` e trava de limite `max={100}` (ex: `10,00%`).
5. **Alternância entre R$ e % em Descontos**:
   - Em locais onde for permitido conceder desconto tanto em valor nominal (R$) quanto em percentual (%), deve-se disponibilizar um alternador visual simples (`R$` / `%`), aplicando a máscara correspondente de acordo com o modo ativo.

---

## 🏛️ 8. Arquitetura Funcional: Horus Direct DBM (Isolamento, UI Moderna & Experiência Excel) vs. Rotinas Padronizadas do Cronuz

> [!IMPORTANT]
> **Isolamento Arquitetural, Visual Moderno e Ergonomia de Planilha Excel do Ecossistema Horus Direct DBM**:
> 1. **Independência Total das Rotinas Padronizadas do Cronuz B2B**:
>    - Todas as tratativas de telas (`/dbm/*`, `/proposals/desk`), rotinas de backend (`ebook_pearson.py`, `horus_sql.py`, `dbm.py`), sincronizações e dinâmicas operacionais do **Horus Direct DBM** **fogem e NÃO possuem vínculos diretos** com as rotinas padronizadas do Cronuz B2B (como o cadastro padrão de produtos `/products`, Storefront B2B, PDV ou Mesa Comercial padrão).
>    - Campos, regras de negócio (como múltiplos ISBNs de e-book, controle de tiragens, royalties, contratos autorais, código DBM, repasse Pearson/Bookwire, janela de novidades `-9m a +6m`) e comportamentos do DBM devem ser tratados em suas próprias telas e fluxos dedicados, sem descaracterizar nem depender das telas padrão do Cronuz.
> 2. **Padrão Visual & Operacional Mandatório: UI Moderna e Limpa + Experiência Nativa de Planilha Excel**:
>    - **Estética Moderna, Limpa e Suave (Sem Clones Datados dos Anos 90)**:
>      - As telas do DBM não devem copiar cores pesadas ou bordas chanfradas antigas do Microsoft Access anos 90. Devem utilizar um design **SaaS moderno, limpo e confortável para uso prolongado** (tons suaves `slate-50`/`white`, acentos discretos em `indigo`/`slate`, tipografia nítida e organização modular em cartões/seções claras).
>    - **Proibição de Redundâncias Operacionais e Repetição de Botões**:
>      - **NUNCA duplique botões de mesma função na mesma tela/rotina** (ex.: colocar `+ Novo Orçamento` na barra de topo e repetir outro botão `+ Novo` no cabeçalho do card de filtros ou dentro do estado vazio da tabela, ou repetir botões de ação em todas as linhas quando já existe a ação principal no topo).
>      - Cada ação primária (como `Novo Orçamento`, `Nova Empresa`, `Novo Produto`) deve existir em **um único ponto claro no topo da tela**, mantendo a interface enxuta, intuitiva e livre de poluição visual.
>    - **Experiência 100% Excel / Planilha de Alta Produtividade**:
>      - **Navegação Fluida por Teclado**: Uso intensivo de setas (`↑`, `↓`, `←`, `→`), `Home`, `End`, `Enter` (para avançar campo ou abrir ficha), `Tab`, `Duplo Clique`, `F2` (atalho de salvamento rápido) e `Esc` (retorno instantâneo à planilha).
>      - **Grades de Alta Densidade (`Spreadsheet View`)**: Colunas alinhadas com fontes monoespaçadas para ISBNs, códigos Horus, saldos e preços, edição inline rápida na grade ou em sub-planilhas (como a planilha de **Tiragens & Custos**), filtros instantâneos e barra inferior de navegação rápida de registros (`|< < Registro X de N > >|`).
>      - **Enriquecimento Híbrido Horus (API REST + SQL Direct)**: Aproveitar ao máximo os metadados ricos já disponíveis no Horus (Preço de Capa, Saldo Disponível, Saldo Consignado, Giro, Autor, Editora, Gênero/Assunto, Unidades por Caixa, Peso, Dimensões e Data de Lançamento) evitando campos redundantes ou nomenclaturas legadas confusas.
> 3. **Mesa de Análise & Intake Comercial Padrão (Liberada para todos os Sellers via Módulo)**:
>    - Módulo padronizado da plataforma Cronuz B2B destinado aos demais sellers (`/order-intake`), mantendo rotinas e regras de negócio isoladas do DBM para evolução independente de cada frente.

---

## 📦 9. Arquitetura de Consulta Horus ERP (`SD_*` vs `AC_*` e Pesquisa Storefront)

> [!IMPORTANT]
> **NUNCA remova ou confunda os parâmetros `SD_*` e `AC_*` nas consultas `Busca_AcervoB2B` do Horus ERP.**
> Alterações indevidas nesses parâmetros quebram o cálculo de saldo por local ou fazem aparecer livros zerados/de outras editoras em bancos Horus compartilhados (ex: Editora Compor / Grupo LE).

### Regras Arquiteturais Mandatórias:
1. **Parâmetros `SD_*` (`SD_COD_EMPRESA`, `SD_COD_FILIAL`, `SD_LOCAL_ESTOQUE` — Cálculo de Saldo Disponível)**:
   - Determinam de qual empresa, filial e local de estoque o Horus deve calcular o campo `SALDO_DISPONIVEL`.
   - **DEVEM sempre ser enviados** em [`busca_acervo_b2b`](file:///Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend/app/integrators/horus_products.py) quando configurados em `cmp_settings`, pois todos os módulos (Storefront, Dropship, Intake, Bookinfo Hub, PDV) dependem do saldo real do local configurado.
   - Os parâmetros `SD_*` sozinhos **não ocultam** itens sem saldo do retorno do Horus.

2. **Parâmetros `AC_*` (`AC_COD_EMPRESA`, `AC_COD_FILIAL`, `AC_LOCAL_ESTOQUE` — Filtro de Acervo sem Saldo)**:
   - Instruem o Horus a **restringir o acervo retornado** apenas aos itens que possuem saldo disponível naquela Empresa/Filial/Local.
   - **NÃO devem ser enviados globalmente** para todos os módulos internos em `busca_acervo_b2b`, pois rotinas como Dropship Sync, Bookinfo Hub, Order Intake e consulta direta de produto precisam enxergar o item mesmo quando o saldo for `0` (para apontar falta ou zerar vitrine).
   - **DEVEM ser enviados EXCLUSIVAMENTE na Pesquisa da Storefront** ([`_fetch_from_horus_storefront`](file:///Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend/app/api/storefront.py) quando `search_type == "SEARCH"` e `settings.horus_hide_zero_balance == True`), **em conjunto** com os parâmetros `SD_*`, acompanhados da trava defensiva que ignora itens com `SALDO_DISPONIVEL <= 0` na listagem da busca.

---

## 🌉 10. API Horus Complementar & Agente Bridge (`HorusAPIBridge.exe`) + Droplet Dedicado

> [!IMPORTANT]
> **O Agente Bridge (`tools/horus-api-bridge-windows/`) é a solução oficial para sellers que não conseguem liberar portas de firewall (`8060` da API Horus ou `1433` do SQL Server) e para disponibilizar uma API Horus B2B pública/paralela padronizada.**

### Diretrizes Arquiteturais Mandatórias:
1. **Identidade e Licenciamento (Padrão PDV Offline)**:
   - O executável (`HorusAPIBridge.exe`) utiliza obrigatoriamente a **Logo Roxa Oficial do Horus B2B** (`horus_icon.ico` + Base64 embutido).
   - Habilitação controlada no Painel Master (`module_horus_api_bridge` / `horus_bridge_enabled`) com **Chave de Licença Criptográfica HMAC-SHA256 (`HBRI1.<payload>.<sig>`)** e data de validade (`horus_bridge_expires_at`).
2. **Comunicação Reversa (Zero Portas Abertas no Firewall do Cliente)**:
   - O `.exe` abre conexão de saída (HTTPS/443) com o Gateway Cloud e conversa internamente na rede local com `http://localhost:8060/Horus/api/TServerB2B/` e com o SQL Server local (`1433` via `pytds` puro Python, sem depender de ODBC).
   - **Compressão GZIP** em payloads de retorno e respeito rigoroso a `OFFSET`/`LIMIT` (`horus_legacy_pagination`), `SD_*` e `AC_*`.
   - **Segurança SQL**: O `.exe` nunca executa strings SQL abertas vindas da internet; apenas responde aos endpoints complementares homologados (`Busca_TitulosFinanceiros`, `Busca_ResumoFinanceiroCliente`, `Busca_PedidosDBM`, `Busca_NotasFiscaisSQL`).
3. **Execução como Serviço do Windows (`.bat`)**:
   - Deve manter os scripts `GERAR_EXECUTAVEL_HORUS_BRIDGE.bat`, `INSTALAR_SERVICO_WINDOWS.bat` (modo `--service` em background no boot do Windows) e `INICIAR_HORUS_API_BRIDGE.bat`.
4. **Suporte a Droplet Dedicado (`SERVER_ROLE=horus_api_only`)**:
   - Quando configurado `SERVER_ROLE=horus_api_only` no `.env` de um Droplet dedicado na DigitalOcean, o backend desativa o APScheduler e sobe exclusivamente as rotas do Gateway da API Horus Complementar (`/Horus/api/TServerB2B/*`, `/horus-api-bridge/*` e `/health`), isolando 100% a carga de API externa do servidor principal.

---

## 🔠 11. Padrão Obrigatório de Caixa Alta (`UPPERCASE`) em Rotinas de Integração

> [!IMPORTANT]
> **Toda e qualquer rotina de integração (Hórus ERP, Erdos Dropship, Bookinfo, etc.) que for CADASTRAR algo novo ou ATUALIZAR registros (clientes, endereços, pedidos de remessa, pedidos de venda, itens, observações, status) DEVE OBRIGATORIAMENTE enviar todos os dados textuais em CAIXA ALTA (tudo maiúsculo / `.upper()`).**

### Diretrizes Mandatórias:
1. **Cadastros e Atualizações de Clientes e Endereços (`InsAltCliente`, `InsAltEndCliente`, etc.)**:
   - Nome/Razão Social (`NOM_CLI`), Logradouro (`DESC_ENDERECO`), Número (`NUM_END`), Complemento (`COM_ENDERECO`), Bairro (`NOM_BAIRRO`), Cidade (`NOM_LOCAL`), UF (`SIGLA_UF`), Nome do Estado (`NOME_UF`), País (`NOM_PAIS`: `"BRASIL"`) e Responsável (`NOM_RESP`) devem sempre ser normalizados com `.strip().upper()` antes do envio.
2. **Envio de Pedidos e Itens (`InsPedidoVenda`, `InsItensPedidoVenda`, `AltStatus_Pedido`, `Pular_expedicao`, etc.)**:
   - Tanto no pedido de entrega/remessa ao consumidor final quanto no pedido de venda (ex: venda ERDOS), todos os campos de texto — como `COD_PEDIDO_ORIGEM`, `OBS_PEDIDO`, `ID_GUID`, `FRETE_EMIT_DEST`, `STA_PEDIDO` e `BARRAS_ISBN` — devem ser enviados integralmente em CAIXA ALTA.
3. **Helper de Sanitização**:
   - Sempre aplicar sanitização `.upper()` em dicionários de parâmetros (`payload`) de criação/atualização antes da chamada HTTP ao integrador externo.

---

## 💬 12. Padrão Obrigatório de Comunicação, Retornos de API e Transparência Clara do Motivo de Erro

> [!IMPORTANT]
> **REGRA ARQUITETURAL MANDATÓRIA: Todo e qualquer retorno de erro (Backend e Frontend) DEVE informar claramente o motivo real do erro.**
> 1. **Proibição Absoluta de Erros Silenciosos (`Silent Fail`)**:
>    - É **terminantemente proibido** capturar exceções de banco de dados, API externa (Horus REST, Horus SQL, Cora, Vindi, Sefaz, etc.) ou validação com `except Exception: return []` / `pass` e devolver lista vazia (`HTTP 200`) fingindo que "não há registros no período". Se a consulta falhar, o sistema deve tentar o fallback homologado (ex: Horus SQL ↔ Horus REST) e, se indisponível, retornar erro explícito informando exatamente qual serviço falhou e por quê.
> 2. **Proibição de Mensagens Genéricas Vagas sem Causa**:
>    - Nunca retorne frases genéricas cegas como *"Não foi possível concluir sua solicitação neste momento"* ou *"Alguns campos obrigatórios não foram preenchidos"* sem explicitar **quais campos falharam** ou **qual foi o motivo real da falha**.
>    - Em erros de validação (`HTTP 422`), o retorno `detail` deve listar claramente os campos e o motivo (ex.: `"Campos inválidos ou obrigatórios: data_vencimento (formato inválido), cliente_id (obrigatório)"`).
>    - Em erros de integração ou processamento (`HTTP 400` / `500` / `502`), o `detail` deve informar de forma clara e direta o motivo real (ex.: `"Falha ao consultar Notas Fiscais no Horus: A API Horus REST (walianca-editora.dalla.srv.br:8060) não respondeu (timeout/conexão recusada) e o SQL Server retornou: ..."`).

### Diretrizes Mandatórias por Camada de Público:
1. **Consumidor Final (`Customer` — Storefront B2C, Checkout, Portais de Escolas/Eventos, Links de Pagamento e Webhooks de Retorno)**:
   - **Proibição de Jargões Técnicos e Nomes de Gateways/Integradores**:
     - O consumidor final **não sabe e não precisa saber** o que é *Vindi*, *Yapay*, *Efí*, *Cora*, *Cielo*, *Rede*, *Horus*, *Tray*, *Webhook*, *Token* ou *Sandbox*.
     - Nos componentes de loja e checkout (ex.: `B2COpenStorefront.tsx`), nunca utilize rótulos como *"Checkout Express Vindi"*, *"Link Seguro Vindi"* ou *"QR Code • Efí"*. Utilize sempre termos orientados à experiência de compra: **"Checkout Rápido"**, **"Identificação Rápida por CPF"**, **"Ambiente Seguro de Pagamento"**, **"Pagamento Online Seguro"**, **"Liberação Imediata • QR Code"** e **"Aprovação Imediata"**.
   - **Mensagens de Erro Claras na API Pública**:
     - Qualquer falha de validação ou recusa de pagamento deve informar claramente ao comprador o motivo prático (ex.: *"Cartão recusado pelo banco emissor — verifique os dados do cartão ou tente outra forma de pagamento"*, *"CEP ou endereço incompleto"*), sem expor nomes de gateways internos.
   - **Redirecionamento Inteligente em Endpoints de Retorno / Webhook**:
     - Caso o navegador do consumidor acesse diretamente uma rota de retorno ou webhook (via `GET` ou `POST` com `Accept: text/html`, como `/api/b2c/webhooks/vindi`), o sistema **nunca** deve exibir JSON cru ou `{"detail": "Method Not Allowed"}`. Deve processar a confirmação silenciosamente e apresentar uma tela amigável redirecionando automaticamente o cliente de volta para a **página inicial da loja**.

2. **Lojista (`Seller` — Painel Administrativo da Loja / Operação Comercial)**:
   - **Transparência Total do Motivo do Erro + Ação Prática**:
     - Ao tratar erros no painel administrativo (`Seller`), a mensagem deve SEMPRE informar **exatamente o motivo do erro** (qual campo, qual serviço/banco falhou e a razão retornada) acompanhado de como resolver.
     - Exemplo correto: *"Não foi possível consultar o Horus REST (walianca-editora.dalla.srv.br:8060 — conexão recusada). Verifique se o serviço TServerB2B está ativo na porta 8060 ou utilize a conexão Horus SQL Direct."*

3. **Ambiente `Master` (Super Admin / Engenharia / Homologação Técnica)**:
   - **Diagnóstico Técnico Completo e Auditoria**:
     - Informações técnicas aprofundadas (códigos de retorno de APIs externas, endpoints chamados, status HTTP, payloads sanitizados para auditoria e logs de integração) devem estar sempre visíveis e detalhadas para diagnóstico imediato.

---

## 🕒 13. Padrão Obrigatório de Fuso Horário (`America/Sao_Paulo` — Horário Oficial de Brasília `UTC-3`)

> [!IMPORTANT]
> **Todas as camadas da arquitetura (Sistema Operacional Linux, Banco de Dados PostgreSQL, Pool de Conexões SQLAlchemy, Relatórios Excel/PDF e Interfaces Frontend) DEVEM operar rigorosamente no Horário Oficial de Brasília (`America/Sao_Paulo` / `UTC-3`).**

### Diretrizes Arquiteturais Mandatórias:
1. **Sistema Operacional e Banco de Dados PostgreSQL (Local e Produção)**:
   - O servidor Linux deve manter `timedatectl set-timezone America/Sao_Paulo`.
   - O banco PostgreSQL (`cronuz_b2b`) e o usuário `cronuz_admin` devem ter `timezone = 'America/Sao_Paulo'` configurado permanentemente (`ALTER DATABASE cronuz_b2b SET timezone TO 'America/Sao_Paulo'; ALTER ROLE cronuz_admin SET timezone TO 'America/Sao_Paulo';`).
2. **Pool de Conexões SQLAlchemy (`backend/app/db/session.py`)**:
   - O `create_engine` deve obrigatoriamente incluir `connect_args={"options": "-c timezone=America/Sao_Paulo"}` e `os.environ["TZ"] = "America/Sao_Paulo"`, garantindo que toda sessão de banco de dados retorne e interprete `DateTime(timezone=True)` no horário de Brasília.
3. **Formatação em Relatórios e Exportações (`strftime`)**:
   - Antes de formatar qualquer `datetime` no backend para exibição textual, JSON formatado, Excel (`.xlsx`) ou PDF (`.pdf`), deve-se converter explicitamente para `BRT_TZ = timezone(timedelta(hours=-3))` (`dt.astimezone(BRT_TZ)`), evitando que carimbos em UTC (`+00:00`) sejam impressos com 3 horas a mais.

---

## 🏦 14. Arquitetura Oficial de Conciliação Financeira Horus ERP (Motor Dinâmico De/Para, Schema SQL Server e Proibição de Redundâncias)

> [!IMPORTANT]
> **PROIBIÇÃO ABSOLUTA DE REDUNDÂNCIAS EM CONCILIAÇÃO FINANCEIRA**:
> **NUNCA crie novas telas, rotas ou arquivos de API separados para novos formatos de planilhas financeiras (cartões, eventos/bienais, adquirentes, marketplaces, boletos ou extratos).**
> Toda evolução futura — seja conciliação por **Número de Lançamento (`NRO_LANCTO_CRECEBER`)**, **Nota Fiscal (`NRO_NOTA_FISCAL` / `COD_NF`)**, **Pedido Horus (`COD_PED_VENDA`)**, **Pedido Web/Ponte (`COD_PEDIDO_ORIGEM`)**, **Valor + Data**, **CPF/CNPJ + Valor** ou **Múltiplas Referências** — deve ser evoluída **exclusivamente dentro do Motor Dinâmico Oficial** ([`horus_dynamic_reconciliation.py`](file:///Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend/app/api/horus_dynamic_reconciliation.py) e [`conciliador-padrao/page.tsx`](file:///Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/frontend/src/app/%28dashboard%29/horus-direct/conciliador-padrao/page.tsx)).

### 1. Convivência Isolada por Cliente (`cmp_settings`):
1. **Módulo Legado / Dedicado (`horus_sql_feature_baixa_vindi`)**:
   - Rota Frontend: `/horus-direct/financeiro-vindi`
   - Backend: [`backend/app/api/horus_financial.py`](file:///Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend/app/api/horus_financial.py)
   - Mantido intacto para clientes já em operação legada (Shopee/Vindi/TikTok fixos), sem sofrer alterações estruturais que afetem quem já está usando.
2. **Módulo Oficial Padronizado — Conciliador Dinâmico & Construtor de Modelos (`horus_sql_feature_conciliador_padrao`)**:
   - Rota Frontend: `/horus-direct/conciliador-padrao` ([`conciliador-padrao/page.tsx`](file:///Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/frontend/src/app/%28dashboard%29/horus-direct/conciliador-padrao/page.tsx))
   - Backend: [`backend/app/api/horus_dynamic_reconciliation.py`](file:///Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend/app/api/horus_dynamic_reconciliation.py)
   - Modelo de Dados PostgreSQL: tabela `horus_reconciliation_templates` ([`horus_reconciliation_template.py`](file:///Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend/app/models/horus_reconciliation_template.py)) + histórico de fechamentos em `horus_reconciliation_closings` ([`horus_reconciliation_closing.py`](file:///Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend/app/models/horus_reconciliation_closing.py)).
   - Permite criar, editar, clonar e migrar **N modelos por cliente** (1 Planilha ou 2 Planilhas Ponte), mapeando colunas ("De → Para"), regra de extração (`AUTO`, `DIGITS_ONLY`, `AFTER_HASH`, `EXACT`, `REGEX`), parâmetros bancários próprios por modelo (`forma_pagto`, `forma_pagto_credito_maior`, `banco`, `agencia`, `conta`, `carteira`) e modo de baixa (`CHANNEL_DATE`, `SPECIFIC_DATE`, `BORDERO_OPEN`).

### 2. Regras de Leitura de Planilhas e Validação de Upload:
- Sempre validar uploads de planilhas com `validate_file_size_and_extension(file, category="sheet")` e `await read_file_safely(file, max_size_bytes=MAX_SHEET_SIZE_BYTES)` de [`upload_security.py`](file:///Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend/app/core/upload_security.py).
- O parser dinâmico (`_parse_dynamic_channel_file`) suporta tanto planilhas completas de canais quanto **planilhas montadas enxutas** (ex.: apenas `Lançamento` e `Valor`), detectando automaticamente cabeçalhos com ou sem acento/underscore, enriquecendo o nome do cliente (`CLI.NOM_CLI`) e a Nota Fiscal diretamente do Horus ERP quando ausentes na planilha, e calculando automaticamente `Taxa = Valor Bruto Horus - Valor Líquido Planilha` quando a planilha informar apenas o valor líquido recebido.
- Linhas de saída/débito operacional em extratos (como ajustes/reembolsos da Shopee) são deduzidas para que o valor líquido do fechamento bata exatamente com a soma líquida da planilha.

### 3. Schema Oficial do SQL Server do Horus ERP (Contas a Receber & Borderô):
> [!CAUTION]
> **Respeite estritamente os nomes reais das colunas do Horus ERP para evitar erros de SQL em produção:**
- **`LANCTOS_CRECEBER` e `LANCTOS_CRECEBERA` (Espelho de Auditoria)**:
  - Colunas existentes: `NRO_LANCTO_CRECEBER`, `COD_EMPRESA`, `COD_FILIAL`, `COD_CLI`, `COD_PED_VENDA`, `COD_NF`, `COD_BORDERO`, `STA_LANCTO_CRECEBER` (`'AB'` = Aberto, `'PG'` = Pago), `VLR_LANCTO_CRECEBER` (Bruto Original), `VLR_LANCTO_ABATIMENTO` (Taxa / Desconto), `VLR_LANCTO_CORRECAO`, `VLR_LANCTO_TOTAL` (Valor Líquido do Título), `VLR_LANCTO_PAGO`, `DAT_VENC_CRECEBER`, `DAT_PAGTO_CRECEBER`, `DAT_PAGTO_CONTA`, `DAT_ULT_ATL`, `STA_APROVACAO`, `USU_APROVACAO`, `NOM_USUARIO`, `OBS_CRECEBER`.
  - **ATENÇÃO**: Na tabela `LANCTOS_CRECEBER`, a coluna de nota fiscal chama-se **`COD_NF`**. **NÃO existe** coluna `NRO_SEQ_NF` em `LANCTOS_CRECEBER`.
  - **Integridade de FK e Trigger**: `LANCTOS_CRECEBERA` possui a Foreign Key `FK_LANCTOS_CRECEBERA_LANCTOS_CRECEBER1` apontando para `LANCTOS_CRECEBER`. Ao remover parcelas excedentes na unificação, **SEMPRE** consolide primeiro `CONTA_CLIENTE_VINCULACAO`, depois execute `DELETE FROM LANCTOS_CRECEBERA` e só então `DELETE FROM LANCTOS_CRECEBER`. Ao criar lançamento de Crédito Maior separado, **SEMPRE** insira primeiro em `LANCTOS_CRECEBER` e em seguida sincronize `LANCTOS_CRECEBERA`.
- **`NF_MESTRE` (Notas Fiscais)**:
  - Relacionamento com `LANCTOS_CRECEBER`: `NF_MESTRE.COD_PED_VENDA = LR.COD_PED_VENDA AND NF_MESTRE.COD_FILIAL = LR.COD_FILIAL` (com fallback adicional para `LR.COD_NF`), retornando `NRO_NOTA_FISCAL`.
- **`PEDIDOS_VENDA` (Pedidos de Venda)**:
  - Relacionamento com `LANCTOS_CRECEBER`: `PV.COD_PED_VENDA = LR.COD_PED_VENDA AND PV.COD_FILIAL = LR.COD_FILIAL`, retornando `PV.COD_PEDIDO_ORIGEM` (`PEDIDO_WEB`) e `PV.COD_METODO`.
- **`CLIENTES`**:
  - Relacionamento com `LANCTOS_CRECEBER`: `CLI.COD_CLI = LR.COD_CLI`, retornando `CLI.NOM_CLI`.
- **`BORDERO`**:
  - Recebe o fechamento (`COD_EMPRESA`, `COD_FILIAL`, `COD_FORMA`, `COD_BORDERO`, `VLR_TOT_BORDERO`, `VLR_TOT_PAGO`, `STA_BORDERO` `'AP'` ou `'PG'`, `COD_BANCO`, `COD_AGENCIA`, `COD_CONTAC`, `NRO_CARTEIRA`, `DAT_GERACAO`, `DAT_PAGAMENTO`), vinculado aos títulos via `UPDATE LANCTOS_CRECEBER SET COD_BORDERO = ...` e auditado em tempo real no banco PostgreSQL do Cronuz (`horus_reconciliation_closings`).

