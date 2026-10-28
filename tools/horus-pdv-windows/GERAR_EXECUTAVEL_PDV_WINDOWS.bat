@echo off
title Gerador de Executavel Windows - Horus PDV v1.2.0
cd /d "%~dp0"

echo ============================================================================
echo   COMPILANDO EXECUTAVEL PADRAO .EXE COM LOGO DO HORUS - HORUS PDV v1.2.0
echo ============================================================================
echo.

echo [1/4] Fechando instancia anterior do HorusPDV.exe...
taskkill /F /IM HorusPDV.exe >nul 2>nul

echo [2/4] Limpando builds anteriores para evitar conflito de DLL...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
if exist "HorusPDV.exe" del /f /q "HorusPDV.exe"
if exist "HorusPDV.spec" del /f /q "HorusPDV.spec"

echo [3/4] Verificando PyInstaller...
python -m pip install --upgrade pip pyinstaller

echo.
echo [4/4] Gerando arquivo unico HorusPDV.exe - aguarde cerca de 30 a 60 segundos...
if exist "horus_icon.ico" goto COM_ICONE
python -m PyInstaller --noconfirm --clean --onefile --windowed --noupx --name "HorusPDV" horus_pdv_app.py
goto VERIFICAR

:COM_ICONE
python -m PyInstaller --noconfirm --clean --onefile --windowed --noupx --icon "horus_icon.ico" --add-data "horus_icon.ico;." --name "HorusPDV" horus_pdv_app.py

:VERIFICAR
echo.
if not exist "dist\HorusPDV.exe" goto ERRO

copy /Y "dist\HorusPDV.exe" ".\HorusPDV.exe" >nul
echo ============================================================================
echo   SUCESSO! O novo executavel HorusPDV.exe v1.2.0 foi gerado em:
echo   %cd%\HorusPDV.exe
echo ============================================================================
echo.
pause
exit /b 0

:ERRO
echo ============================================================================
echo   [ERRO] Nao foi possivel gerar o executavel HorusPDV.exe.
echo   Verifique as mensagens acima.
echo ============================================================================
pause
