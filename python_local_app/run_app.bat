@echo off
setlocal

cd /d "%~dp0"

if not exist .venv\Scripts\python.exe (
  echo Ambiente virtual nao encontrado.
  echo Execute primeiro: install_dependencies.bat
  pause
  exit /b 1
)

echo Iniciando MTR Local App...
.venv\Scripts\python app.py
