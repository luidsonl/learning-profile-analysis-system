# ml/ — Offline ML Pipeline

Treino **100% offline** (local). Nada aqui roda na AWS. O artefato treinado é
empacotado dentro da Lambda Python de inferência (`sam-app/src/inference/`) e
deployado junto com o SAM — sem SQS, sem S3 em runtime, sem treino no cloud.

## Dataset

`datasets/vark/data.csv` (Armand & Eboue 2021, CC BY 4.0 — ver `citation.txt`).
1210 registros; 15 itens Likert 1–5 (leitura 0–4, auditivo 5–9, cinestésico
10–14 por posição) + rótulo `Learner` (A/K/V, sem classe R — o mapa `V→R`
é aplicado no serving). Duas colunas compartilham o mesmo header: carga
**posicional**, nunca por nome.

## Uso

```bash
make setup                 # venv + dependências
make train                 # prepara → treina → avalia (CV estratificada)
make package               # copia model.joblib + meta.json para sam-app/src/inference/model/
make sanity                # pontua 5 linhas reais com o modelo empacotado
```

Depois de `make package`: `sam build && sam deploy` e registrar a versão com
`sam-app/scripts/register-model.mjs`.

## Layout

| Diretório | Papel |
|---|---|
| `features/prepare.py` | Carga posicional do CSV, schema de features (posição → questionId), mapa de rótulos |
| `train/train.py` | Pipeline StandardScaler + LogisticRegression balanceada; CV estratificada |
| `evaluate/report.py` | Acurácia, macro-F1 (labels desbalanceados), relatório por classe, matriz de confusão |
| `serve/package.py` | Gera `meta.json` (ordem das features, labelMap, métricas, hash do dataset) e empacota |
| `serve/sanity.py` | Smoke test local do modelo empacotado |

`build/`, `.venv/` e `*.joblib` nunca vão para o git.
