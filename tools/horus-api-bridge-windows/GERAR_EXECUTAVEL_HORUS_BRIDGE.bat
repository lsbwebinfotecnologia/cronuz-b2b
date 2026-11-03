@echo off
title Gerador de Executavel Windows - Horus API Bridge v1.0.2 (Anti-Falso-Positivo)
cd /d "%~dp0"

echo ============================================================================
echo   COMPILANDO EXECUTAVEL PADRAO .EXE COM LOGO ROXA HORUS B2B - API BRIDGE
echo   (Com Metadados Oficiais Windows PE para evitar bloqueio de Antivirus)
echo ============================================================================
echo.

echo [1/5] Encerrando instancias anteriores do HorusAPIBridge.exe...
taskkill /F /IM HorusAPIBridge.exe >nul 2>nul

echo [2/5] Limpando builds anteriores para evitar conflito de DLL...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
if exist "HorusAPIBridge.exe" del /f /q "HorusAPIBridge.exe"
if exist "HorusAPIBridge.spec" del /f /q "HorusAPIBridge.spec"

echo [3/5] Verificando dependencias (PyInstaller + python-tds para SQL Server)...
python -m pip install --upgrade pip pyinstaller python-tds

echo.
echo [4/5] Gerando HorusAPIBridge.exe (Arquivo Unico com Assinatura de Versao PE)...
set VER_ARG=
if exist "version_info.txt" set VER_ARG=--version-file "version_info.txt"

if exist "horus_icon.ico" goto COM_ICONE
python -m PyInstaller --noconfirm --clean --onefile --windowed --noupx %VER_ARG% --hidden-import=pytds --name "HorusAPIBridge" horus_api_bridge_app.py
goto GERAR_PASTA

:COM_ICONE
python -m PyInstaller --noconfirm --clean --onefile --windowed --noupx %VER_ARG% --hidden-import=pytds --icon "horus_icon.ico" --add-data "horus_icon.ico;." --name "HorusAPIBridge" horus_api_bridge_app.py

:GERAR_PASTA
if exist "dist\HorusAPIBridge.exe" copy /Y "dist\HorusAPIBridge.exe" ".\HorusAPIBridge.exe" >nul

echo.
echo [5/5] Gerando tambem versao em Pasta (HorusAPIBridge_Pasta - 100%% imune a bloqueio de %TEMP% por Antivirus)...
if exist "horus_icon.ico" (
    python -m PyInstaller --noconfirm --clean --onedir --windowed --noupx %VER_ARG% --hidden-import=pytds --icon "horus_icon.ico" --add-data "horus_icon.ico;." --name "HorusAPIBridge_Safe" horus_api_bridge_app.py
) else (
    python -m PyInstaller --noconfirm --clean --onedir --windowed --noupx %VER_ARG% --hidden-import=pytds --name "HorusAPIBridge_Safe" horus_api_bridge_app.py
)
if exist "dist\HorusAPIBridge_Safe\HorusAPIBridge_Safe.exe" (
    copy /Y "dist\HorusAPIBridge_Safe\HorusAPIBridge_Safe.exe" "dist\HorusAPIBridge_Safe\HorusAPIBridge.exe" >nul
)

echo.
if not exist "HorusAPIBridge.exe" goto ERRO

echo ============================================================================
echo   SUCESSO! Foram geradas as duas opcoes prontas para uso:
echo   1) Arquivo Unico: %cd%\HorusAPIBridge.exe
echo   2) Versao Pasta Anti-Antivirus: %cd%\dist\HorusAPIBridge_Safe\HorusAPIBridge.exe
echo   DICA: No servidor do cliente, execute antes LIBERAR_ANTIVIRUS_E_FIREWALL.bat
echo ============================================================================
echo.
pause
exit /b 0

:ERRO
echo ============================================================================
echo   [ERRO] Nao foi possivel gerar o executavel HorusAPIBridge.exe.
echo   Verifique as mensagens acima.
echo ============================================================================
pause
