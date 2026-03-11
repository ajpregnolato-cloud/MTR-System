# Análise técnica: versão local em Python com CustomTkinter

## Objetivo

Você quer **rodar localmente** e **não hospedar** a solução. Nesse cenário, Python + `customtkinter` é uma ótima direção.

## Resposta curta

**Sim, o correto para seu objetivo é escrever novo código em Python local-first**, porque você não quer hospedar.

É possível e faz sentido arquitetural.

A melhor abordagem para seu objetivo é:

1. **Versão local-first (recomendada)**: app desktop em Python com processamento local e opcionalmente envio direto para SINIR/IEMA.
2. **Híbrida local**: desktop Python chamando um backend local (localhost), caso queira reaproveitar regras Node no curto prazo.

---

## O que já existe hoje e pode ser portado

As regras centrais atuais são:

- Importação de Excel e filtro por `Situação = SALVO`
- Estruturação de MTR + itens
- Validações de negócio
- Envio em lote
- Geração de logs XLSX/TXT

Isso pode ser migrado para Python gradualmente, começando pelo fluxo de importação + validação local.

---

## Arquitetura recomendada (sem hospedagem)

### Opção A — 100% desktop local (ideal para seu caso)

- UI: `customtkinter`
- Regras: módulos Python internos
- Persistência: `sqlite` local
- Excel: `openpyxl` (ou `pandas`)
- HTTP externo (SINIR/IEMA): `requests`
- Empacotamento: `PyInstaller`

**Vantagens:**
- Não depende de servidor
- Instala e roda na máquina do usuário
- Custo de infraestrutura zero

### Opção B — desktop + backend local

- UI Python chama API em `http://localhost`
- Backend pode ser o atual (Node) ou futuro FastAPI

**Quando usar:** se quiser manter compatibilidade com o backend atual por mais tempo.

---

## Roadmap sugerido (local-first)

1. **MVP desktop local**
   - Importar Excel
   - Mostrar lista de MTRs
   - Executar validações locais
2. **Persistência local**
   - Salvar lotes e histórico em SQLite
3. **Integração externa**
   - Envio real para SINIR/IEMA
4. **Distribuição**
   - Build executável com PyInstaller

---

## Sobre o protótipo adicionado neste repositório

Foi incluído um protótipo inicial em `python_local_app/` para validar a estratégia local:

- Seleciona Excel
- Processa a primeira aba
- Filtra `Situação = SALVO`
- Conta MTRs únicos por `Nº MTR`
- Exibe resultado na interface desktop

Esse protótipo é o ponto de partida para evoluir até a versão final totalmente local.

---

## Conclusão

Como você não quer hospedar, a melhor escolha é **versão 100% local em Python + customtkinter**.
A partir daqui, dá para evoluir o protótipo em ciclos curtos até substituir o fluxo web atual.
