@echo off
title Horus PDV v1.2.0 - Frente de Caixa Omnichannel
cd /d "%~dp0"

if exist "horus_pdv_app.py" goto RODAR_PY
if exist "HorusPDV.exe" goto RODAR_EXE
goto RODAR_PY

:RODAR_PY
where pythonw >nul 2>nul
if %errorlevel% equ 0 goto COM_PYTHONW
where python >nul 2>nul
if %errorlevel% equ 0 goto COM_PYTHON
if exist "HorusPDV.exe" goto RODAR_EXE
echo [ERRO] Python ou HorusPDV.exe nao encontrado nesta pasta.
pause
exit /b 1

:COM_PYTHONW
start "" pythonw "horus_pdv_app.py"
exit /b 0

:COM_PYTHON
start "" python "horus_pdv_app.py"
exit /b 0

:RODAR_EXE
start "" "HorusPDV.exe"
exit /b 0
