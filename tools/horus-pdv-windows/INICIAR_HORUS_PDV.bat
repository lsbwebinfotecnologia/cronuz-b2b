@echo off
chcp 65001 >nul
title Horus PDV - Frente de Caixa Omnichannel
cd /d "%~dp0"

if exist "HorusPDV.exe" (
    start "" "HorusPDV.exe"
    exit /b 0
)

where pythonw >nul 2>nul
if %errorlevel% equ 0 (
    start "" pythonw "horus_pdv_app.py"
) else (
    python "horus_pdv_app.py"
)
