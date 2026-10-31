@echo off
chcp 65001 >nul
title Horus / Cronuz Busca Preco - Servidor Gertec Universal v1.3.0
cd /d "%~dp0"

netsh advfirewall firewall delete rule name="Horus Cronuz Gertec TCP 6500" >nul 2>&1
netsh advfirewall firewall add rule name="Horus Cronuz Gertec TCP 6500" dir=in action=allow protocol=TCP localport=6500 profile=any enable=yes >nul 2>&1
netsh advfirewall firewall delete rule name="Horus Cronuz Gertec TCP 16510" >nul 2>&1
netsh advfirewall firewall add rule name="Horus Cronuz Gertec TCP 16510" dir=in action=allow protocol=TCP localport=16510 profile=any enable=yes >nul 2>&1

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
