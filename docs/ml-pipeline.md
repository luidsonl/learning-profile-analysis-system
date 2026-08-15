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
- Observed schema (V1): 18 columns — `Gender` (Male/Female), `Age` (integer), **15 VARK Likert items rated 1–5**, and a single-modality `Learner` label (e.g., `A`, `K`). The 15 items form three 5-item subscales by wording: **reading/writing** (e.g., "I learn better by reading than by listening to someone"), **aural** (e.g., "I remember things I have heard in class better than things I have read"), and **kinesthetic** (e.g., "I enjoy learning in class by doing experiments"). There is no explicit multimodal label column in the sample; multimodal behavior must be derived from subscale scores.
- The raw file is downloaded into `ml/data/` by a documented script (`ml/data/README.md` explains provenance and download); large/binary artifacts are kept out of git.
- **Domain-gap caveat:** the subjects are university students, not children. The MVP therefore uses an adapted **kids** VARK form in the system and complements training with exported system submissions (see below).

### System-exported snapshots

- Every night an EventBridge schedule triggers the `feature-export` Lambda, which exports labeled VARK submissions (assessments) and observation aggregates into versioned snapshots on the `-data` bucket.
- Snapshot layout and manifest format are the **decoupling contract**: any future model consumes the same snapshots without system changes.

---

## Feature engineering

`ml/features/` transforms raw submissions into feature vectors. The feature schema is recorded in each model's `metadata.json` and in the registry item.

- VARK (primary dataset): the 15 Likert items are ordinal features; per-subscale scores (sum/mean of each 5-item group) are derived, plus `Gender` and `Age` as demographic features. Label = `Learner` (single modality).
- Kids form in the system: same per-modality scoring applied to the adapted kids' items, so model and form remain aligned.
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

## Future directions

### General student categorization (out of MVP scope)

A planned direction is to categorize students from **general student data** — academic history, demographics, attendance, activity/engagement records, and other non-questionnaire signals — not just from filled forms. This is deliberately **not implemented in the MVP**: it depends on data volume the system must first collect (via observations, anamnesis, and behavior checklists). When pursued, it plugs into the same contract: export → offline training → registry → inference. The generic snapshot format and the `anamnesis`/`behavior-checklist`/`socioemotional` forms are the groundwork for it. The **feature catalog and evidence base** for this direction are documented in [Student Data Features](./student-data-features.md).

### Learning styles beyond VARK

The MVP targets the VARK profile (Fleming). Other well-known frameworks could yield additional profiles and use the same pipeline. Overview (see [Learning styles — Wikipedia](https://en.wikipedia.org/wiki/Learning_styles)):

| Framework | Model | Typical instrument |
|-----------|-------|--------------------|
| Kolb experiential learning | Accommodator / Converger / Diverger / Assimilator | Kolb Learning Style Inventory (LSI) |
| Honey & Mumford | Activist / Reflector / Theorist / Pragmatist | Learning Styles Questionnaire (LSQ) |
| Sensory modalities (Barbe) | Visual / Auditory / Kinesthetic (VAK) | — |
| VARK (Fleming) | Visual / Aural / Read-write / Kinesthetic + multimodal | VARK Questionnaire (the MVP profile) |
| Gregorc & Butler | Concrete/Abstract × Sequential/Random | Gregorc Style Delineator |
| Grasha-Riechmann | Avoidant / Participative / Competitive / Collaborative / Dependent / Independent | Grasha-Riechmann Learning Style Scale |
| Felder & Silverman | Active-Reflective / Visual-Verbal / Sensing-Intuition / Sequential-Global | Index of Learning Styles (ILS) |

> **Honesty caveat:** the scientific evidence that matching instruction to a fixed "style" improves outcomes is weak (the "meshing hypothesis" is widely criticized — see the Criticism section of the Wikipedia article). Profiles here should be treated as *preferences and suggestions*, not immutable labels, and the product copy must say so.

### Candidate datasets

Beyond the primary dataset (Armand, Eboue 2021), these public datasets are candidates for new models. Most target **higher education** — the MVP's kids-focused collection remains essential to close the domain gap:

| Dataset | Reference / DOI | Relevance |
|---------|-----------------|-----------|
| Student Learning Interaction and VARK Learning Style Dataset | Alzahrani, N. & El-Sabagh, H. A. (2024). Zenodo, 10.5281/zenodo.16506654 | eLearning interaction logs (13 weeks, 135 students) + VARK labels + midterm scores — predicts style from behavior, not questionnaire |
| DATA SET OF LEARNING STYLE PREFERENCE | Mendeley Data, 10.17632/mtvfdwm3dt.1 | **Elementary-school students** (992, grades 4–5, Indonesia), VAK preferences — closest match to the child persona |
| Anonymized Moodle interaction dataset for learning style prediction (FSLSM) | Zenodo, 10.5281/zenodo.18624789 | Moodle resource/forum logs + aggregated features → Felder-Silverman styles (clustering + stacking ensemble) |
| Learning Style Identification | Ayyoub, H. (2023). IEEE DataPort, 10.21227/7tc4-5841 | FSLSM via the 44-item ILS questionnaire + course event logs (2,300+ learners) |
| Student Performance and Learning Behavior Dataset for Educational Analytics | Zenodo, 10.5281/zenodo.16459132 | 14,003 records: study behavior, engagement, demographics, LearningStyle + grades — general-student categorization |
| Student Performance | Cortez, P. & Silva, A. (2008), UCI ML Repository | Portuguese secondary-school students: demographics + family + school features + grades — general-student categorization baseline |
| Open University Learning Analytics Dataset (OULAD) | Kuzilek, Zdrahal & Fuglik, 2017 | Large VLE interaction + demographics + results — behavioral classification at scale |
| Education Dialogue Dataset | Google Research, arXiv:2405.14655 | Teacher-student dialogues with stated learning preferences — NLU/LLM-based personalization research |

Each candidate should be vetted (license, age range, feature alignment) in `ml/data/README.md` before being used for training.

---

## See Also

- [Architecture](./architecture.md) — overall design, forms engine, decoupling
- [Backend](./backend.md) — predict/inference endpoints
- [DynamoDB Schema](./dynamodb-schema.md) — `MODEL#`, `PRED#`, assessment entities
- [Student Data Features](./student-data-features.md) — feature catalog & sources for general student categorization
