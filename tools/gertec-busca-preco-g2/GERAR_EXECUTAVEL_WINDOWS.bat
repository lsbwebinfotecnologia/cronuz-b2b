@echo off
chcp 65001 >nul
title Gerador de Executavel Windows (.EXE) com Logo Horus - Cronuz Busca Preco Gertec G2
cd /d "%~dp0"

echo ============================================================================
echo   COMPILANDO EXECUTAVEL PADRAO (.EXE) COM LOGO DO HORUS - GERTEC G2
echo ============================================================================
echo.

echo [1/3] Limpando builds anteriores para evitar conflito de DLL (Ordinal 380)...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
if exist "HorusBuscaPrecoGertecG2.exe" del /f /q "HorusBuscaPrecoGertecG2.exe"
if exist "HorusBuscaPrecoGertecG2.spec" del /f /q "HorusBuscaPrecoGertecG2.spec"

echo [2/3] Verificando PyInstaller...
python -m pip install --upgrade pip pyinstaller

echo.
echo [3/3] Gerando arquivo unico HorusBuscaPrecoGertecG2.exe (aguarde ~30 segundos)...
if exist "horus_icon.ico" (
    python -m PyInstaller --noconfirm --clean --onefile --windowed --noupx --icon "horus_icon.ico" --name "HorusBuscaPrecoGertecG2" cronuz_gertec_app.py
) else (
    python -m PyInstaller --noconfirm --clean --onefile --windowed --noupx --name "HorusBuscaPrecoGertecG2" cronuz_gertec_app.py
)

echo.
if exist "dist\HorusBuscaPrecoGertecG2.exe" (
    copy /Y "dist\HorusBuscaPrecoGertecG2.exe" ".\HorusBuscaPrecoGertecG2.exe" >nul
    echo ============================================================================
    echo   SUCESSO! O executavel unico foi gerado com sucesso em:
    echo   %cd%\HorusBuscaPrecoGertecG2.exe
    echo ============================================================================
    for %%I in ("HorusBuscaPrecoGertecG2.exe") do echo   Tamanho do Executavel: %%~zI bytes
) else (
    echo [ERRO] Nao foi possivel gerar o executavel. Verifique as mensagens acima.
)
pause
