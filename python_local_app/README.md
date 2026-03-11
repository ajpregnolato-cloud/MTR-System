# MTR Local App (Python + CustomTkinter)

Sim: para o seu caso, o correto é escrever **novo código local-first** em Python.

Este diretório traz um ponto de partida real para isso.

## Setup

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
