# 🟣 Horus API Bridge (`HorusAPIBridge.exe`) — Cronuz B2B

Aplicativo Desktop e Serviço Windows complementar ao `API HORUS S.I.G.A`.
Permite expor todos os endpoints padrão do Horus (`/Horus/api/TServerB2B/...`) mais os endpoints financeiros e operacionais complementares via SQL Server local **sem necessidade de liberar portas de entrada no Firewall/Roteador do cliente**.

---

## 📦 Arquivos do Pacote

- `horus_api_bridge_app.py`: Código-fonte completo (Interface Gráfica estilo Horus S.I.G.A + Modo Serviço `--service`).
- `horus_icon.ico`: Ícone oficial roxo do Horus B2B.
- `GERAR_EXECUTAVEL_HORUS_BRIDGE.bat`: Compila o `HorusAPIBridge.exe` em arquivo único via PyInstaller (com `pytds` embutido).
- `INICIAR_HORUS_API_BRIDGE.bat`: Abre a interface gráfica para configuração e testes (`T1` API e `T2` SQL).
- `INSTALAR_SERVICO_WINDOWS.bat`: Instala/remove o `HorusAPIBridge.exe --service` para iniciar automaticamente junto com o Windows Server em background.

---

## 🚀 Passo a Passo de Implantação no Servidor Windows do Cliente

1. **No Painel Master do Cronuz B2B**:
   - Acesse **Empresas → [Seller] → Módulos**.
   - Na seção **API Horus B2B Complementar & Agente Bridge (.EXE)**, ative o módulo, defina a **Data de Validade da Licença** e clique em **Salvar & Gerar Chave do .EXE**.
2. **No Servidor Windows do Cliente (onde roda o `API HORUS S.I.G.A`)**:
   - Se desejar gerar o `.exe`, execute `GERAR_EXECUTAVEL_HORUS_BRIDGE.bat`.
   - Abra o aplicativo com `INICIAR_HORUS_API_BRIDGE.bat` (ou `HorusAPIBridge.exe`).
   - Verifique a porta local do Horus (`8060`), usuário e senha internos e clique em **`T1`** (`Webservice iniciado!`).
   - Preencha os dados do SQL Server local (`OPEN-SERVER`, `HORUS_SIGA`, `1433`, usuário `site`) e clique em **`Testar conexão`** (`conectado!`).
   - Informe o E-mail/Senha do Seller (ou Token Direto) e clique em **`Buscar permissão`** (`Autorizado`).
3. **Opcional — Deixar rodando como Serviço do Windows**:
   - Clique com o botão direito em `INSTALAR_SERVICO_WINDOWS.bat` → **Executar como Administrador** → Opção `1`.
