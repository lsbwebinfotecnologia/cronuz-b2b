@echo off
title Gerador de Executavel Windows - Horus API Bridge v1.0.0
cd /d "%~dp0"

echo ============================================================================
echo   COMPILANDO EXECUTAVEL PADRAO .EXE COM LOGO ROXA HORUS B2B - API BRIDGE
echo ============================================================================
echo.

echo [1/4] Encerrando instancias anteriores do HorusAPIBridge.exe...
taskkill /F /IM HorusAPIBridge.exe >nul 2>nul

echo [2/4] Limpando builds anteriores para evitar conflito de DLL...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
if exist "HorusAPIBridge.exe" del /f /q "HorusAPIBridge.exe"
if exist "HorusAPIBridge.spec" del /f /q "HorusAPIBridge.spec"

echo [3/4] Verificando dependencias (PyInstaller + python-tds para SQL Server)...
python -m pip install --upgrade pip pyinstaller python-tds

echo.
echo [4/4] Gerando arquivo unico HorusAPIBridge.exe - aguarde cerca de 30 a 60 segundos...
if exist "horus_icon.ico" goto COM_ICONE
python -m PyInstaller --noconfirm --clean --onefile --windowed --noupx --hidden-import=pytds --name "HorusAPIBridge" horus_api_bridge_app.py
goto VERIFICAR

:COM_ICONE
python -m PyInstaller --noconfirm --clean --onefile --windowed --noupx --hidden-import=pytds --icon "horus_icon.ico" --add-data "horus_icon.ico;." --name "HorusAPIBridge" horus_api_bridge_app.py

:VERIFICAR
echo.
if not exist "dist\HorusAPIBridge.exe" goto ERRO

copy /Y "dist\HorusAPIBridge.exe" ".\HorusAPIBridge.exe" >nul
echo ============================================================================
echo   SUCESSO! O novo executavel HorusAPIBridge.exe v1.0.0 foi gerado em:
echo   %cd%\HorusAPIBridge.exe
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
