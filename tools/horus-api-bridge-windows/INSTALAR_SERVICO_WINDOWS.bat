@echo off
title Instalador de Servico Windows - Horus API Bridge v1.0.0
cd /d "%~dp0"

:: Verifica privilegios de Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ============================================================================
    echo   [ATENCAO] Clique com o botao direito neste arquivo e escolha:
    echo   "Executar como Administrador" para instalar o Servico do Windows!
    echo ============================================================================
    pause
    exit /b 1
)

:MENU
cls
echo ============================================================================
echo   GERENCIADOR DE SERVICO WINDOWS — HORUS API BRIDGE (CRONUZ B2B)
echo ============================================================================
echo.
echo   1. Instalar e Iniciar Servico Automatico (Inicia junto com o Windows)
echo   2. Parar e Remover Servico Automatico
echo   3. Verificar Status do Servico
echo   4. Abrir Painel Grafico de Configuracao
echo   5. Sair
echo.
set /p OPCAO="Escolha uma opcao (1-5): "

if "%OPCAO%"=="1" goto INSTALAR
if "%OPCAO%"=="2" goto REMOVER
if "%OPCAO%"=="3" goto STATUS
if "%OPCAO%"=="4" goto PAINEL
if "%OPCAO%"=="5" exit /b 0
goto MENU

:INSTALAR
echo.
if exist "%cd%\HorusAPIBridge.exe" (
    set "CMD_EXEC=\"%cd%\HorusAPIBridge.exe\" --service"
) else (
    set "CMD_EXEC=python \"%cd%\horus_api_bridge_app.py\" --service"
)

echo Registrando Tarefa de Sistema (ONSTART / SYSTEM) para o HorusAPIBridge...
schtasks /Create /TN "CronuzHorusAPIBridge" /TR "%CMD_EXEC%" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
schtasks /Run /TN "CronuzHorusAPIBridge"
echo.
echo [SUCESSO] O HorusAPIBridge foi instalado como servico automatico do Windows
echo e ja foi iniciado em background!
pause
goto MENU

:REMOVER
echo.
schtasks /End /TN "CronuzHorusAPIBridge" >nul 2>nul
schtasks /Delete /TN "CronuzHorusAPIBridge" /F
taskkill /F /IM HorusAPIBridge.exe >nul 2>nul
echo.
echo [REMOVIDO] O servico automatico foi encerrado e removido.
pause
goto MENU

:STATUS
echo.
schtasks /Query /TN "CronuzHorusAPIBridge" /V /FO LIST
echo.
pause
goto MENU

:PAINEL
if exist "%cd%\HorusAPIBridge.exe" (
    start "" "%cd%\HorusAPIBridge.exe"
) else (
    start "" python "%cd%\horus_api_bridge_app.py"
)
exit /b 0
