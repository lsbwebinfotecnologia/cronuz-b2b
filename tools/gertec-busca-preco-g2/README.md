# 📟 Cronuz Busca Preço — Servidor Windows para Gertec Busca Preço G2

Aplicativo Desktop Windows leve e independente para conectar leitores de consulta de preço **Gertec Busca Preço G2 (G2 / G2S / G2E / TC506)** via rede local (TCP/IP porta `6500`) diretamente à **API do Cronuz B2B / Horus ERP**.

---

## 🚀 Como funciona

1. **Comunicação Nativa Gertec G2 (Protocolo TC406 / BPG2)**:
   - O aplicativo abre um servidor Socket TCP na porta `6500` do computador Windows da loja.
   - Os aparelhos **Gertec Busca Preço G2** conectam-se a esse IP/Porta automaticamente na rede local (Cabo ou Wi-Fi).
   - O servidor realiza o handshake oficial (`#ok` → `#bpg2s`/`#bpg2e` → `#alwayslive`), envia as mensagens de boas-vindas (`#mesg`) e mantém a conexão viva com *keep-alive* automático (`#live?`).
2. **Integração Direta com a API Cronuz B2B & Horus ERP**:
   - Você faz login no aplicativo com o **E-mail/CNPJ e Senha do Seller**.
   - O backend gera uma sessão exclusiva de longa duração (`GERTEC_TERMINAL`), garantindo que logins na web ou no PDV nunca desconectem o terminal de consulta.
   - Cada leitura de código de barras consulta `/product-search/product` na API Cronuz, que utiliza automaticamente as credenciais do **Horus ERP** configuradas no Seller (respeitando `horus_legacy_pagination` de `OFFSET/LIMIT`, Empresa e Filial) e registra o log analítico como `physical_scanner`.
3. **Checklist e Diagnóstico Inteligente**:
   - Se o Seller não estiver com a integração Horus ativa, ou se faltar URL/Porta/Usuário/Senha do Horus, ou se o servidor Horus estiver inacessível, o aplicativo exibe um alerta claro em tela mostrando **exatamente qual item precisa ser configurado e onde ajustar**.

---

## 💻 Como rodar no Windows

### Opção A — Executar Direto (Sem precisar compilar)
1. Copie a pasta `tools/gertec-busca-preco-g2` para o computador Windows da loja (necessário Python 3.10+ instalado).
2. Dê dois cliques em **`INICIAR_CRONUZ_GERTEC.bat`**.
   - *(Não requer `pip install` de nenhuma biblioteca externa! Usa apenas módulos nativos do Python).*

### Opção B — Gerar Executável `.exe` Único (Para máquinas sem Python)
1. Em qualquer máquina Windows com Python, dê dois cliques em **`GERAR_EXECUTAVEL_WINDOWS.bat`**.
2. Ele gerará automaticamente o arquivo **`CronuzBuscaPrecoGertecG2.exe`**.
3. Basta levar apenas o `.exe` para o computador da loja e executá-lo!

---

## ⚙️ Como configurar o aparelho físico Gertec Busca Preço G2

1. Olhe no topo da janela do aplicativo **Cronuz Busca Preço**: ele mostra automaticamente o **IP do Servidor** (ex: `192.168.1.100`) e a **Porta TCP** (`6500`).
2. No aparelho **Gertec Busca Preço G2**:
   - Conecte um teclado USB no aparelho (ou acesse o endereço IP do aparelho pelo navegador web, caso seja o modelo G2E).
   - Entre no menu de **Configurações → Rede → Servidor (Host)**.
   - Configure o **IP do Servidor** com o IP mostrado no aplicativo Windows.
   - Configure a **Porta do Servidor** como **`6500`**.
3. Salve e reinicie o aparelho Gertec G2. Em poucos segundos ele aparecerá na tabela **"Terminais Gertec G2 Conectados na Rede"** dentro do aplicativo!
