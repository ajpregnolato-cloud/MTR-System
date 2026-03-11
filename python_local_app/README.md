# MTR Local App (Python + CustomTkinter)

Sim: para o seu caso, o correto é escrever **novo código local-first** em Python.

## Arquivos que você precisa baixar

Se você não quiser baixar o repositório inteiro, pegue **esta pasta completa** `python_local_app/` com estes arquivos:

- `python_local_app/app.py`
- `python_local_app/excel_service.py`
- `python_local_app/models.py`
- `python_local_app/requirements.txt`
- `python_local_app/install_dependencies.bat`
- `python_local_app/run_app.bat`
- `python_local_app/README.md`

> Importante: mantenha todos no mesmo diretório `python_local_app`.

## Setup automático (Windows)

1. Abra a pasta `python_local_app`
2. Execute `install_dependencies.bat`
3. Depois execute `run_app.bat`

## Setup manual (Linux/macOS/Windows)

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r python_local_app/requirements.txt
python python_local_app/app.py
```

## O que já está implementado

- Interface desktop com `customtkinter`
- Seleção de arquivo Excel
- Processamento local da primeira aba
- Regra de filtro: `Situação = SALVO`
- Contagem de MTRs únicos por `Nº MTR`
- Separação de camadas:
  - `app.py` (UI)
  - `excel_service.py` (regra de importação)
  - `models.py` (modelo de dados)

## Próximos passos

1. Persistência local com SQLite
2. Edição de MTRs e itens na UI
3. Validação completa das regras
4. Envio direto para SINIR/IEMA
5. Geração de logs XLSX/TXT
6. Empacotar executável com PyInstaller
