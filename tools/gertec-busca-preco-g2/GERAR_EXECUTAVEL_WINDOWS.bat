@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Gerador de Executavel Windows (.EXE) - Horus Busca Preco Gertec G2

echo ============================================================================
echo   COMPILANDO EXECUTAVEL PADRAO (.EXE) COM LOGO DO HORUS - GERTEC G2
echo   Pasta atual: %cd%
echo ============================================================================
echo.

REM 1. Detecta automaticamente o interpretador Python instalado no Windows
set "PY_CMD="

python --version >nul 2>&1
if not errorlevel 1 (
    set "PY_CMD=python"
    goto :FOUND_PYTHON
)

py -3 --version >nul 2>&1
if not errorlevel 1 (
    set "PY_CMD=py -3"
    goto :FOUND_PYTHON
)

py --version >nul 2>&1
if not errorlevel 1 (
    set "PY_CMD=py"
    goto :FOUND_PYTHON
)

for /d %%D in ("%LocalAppData%\Programs\Python\Python3*") do (
    if exist "%%D\python.exe" (
        set "PY_CMD="%%D\python.exe""
        goto :FOUND_PYTHON
    )
)

for /d %%D in ("C:\Python3*" "C:\Program Files\Python3*") do (
    if exist "%%D\python.exe" (
        set "PY_CMD="%%D\python.exe""
        goto :FOUND_PYTHON
    )
)

echo [ERRO] Python 3 nao foi encontrado no PATH nem nas pastas padrao do Windows.
echo Instale o Python 3 em https://www.python.org/downloads/ marcando "Add Python to PATH".
echo.
pause
exit /b 1

:FOUND_PYTHON
echo [OK] Python detectado: !PY_CMD!
!PY_CMD! --version
echo.

if not exist "cronuz_gertec_app.py" (
    echo [ERRO] O arquivo "cronuz_gertec_app.py" nao foi encontrado nesta pasta:
    echo        %cd%
    echo Certifique-se de extrair TODOS os arquivos do ZIP na mesma pasta antes de rodar.
    echo.
    pause
    exit /b 1
)

echo [1/3] Limpando builds anteriores para evitar conflito de DLL (Ordinal 380)...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
if exist "HorusBuscaPrecoGertecG2.exe" del /f /q "HorusBuscaPrecoGertecG2.exe"
if exist "HorusBuscaPrecoGertecG2.spec" del /f /q "HorusBuscaPrecoGertecG2.spec"

echo.
echo [2/3] Verificando / instalando PyInstaller e Requests...
!PY_CMD! -m pip install --upgrade pip pyinstaller requests
if errorlevel 1 (
    echo [AVISO] Falha ao atualizar pip, tentando instalar pyinstaller e requests...
    !PY_CMD! -m pip install pyinstaller requests
)

echo.
echo [3/3] Gerando arquivo unico HorusBuscaPrecoGertecG2.exe (aguarde de 30 a 60 segundos)...
if exist "horus_icon.ico" (
    !PY_CMD! -m PyInstaller --noconfirm --clean --onefile --windowed --noupx --icon "horus_icon.ico" --name "HorusBuscaPrecoGertecG2" "cronuz_gertec_app.py"
) else (
    !PY_CMD! -m PyInstaller --noconfirm --clean --onefile --windowed --noupx --name "HorusBuscaPrecoGertecG2" "cronuz_gertec_app.py"
)

echo.
if exist "dist\HorusBuscaPrecoGertecG2.exe" (
    copy /Y "dist\HorusBuscaPrecoGertecG2.exe" ".\HorusBuscaPrecoGertecG2.exe" >nul
    netsh advfirewall firewall delete rule name="Horus Cronuz Gertec TCP 6500" >nul 2>&1
    netsh advfirewall firewall add rule name="Horus Cronuz Gertec TCP 6500" dir=in action=allow protocol=TCP localport=6500 profile=any enable=yes >nul 2>&1
    netsh advfirewall firewall delete rule name="Horus Cronuz Gertec TCP 16510" >nul 2>&1
    netsh advfirewall firewall add rule name="Horus Cronuz Gertec TCP 16510" dir=in action=allow protocol=TCP localport=16510 profile=any enable=yes >nul 2>&1
    echo ============================================================================
    echo   SUCESSO! O executavel unico v1.3.0 foi gerado com sucesso em:
    echo   %cd%\HorusBuscaPrecoGertecG2.exe
    echo ============================================================================
    for %%I in ("HorusBuscaPrecoGertecG2.exe") do echo   Tamanho do Executavel: %%~zI bytes
) else (
    echo ============================================================================
    echo   [ERRO] Nao foi possivel gerar o executavel HorusBuscaPrecoGertecG2.exe.
    echo   Revise as mensagens exibidas acima.
    echo ============================================================================
)
echo.
pause
