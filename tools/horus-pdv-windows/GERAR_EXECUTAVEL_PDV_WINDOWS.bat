@echo off
chcp 65001 >nul
title Gerador de Executavel Windows - Horus PDV
cd /d "%~dp0"

echo ============================================================================
echo   COMPILANDO EXECUTAVEL PADRAO (.EXE) COM LOGO DO HORUS - HORUS PDV
echo ============================================================================
echo.

echo [1/3] Limpando builds anteriores para evitar conflito de DLL...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
if exist "HorusPDV.exe" del /f /q "HorusPDV.exe"
if exist "HorusPDV.spec" del /f /q "HorusPDV.spec"

echo [2/3] Verificando PyInstaller...
python -m pip install --upgrade pip pyinstaller

echo.
echo [3/3] Gerando arquivo unico HorusPDV.exe - aguarde cerca de 30 segundos...
if exist "horus_icon.ico" goto COM_ICONE
python -m PyInstaller --noconfirm --clean --onefile --windowed --noupx --name "HorusPDV" horus_pdv_app.py
goto VERIFICAR

:COM_ICONE
python -m PyInstaller --noconfirm --clean --onefile --windowed --noupx --icon "horus_icon.ico" --name "HorusPDV" horus_pdv_app.py

:VERIFICAR
echo.
if not exist "dist\HorusPDV.exe" goto ERRO

copy /Y "dist\HorusPDV.exe" ".\HorusPDV.exe" >nul
echo ============================================================================
echo   SUCESSO! O executavel unico foi gerado com sucesso em:
echo   %cd%\HorusPDV.exe
echo ============================================================================
for %%I in ("HorusPDV.exe") do echo   Tamanho do Executavel: %%~zI bytes
echo.
pause
exit /b 0

:ERRO
echo ============================================================================
echo   [ERRO] Nao foi possivel gerar o executavel HorusPDV.exe.
echo   Verifique as mensagens acima.
echo ============================================================================
pause
