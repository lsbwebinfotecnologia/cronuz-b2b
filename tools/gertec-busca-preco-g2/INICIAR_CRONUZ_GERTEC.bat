@echo off
chcp 65001 >nul
title Cronuz Busca Preco - Servidor Gertec G2
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Python nao encontrado no Windows.
    echo Instale o Python 3.10+ em https://www.python.org/downloads/ marcando a opcao "Add Python to PATH".
    pause
    exit /b 1
)

start "" pythonw cronuz_gertec_app.py
if %errorlevel% neq 0 (
    python cronuz_gertec_app.py
    pause
)
