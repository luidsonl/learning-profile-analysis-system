# ML Pipeline — Learning Profile Analysis System

## Overview

Machine learning is **fully decoupled** from the running system. The deployed AWS stack never trains a model; it only *exports data snapshots* and *serves predictions* from packaged artifacts. All training happens **offline** (a local machine or CI) in the Python pipeline under `ml/`.

This separation is intentional and is the contract that makes future models possible:

- The system collects data through **forms** (see [Architecture — Forms Engine](./architecture.md#forms-engine)).
- A **profile** is a characterization of a child derived from their form responses (e.g., the VARK learning profile from the `vark-kids` form).
- Models are trained offline to predict profile labels from features. Adding a new form → profile → model later requires no changes to the running system, only to the offline pipeline and an inference redeploy.

---

## Data flow

```
  System (DynamoDB) ──► feature-export Lambda (nightly, EventBridge) ──► S3 (-data bucket)
                                                                        snapshots: Parquet + manifest
                                                                              │
                          ┌───────────────────────────────────────────────────┤
                          ▼ (offline — local machine or CI, never in AWS)
                 ┌──────────────────┐
                 │  ml/ pipeline    │  1. read public dataset + exported snapshots
                 │  (Python/sklearn)│  2. feature engineering
                 │                  │  3. train + k-fold CV + metrics
                 │                  │  4. write model.joblib + metadata.json
                 └────────┬─────────┘
                          ▼
                  S3 (-data bucket): s3://…/models/<name>/<version>/
                          │
                          ▼
                  Registry (DynamoDB): MODEL#<name>#<version>  (metrics, schema, artifact key)
                          │
                          ▼ (deploy step)
                  Inference Lambda (Python, packaged model)  ← POST /api/children/:id/predict
```

---

## Datasets

### Public dataset (primary training source)

- **Armand, Eboue (2021), "Student Learning Preferences", Mendeley Data, V1, DOI: 10.17632/bwrr6zypcj.1** (License CC BY 4.0)
- VARK questionnaire data: ~245 records, 16 questions × 4 options (V/A/R/K), with a multimodal label.
- The raw file is downloaded into `ml/data/` by a documented script (`ml/data/README.md` explains provenance and download); large/binary artifacts are kept out of git.
- **Domain-gap caveat:** the subjects are university students, not children. The MVP therefore uses an adapted **kids** VARK form in the system and complements training with exported system submissions (see below).

### System-exported snapshots

- Every night an EventBridge schedule triggers the `feature-export` Lambda, which exports labeled VARK submissions (assessments) and observation aggregates into versioned snapshots on the `-data` bucket.
- Snapshot layout and manifest format are the **decoupling contract**: any future model consumes the same snapshots without system changes.

---

## Feature engineering

`ml/features/` transforms raw submissions into feature vectors. The feature schema is recorded in each model's `metadata.json` and in the registry item.

- VARK: one-hot encoding per question/option plus per-modality totals (V, A, R, K); optional demographic fields when present.
- Snapshot features are kept generic so future profiles (giftedness, difficulty, socioemotional) can reuse the export without new system work.

---

## Training

`ml/train/` implements the pipeline:

- Frameworks: scikit-learn (multi-label classifiers — Binary Relevance / MLkNN, plus a baseline Random Forest).
- Validation: k-fold cross-validation with stratified folds per label.
- Metrics: accuracy, macro/weighted F1, **Hamming loss**, per-label precision/recall; a written evaluation report is stored alongside the artifact.
- Output: `model.joblib` + `metadata.json` (model name, version, feature schema, metrics, trained_at, dataset hash) uploaded to `s3://learning-profile-data/models/<name>/<version>/`.

---

## Model registry

A `MODEL#<name>#<version>` item in DynamoDB records:

| Attribute | Description |
|-----------|-------------|
| `name` | Model identifier (e.g. `vark-predictor`) |
| `version` | Semantic version |
| `status` | `latest` | `superseded` |
| `metrics` | Offline evaluation results |
| `feature_schema` | Input feature names/encoding |
| `artifact_key` | S3 key of the packaged artifact |
| `trained_at` | Training timestamp |
| `dataset_ref` | Snapshot manifest or public dataset reference |

The inference Lambda is deployed with the artifact of the `latest` version.

---

## Inference

- A Python-runtime Lambda bundles the packaged model (small enough for a 1 GB deployment package with dependencies).
- `POST /api/children/:id/predict` loads the child's latest applicable form responses, runs the model, and returns the profile prediction with confidence, persisting a `PRED#` item (see [DynamoDB Schema](./dynamodb-schema.md)).
- Heuristic indicators (e.g., giftedness/difficulty in the MVP) are rule-based companions to ML predictions, not trained models.

---

## Retraining loop

```
  1. Nightly export writes a new snapshot manifest.
  2. Offline (engineer or CI): if the manifest shows ≥20 new labeled samples, run ml/ pipeline.
  3. Register the new MODEL#<name>#<version>, mark previous as superseded.
  4. Redeploy the inference Lambda with the new artifact.
```

Retraining is **never scheduled inside AWS** — it is a deliberate human/CI step.

---

## Extending with future models

The pipeline is designed so new classifications are additive:

1. **New form → new profile:** add a curated form (see Architecture — Forms Engine); submissions are stored by the generic engine.
2. **New model:** add a model under `ml/` (features + train + evaluate), train offline on the exported snapshots, register it in the registry.
3. **Deploy:** package and redeploy the inference Lambda with the new artifact; expose prediction through the existing predict endpoint or a new one.
4. No changes to the running system's data model are required — the snapshot contract already carries the data.

Examples of future models: giftedness indicator, learning-difficulty indicator, socioemotional profile — all driven by the same form→snapshot→train→serve loop.

---

## See Also

- [Architecture](./architecture.md) — overall design, forms engine, decoupling
- [Backend](./backend.md) — predict/inference endpoints
- [DynamoDB Schema](./dynamodb-schema.md) — `MODEL#`, `PRED#`, assessment entities
