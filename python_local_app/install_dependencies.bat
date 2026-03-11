@echo off
setlocal

REM Instala dependencias do MTR Local App no Windows
REM Uso: execute este arquivo com duplo clique ou via terminal

cd /d "%~dp0"

echo [1/4] Verificando Python...
py --version >nul 2>&1
if %errorlevel%==0 (
  set "PY_CMD=py"
) else (
  python --version >nul 2>&1
  if %errorlevel%==0 (
    set "PY_CMD=python"
  ) else (
    echo ERRO: Python nao encontrado.
    echo Instale Python 3.10+ e tente novamente.
    pause
    exit /b 1
  )
)

echo [2/4] Criando ambiente virtual (.venv)...
%PY_CMD% -m venv .venv
if errorlevel 1 (
  echo ERRO ao criar ambiente virtual.
  pause
  exit /b 1
)

echo [3/4] Instalando dependencias...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
  echo ERRO ao instalar dependencias.
  pause
  exit /b 1
)

echo [4/4] Concluido.
echo Para rodar o app: .venv\Scripts\python app.py
pause
