# ml/ — Offline ML Pipeline

Treino **100% offline** (local). Nada aqui roda na AWS. Cada modelo treinado é
empacotado dentro da Lambda Python de inferência (`sam-app/src/inference/`) e
deployado junto com o SAM — sem SQS, sem S3 em runtime, sem treino no cloud.

A pipeline é **multi-modelo por adição**: um modelo por formulário, registrado em
`features/prepare.py` (`MODELS`). Cada um tem seu dataset, schema de features e
labelMap; o `formId` decide qual modelo a Lambda carrega em runtime.

## Registro de modelos (`features/prepare.py`)

Para adicionar um modelo novo (`socioemotional`, por exemplo):

1. Commit o dataset público em `datasets/<model>/data.csv` (+ `citation.txt`).
2. Registre um `ModelConfig` em `MODELS` — `formId` (o formulário que dispara),
   layout posicional do CSV (`item_start`/`item_count`/`label_col`), ids das
   perguntas, grupos e `label_map` (rótulo do dataset → vocabulário do sistema).
3. Treine e empacote (abaixo).

## Uso

```bash
make setup                 # venv + dependências
make train                 # prepara → treina → avalia (MODEL=vark default)
make train MODEL=socioemotional
make package               # copia model.joblib + meta.json para src/inference/models/<formId>/
make package-all           # empacota todos os modelos registrados
make sanity                # pontua 5 linhas reais com o modelo empacotado (MODEL=vark default)
```

Depois de `make package`/`make package-all`: `sam build && sam deploy`.

## Layout

| Diretório | Papel |
|---|---|
| `features/prepare.py` | Registro de modelos + carga posicional dos CSVs (schema de features por posição → questionId) |
| `train/train.py` | Pipeline StandardScaler + LogisticRegression balanceada; CV estratificada; grava em `build/<model>/` |
| `evaluate/report.py` | Acurácia, macro-F1 (labels desbalanceados), relatório por classe, matriz de confusão |
| `serve/package.py` | Gera `meta.json` (formId, modelo, ordem das features, labelMap, métricas, hash do dataset) e empacota em `src/inference/models/<formId>/` |
| `serve/sanity.py` | Smoke test local do modelo empacotado |
| `src/inference/handler.py` | Lambda multi-modelo: roteia por `formId` e grava `PRED#` |

`build/`, `.venv/` e `*.joblib` nunca vão para o git — exceto os artefatos
empacotados de serving (`src/inference/models/<formId>/`), commitados por decisão
do owner (ver `specs/security.md`).