# Regras de Desenvolvimento e Arquitetura - Cronuz B2B

Este documento estabelece diretrizes críticas de segurança, banco de dados, deploy e organização de arquivos para qualquer agente ou desenvolvedor atuando neste repositório.

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
* Essa pasta deve estar obrigatoriamente configurada no `.gitignore` para que limpezas do Git (ex: `git clean -fd`) no servidor não a apaguem acidentalmente.
* **Criação de Subpastas por Seller**: O backend deve ser robusto e, ao processar qualquer upload (como imagens ou PDFs), deve sempre verificar se a subpasta específica do seller/company existe dentro de `uploads/`. Caso não exista, o código deve criá-la dinamicamente antes de gravar o arquivo (ex: `Path.mkdir(parents=True, exist_ok=True)`).

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
