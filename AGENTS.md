# AGENTS.md

Project: **Sistema de Análise de Perfil de Aprendizado**. Personalizes teaching for gifted students and students with specific needs — children or adults (educators, parents/guardians, students are the personas). Backend vertical slice (Terraform infra, SAM API, forms engine, offline ML + inference Lambda, tests) and the frontend SPA are implemented; **frontend RBAC rework and the S3/CloudFront deploy are pending** — current status and next steps: see `specs/progress.md`; documentation hub: `specs/README.md`.

## Architecture (agreed — mirror https://github.com/luidsonl/0shared)

- AWS serverless: **Terraform** for stateful infra (DynamoDB, S3, SQS, async Lambdas, EventBridge), **AWS SAM** for API-triggered Lambdas, **CloudFront + S3** for a React+Vite SPA. Backend API served under `/api/*` prefix so one CloudFront domain serves app + API (no CORS).
- **DynamoDB single-table design** (like 0shared): entity-prefixed PK/SK (`USER#`, `STUDENT#`, `EMAIL#`, `SESSION#`, `AUDIT#`), GSIs per access pattern, transactions with uniqueness reservations.
- **ML is fully decoupled**: training is **100% offline** in `ml/` (scikit-learn, runs locally on the committed dataset — never in AWS); the trained artifact (`model.joblib` + `meta.json`) is **bundled into a Python inference Lambda** deployed with SAM. Storing a new form submission triggers that Lambda via **asynchronous invoke** (`InvocationType: "Event"`, fire-and-forget, **no SQS anywhere in the ML path**); the inference Lambda scores and writes the `PRED#` item itself (each item carries `model` + `modelVersion` from `meta.json` — that's the traceability, no registry). Submissions are human input; predictions are machine-generated data. Retraining is a manual local step (`make train` → package → `sam deploy`). Designed to be extended with future forms/models.
- **Forms engine (code-defined)**: curated definitions in code (`vark` by any persona — student, or guardian/educator/admin acting for them; `anamnesis` by guardian; `socioemotional` + `behavior-checklist` by educator), served read-only by the API — **no business rules in the database**; only per-student submissions are stored. A `vark` submission is stored immediately and, asynchronously, the bundled ML model scores it automatically, producing a `PRED#` prediction that appears afterwards. **A profile is traced from a filled form** (VARK): the deterministic processor writes `ASSESS#`, and the bundled ML model scores every `vark` submission automatically (`PRED#`).
- Roles/RBAC: `guardian` | `educator` | `student` | `admin`. Parents see only their own children; educators see only the students they follow. **Students self-register** (`role: student`, starts `pending` with a restricted self-service area, `studentId: null`) and an **educator links** the account to a single student entity (`POST /students/:id/accounts/:userId/link` — approves + attributes, at-most-one both ways); a linked student gets a full self-view of their own data (profile, forms/submissions, predictions with scores, observations read-only, reports) — no audit trail, no raw ML internals, access is binary (no autonomy levels). **Age-based consent**: `MIN_SELF_CONSENT_AGE = 18` — an adult student (≥18) self-consents (`self_consent`, adjudicated from the `birthDate` collected as age verification); a minor (<18) is consented by a guardian or by institution authorization (see `specs/lgpd.md`). LGPD compliance (explicit versioned consent, audit log `AUDIT#`) is in-scope for the MVP, not an afterthought. Student accounts are self-registered and linked by an educator under versioned, age-gated consent.
- Feedback loop: retrain locally on `datasets/vark/data.csv` (later: exported snapshots) → `make train && make package` → register new model version → `sam build && sam deploy` → submissions now produce predictions with the new version. No queues or schedulers involved.

## Planned repo layout

```
terraform/   aws-bootstrap (state bucket) · aws-app (stateful) · aws-frontend (S3+CloudFront)
sam-app/     API Gateway + Lambda handlers, inference Lambda (Python), template.yaml, resources.env
frontend/    React + Vite SPA (pt-BR, accessible)
ml/          features/ · train/ · evaluate/ · serve/ (offline training; packages model into sam-app)
datasets/    public training datasets (vark/data.csv + citation.txt — committed by owner decision)
specs/       architecture, backend, auth, dynamodb-schema, ml-pipeline, lgpd, frontend, design-system (README.md = dependency-graph hub)
```

## Agreed decisions to respect

- Resource naming convention from 0shared: `namespace=learning-profile`, `project=learning-profile` (e.g. table `learning-profile`, buckets `learning-profile-files` / `-data` / `-front`).
- Specs-first: every layer gets a spec in `specs/` before/with implementation, mirroring 0shared's `architecture.md` / `backend.md` / `dynamodb-schema.md` / `auth.md`.
- MVP = full vertical slice: auth → students/guardianship → VARK assessment → ML prediction → recommendations → reports.

## Key external references

- Reference architecture: https://github.com/luidsonl/0shared (mirror its auth flow, presigned-URL upload/download, S3→SQS async patterns, CloudFormation-export → Terraform data-source integration).
- Training dataset: Armand, Eboue (2021) "Student Learning Preferences", Mendeley Data, V1, doi: 10.17632/bwrr6zypcj.1 (CC BY 4.0) — **committed at `datasets/vark/data.csv`** (1210 records). Observed schema: `Gender` + `Age` (10–18+, school students) + 15 items rated 1–5 (three 5-item subscales: reading/writing, aural, kinesthetic; two columns share a header text — load positionally) + single-modality `Learner` label (`A` 286 / `K` 679 / `V` 245; no `R` class). **Letters don't follow naive VARK semantics**: reading block discriminates `A`, aural block discriminates `V`, kinesthetic matches `K` → serving maps `{A→R, V→A, K→K}`. Class imbalance → report macro-F1/per-class metrics.

## Specs & documentation graph

The spec set lives in `specs/`, with **`specs/README.md`** as the mandatory entry point: dependency **DAG** (Mermaid graph + per-spec `dependsOn`/`requiredBy` frontmatter), reading guide, status legend (`stable`/`evolving`/`proposed`/`deprecated`), and the change lifecycle. Rules:

- **Read bottom-up**: follow `dependsOn` before implementing against a spec; never read specs at random or build on a stale/duplicated fact.
- **SSOT/DRY**: each cross-cutting fact (resource names, roles, entities, retention, dataset policy) lives in exactly **one** spec — link, don't copy. Duplicated facts have no owner.
- **Keep the graph honest**: when editing a spec, update its `status`/`lastReviewed` and keep `dependsOn`/`requiredBy` inverse-consistent with the Mermaid graph in `specs/README.md`.
- When code is implemented/verified against a churned spec, flip it back from `evolving` to `stable`.

## Public repository — MANDATORY security rules

The repo is **public on GitHub**. Violations of these rules are release-blockers; see `specs/security.md` for the full spec and checklist.

- **Never commit secrets**: keys, tokens, passwords, credentials (not even commented/test fixtures). Use env vars, AWS Secrets Manager, GitHub Actions secrets.
- **Never commit an AWS Account ID** (12 digits) or an ARN containing one; use placeholders.
- **Never commit real personal data** (LGPD): test fixtures must be fabricated (fake names/emails). Students' data is never published.
- **Never commit** `*.tfstate`, `.env`, `env.json`, `*.pem`/`*.key`, or raw ML artifacts (`ml/build/`, `.venv/`). Exceptions by owner decision: the **public training dataset** (`datasets/vark/data.csv`, CC BY 4.0 with attribution in `citation.txt`) and the **packaged serving models** (`sam-app/src/inference/models/<formId>/` — static files trained only on public data, regenerated via `ml/ make package`) are intentionally committed.
- Run `gitleaks detect` before pushing; `terraform validate` on every infra change. Keep root `.gitignore`, `.gitleaks.toml`, `.pre-commit-config.yaml`, `SECURITY.md`, and `.github/workflows/secret-scan.yml` up to date.
- `terraform/aws-bootstrap/terraform.tfvars` holds only public metadata (bucket name/owner) — safe to commit; local env overrides go in git-ignored `*.auto.tfvars`.
