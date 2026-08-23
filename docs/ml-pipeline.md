# ML Pipeline — Learning Profile Analysis System

## Overview

Machine learning is **fully decoupled** from the running system. The deployed AWS stack **never trains** a model; all training happens **offline** (a local machine) in the Python pipeline under `ml/`. The trained artifact is **bundled directly into** a Python-runtime inference Lambda deployed together with the SAM app — there is no runtime download, no queue, and no event-driven magic in the ML path.

### Operating principles (contract)

1. **Training is 100% offline** — `ml/` runs locally (`make train`). No AWS resource ever trains or scores during training.
2. **The inference Lambda only classifies and persists.** It loads a joblib model bundled in its deployment package, scores features, and writes the resulting `PRED#` item to DynamoDB. Nothing else.
3. **Trigger = asynchronous invoke on form submission.** After the Forms Lambda stores a *new* submission, it fires `lambda.invoke(InvocationType: "Event")` at the inference function — fire-and-forget. **No SQS**, no streams, no EventBridge in the ML path. The user never waits for inference.
4. **Form data and inference data are distinct entities**: submissions (`SUBMISSION#`) are human input; predictions (`PRED#`) are machine-generated output written solely by the inference function (`createdBy: system:inference`). Assessments (`ASSESS#`, rule-based classification from the forms engine) are also human-flow data and are separate from predictions.
5. **Failure is silent and safe**: if the inference function fails or is unreachable, the submission stands and no prediction is created. Predictions are eventually available via `GET /api/children/:id/predictions`.
6. **Extensible by addition**: a future form/model pairs a curated form definition with a new offline pipeline and (if needed) another inference function — no changes to the running API.

This separation is intentional and is the contract that makes future models possible:

- The system collects data through **forms** (see [Architecture — Forms Engine](./architecture.md#forms-engine)).
- A **profile** is a characterization of a child derived from their form responses (e.g., the VARK learning profile from the `vark-kids` form).
- Models are trained offline to predict profile labels from features. Adding a new form → profile → model later requires no changes to the running system, only to the offline pipeline and an inference redeploy.

---

## Data flow

```
  datasets/vark/data.csv (committed, public CC BY 4.0)
          │
          ▼  (offline — local machine, never in AWS)
  ┌─────────────────────┐
  │  ml/ pipeline       │  1. prepare (positional load, X = 15 Likert items, y = Learner)
  │  (Python/sklearn)   │  2. train (LogisticRegression, stratified CV)
  │                     │  3. evaluate (accuracy, macro-F1, per-class report)
  │                     │  4. package → model.joblib + meta.json copied INTO the Lambda source
  └─────────┬───────────┘
            ▼
  sam-app/src/inference/ (model bundled in deployment package)
            │
            ▼  sam build && sam deploy

  ──────────────── runtime ────────────────

  Persona ──► POST /api/children/:id/forms/:formId/responses ──► Forms Lambda
                                                                    │ stores SUBMISSION#
                                                                    │ fire-and-forget:
                                                                    ▼
                                                    lambda.invoke(Event) ──► Inference Lambda (Python)
                                                                                │ scores features,
                                                                                ▼
                                                                        DynamoDB (PRED# item)

  Scoped reads ──► GET /api/children/:id/predictions ──► PRED# history (autonomy-gated payload)
```

> The nightly `feature-export` snapshot pipeline described below is a **planned future phase** (the Lambda exists as a stub). The v0 integration above does not depend on it.

---

## Datasets

### Public dataset (primary training source)

- **Armand, Eboue (2021), "Student Learning Preferences", Mendeley Data, V1, DOI: 10.17632/bwrr6zypcj.1** (License CC BY 4.0)
- **Committed in this repository at `datasets/vark/data.csv` by owner decision** (public dataset, CC BY 4.0 permits redistribution with attribution — provenance kept in `datasets/vark/citation.txt`). Model artifacts (`*.joblib`, `*.parquet`) remain git-ignored.
- Observed schema: 18 columns — `Gender` (`Male/Female`), `Age` (10–18+; **school-age students**, not university as previously assumed), **15 VARK Likert items rated 1–5** in three 5-item subscales (**reading/writing**, **aural**, **kinesthetic**), and a single-modality `Learner` label.
- **Label distribution is imbalanced**: `K` 679 (~56%), `A` 286, `V` 245 of 1210 records. Metrics must therefore report macro-F1 and per-class results alongside accuracy.
- **Label space caveat (important)**: the dataset's `Learner` letters do **not** follow naive VARK semantics against the item blocks. Empirically (per-class group means, ~93% CV separability): the *reading/writing* block discriminates class `A`, the *aural* block discriminates `V`, and only the *kinesthetic* block matches `K`. Serving therefore maps dataset letters to the system profile vocabulary via `LABEL_MAP = {A→R, V→A, K→K}` — a child who answers mostly reading items gets profile `R`, not "auditivo". This map ships inside `meta.json` and is applied by the inference handler; extreme-vector smoke tests (`ml/tests/inference_smoke.py`) pin the behavior.
- **Parsing quirk**: two columns share the same header text ("role-playing"). The loader must reference columns **by position**, never by name.

### System-exported snapshots (planned future phase)

- The `feature-export` Lambda (nightly EventBridge schedule) will export labeled submissions and observation aggregates into versioned snapshots on the `-data` bucket. It is currently a stub and **not part of the v0 integration** — v0 trains exclusively on the committed public dataset.
- Snapshot layout and manifest format are the **decoupling contract** for later models: any future model consumes the same snapshots without system changes.

---

## Feature engineering

`ml/features/` transforms the raw dataset into feature vectors. The feature schema is recorded in each model's `meta.json`.

- **v0 uses only the 15 Likert items** (ordinal 1–5) — no `Gender`/`Age`. Rationale: the kids form does not collect demographics at submission time, so training and serving must share the exact same feature space; dropping demographics also avoids amplifying domain gap.
- The dataset's item order is mapped **positionally** to the `vark-kids` question ids (`q01…q15`) in a table stored in `meta.json`, so serving can build vectors from submission answers without name-based guessing.
- Snapshot features are kept generic so future profiles (giftedness, difficulty, socioemotional) can reuse the export without new system work.

---

## Training

`ml/train/` implements the pipeline:

- Frameworks: scikit-learn. v0 baseline = **Logistic Regression** (multinomial, `class_weight="balanced"` to counter the K-heavy imbalance, standardized features).
- Validation: stratified k-fold cross-validation.
- Metrics: accuracy, **macro-F1**, per-class precision/recall/F1 and confusion matrix; a written evaluation report (`metrics.json`) is stored next to the artifact and registered with the model.
- Output: `model.joblib` + `meta.json` (model name, version, feature order + question-id mapping, label map `{A→R, V→A, K→K}`, metrics, trained_at, sklearn/joblib versions, dataset sha256). `make package` copies both into `sam-app/src/inference/model/`, which is **committed to git as a static serving artifact** (owner decision; see [Security](./security.md#4-datasets--ml-artifacts)).
- Multi-label approaches (Binary Relevance / MLkNN) remain a documented future upgrade, not v0.

---

## Inference

- The inference function (`InferenceFunction` in `sam-app/template.yaml`) is a **Python 3.12 Lambda** deployed with the SAM app; its deployment package bundles `model.joblib` + `meta.json`. It is **never invoked synchronously by the API**.
- **Trigger**: after the Forms Lambda stores a *new* (non-idempotent-duplicate) submission, it fires an asynchronous invoke — `InvocationType: "Event"`, best-effort; an invoke failure never fails the submission.
- **Contract** (payload from Forms Lambda): `{ childId, formId, formVersion, answers }`.
- **Behavior**: builds the feature vector per `meta.json`'s positional mapping, scores with the bundled model, remaps labels (`{A→R, V→A, K→K}`), computes confidence = max class probability, and writes the `PRED#` item itself (`createdBy: "system:inference"`, `method: "ml"`). On any error it logs and exits — **no prediction is created and the submission stands**.
- **Read path**: `GET /api/children/:id/predictions` (existing handler) serves history with autonomy gating at read time — supervised students see label-only payloads; guided/autonomous see scores + confidence.
- **Traceability**: there is **no model registry** — each `PRED#` item records `model` + `modelVersion` from `meta.json`, so every prediction is traceable to exactly what produced it. The model itself is invisible to admins and end users.
- Heuristic indicators (`giftedness-indicator`, `difficulty-indicator`) remain rule-based companions, not trained models. The former heuristic predict path is retired together with `POST /api/children/:id/predict`.

---

## Retraining loop

```
  1. Offline (engineer): run ml/ pipeline locally → make train (prepare → train → evaluate)
  2. make package → new model.joblib + meta.json copied into sam-app/src/inference/model/
  3. sam build && sam deploy → inference function now produces predictions with the new version
```

Retraining is **never scheduled inside AWS** — it is a deliberate human step on a local machine. There are no queues, schedulers, or event-driven triggers anywhere in this loop beyond the submission-triggered inference itself.

---

## Extending with future models

The pipeline is designed so new classifications are additive:

1. **New form → new profile:** add a curated form (see Architecture — Forms Engine); submissions are stored by the generic engine.
2. **New model:** add a model under `ml/` (features + train + evaluate), train offline (on exported snapshots once the export phase exists).
3. **Deploy:** package and redeploy the inference Lambda with the new artifact — predictions for that form's submissions start flowing automatically through the same async invoke; no new endpoint is required.
4. No changes to the running system's data model are required — the submission contract already carries the data.

Examples of future models: giftedness indicator, learning-difficulty indicator, socioemotional profile — all driven by the same form→train→bundle→serve loop.

---

## Future directions

### General student categorization (out of MVP scope)

A planned direction is to categorize students from **general student data** — academic history, demographics, attendance, activity/engagement records, and other non-questionnaire signals — not just from filled forms. This is deliberately **not implemented in the MVP**: it depends on data volume the system must first collect (via observations, anamnesis, and behavior checklists). When pursued, it plugs into the same contract: export → offline training → inference. The generic snapshot format and the `anamnesis`/`behavior-checklist`/`socioemotional` forms are the groundwork for it. The **feature catalog and evidence base** for this direction are documented in [Student Data Features](./student-data-features.md).

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
- [DynamoDB Schema](./dynamodb-schema.md) — `PRED#`, assessment entities
- [Student Data Features](./student-data-features.md) — feature catalog & sources for general student categorization
