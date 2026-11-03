@echo off
title Liberar Antivirus, Windows Defender e Pasta Segura C:\HorusBridge
cd /d "%~dp0"

echo ============================================================================
echo   LIBERACAO DE ANTIVIRUS / WINDOWS DEFENDER / SMART SCREEN - HORUS BRIDGE
echo ============================================================================
echo.

:: Verifica privilegios de Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [AVISO] Solicitando permissao de Administrador para liberar o Windows Defender...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo [1/5] Criando pasta segura C:\HorusBridge (fora do Desktop monitorado)...
if not exist "C:\HorusBridge" mkdir "C:\HorusBridge"
if not exist "C:\HorusBridge\logs" mkdir "C:\HorusBridge\logs"

echo [2/5] Adicionando exclusoes no Windows Defender (Pasta atual e C:\HorusBridge)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Add-MpPreference -ExclusionPath '%~dp0' -ErrorAction SilentlyContinue; Add-MpPreference -ExclusionPath 'C:\HorusBridge' -ErrorAction SilentlyContinue; Add-MpPreference -ExclusionProcess 'HorusAPIBridge.exe' -ErrorAction SilentlyContinue; Write-Host 'Exclusoes do Windows Defender aplicadas com sucesso!' } catch { Write-Host 'Aviso: Antivirus de terceiros detectado ou Defender gerenciado.' }"

echo [3/5] Removendo bloqueio Zone.Identifier (arquivos copiados via RDP/Download)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0' -Recurse | Unblock-File -ErrorAction SilentlyContinue"

echo [4/5] Liberando regra de saida no Firewall do Windows (Portas 80 e 443)...
netsh advfirewall firewall delete rule name="Horus API Bridge B2B" >nul 2>&1
netsh advfirewall firewall add rule name="Horus API Bridge B2B" dir=out action=allow program="%~dp0HorusAPIBridge.exe" enable=yes >nul 2>&1
netsh advfirewall firewall add rule name="Horus API Bridge B2B (C:\HorusBridge)" dir=out action=allow program="C:\HorusBridge\HorusAPIBridge.exe" enable=yes >nul 2>&1

echo [5/5] Copiando arquivos para C:\HorusBridge...
if exist "HorusAPIBridge.exe" copy /Y "HorusAPIBridge.exe" "C:\HorusBridge\HorusAPIBridge.exe" >nul
if exist "config_horus_bridge.json" copy /Y "config_horus_bridge.json" "C:\HorusBridge\config_horus_bridge.json" >nul
if exist "horus_icon.ico" copy /Y "horus_icon.ico" "C:\HorusBridge\horus_icon.ico" >nul
if exist "INSTALAR_SERVICO_WINDOWS.bat" copy /Y "INSTALAR_SERVICO_WINDOWS.bat" "C:\HorusBridge\INSTALAR_SERVICO_WINDOWS.bat" >nul
if exist "INICIAR_HORUS_API_BRIDGE.bat" copy /Y "INICIAR_HORUS_API_BRIDGE.bat" "C:\HorusBridge\INICIAR_HORUS_API_BRIDGE.bat" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path 'C:\HorusBridge' -Recurse | Unblock-File -ErrorAction SilentlyContinue"

echo.
echo ============================================================================
echo   CONCLUIDO COM SUCESSO!
echo   - Pasta segura liberada em: C:\HorusBridge
echo   - Execute o aplicativo a partir de C:\HorusBridge\HorusAPIBridge.exe
echo ============================================================================
echo.
pause
