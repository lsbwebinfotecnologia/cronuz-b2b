@echo off
chcp 65001 >nul
title Gerador de Executavel Windows (.EXE) com Logo Horus - Cronuz Busca Preco Gertec G2
cd /d "%~dp0"

echo ============================================================================
echo   COMPILANDO EXECUTAVEL PADRAO (.EXE) COM LOGO DO HORUS - GERTEC G2
echo ============================================================================
echo.

python -m pip install --upgrade pip pyinstaller
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar o PyInstaller. Verifique se o Python esta instalado.
    pause
    exit /b 1
)

echo.
echo Gerando arquivo HorusBuscaPrecoGertecG2.exe com icone oficial do Horus...
python -m PyInstaller --noconfirm --onefile --windowed --icon "horus_icon.ico" --name "HorusBuscaPrecoGertecG2" cronuz_gertec_app.py

echo.
if exist "dist\HorusBuscaPrecoGertecG2.exe" (
    copy /Y "dist\HorusBuscaPrecoGertecG2.exe" ".\HorusBuscaPrecoGertecG2.exe" >nul
    echo ============================================================================
    echo   SUCESSO! O executavel padrao foi gerado com o icone do Horus em:
    echo   %cd%\HorusBuscaPrecoGertecG2.exe
    echo   Voce pode enviar apenas esse arquivo .EXE para qualquer cliente Windows!
    echo ============================================================================
) else (
    echo [ERRO] Nao foi possivel gerar o executavel.
)
pause
