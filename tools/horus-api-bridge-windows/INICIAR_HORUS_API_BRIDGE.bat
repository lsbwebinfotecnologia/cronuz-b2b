@echo off
title Horus API Bridge — Cronuz B2B
cd /d "%~dp0"

if exist "HorusAPIBridge.exe" (
    start "" "HorusAPIBridge.exe"
    exit /b 0
)

echo Iniciando Horus API Bridge via Python...
python horus_api_bridge_app.py
pause
