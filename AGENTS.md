# AGENTS.md

Greenfield project: **Sistema de Análise de Perfil de Aprendizado**. Personalizes teaching for gifted children and children with specific needs (educators, parents/guardians, children are the personas). No source code exists yet — everything below is the agreed architecture, not yet implemented.

## Architecture (agreed — mirror https://github.com/luidsonl/0shared)

- AWS serverless: **Terraform** for stateful infra (DynamoDB, S3, SQS, async Lambdas, EventBridge), **AWS SAM** for API-triggered Lambdas, **CloudFront + S3** for a React+Vite SPA. Backend API served under `/api/*` prefix so one CloudFront domain serves app + API (no CORS).
- **DynamoDB single-table design** (like 0shared): entity-prefixed PK/SK (`USER#`, `CHILD#`, `EMAIL#`, `SESSION#`, `MODEL#`, `AUDIT#`), GSIs per access pattern, transactions with uniqueness reservations.
- **ML is fully decoupled**: standalone spec `docs/ml-pipeline.md` covers dataset + offline training (scikit-learn, artifacts → S3, versioned registry `MODEL#name#version`); inference via a Lambda with a small packaged model. Lambdas do NOT train and the deployed system never runs training — retraining is a local/CI step on exported snapshots. Designed to be extended with future models/classifications.
- **Forms engine (hybrid)**: generic `FORM#` definitions + per-child submissions; curated library (`vark-kids` by student, `anamnesis` by guardian, `socioemotional` + `behavior-checklist` by educator); admin edits produce versioned form definitions. **A profile is traced from a filled form** (VARK in the MVP); ML classifies profiles offline and is not wired to forms in the MVP.
- Roles/RBAC: `guardian` | `educator` | `student` | `admin`. Parents see only their children; educators see only children they follow; students (minors) get a restricted self-view (profile, recommendations, approved reports, own forms — no observations, no raw ML). LGPD compliance (explicit consent, audit log `AUDIT#`) is in-scope for the MVP, not an afterthought. Student accounts are initiated by the guardian under versioned consent.
- Feedback loop: VARK submissions + observations → nightly export → offline retrain when ≥20 new labeled samples → new model version → redeploy inference Lambda → updated recommendations.

## Planned repo layout

```
terraform/   aws-bootstrap (state bucket) · aws-app (stateful) · aws-frontend (S3+CloudFront)
sam-app/     API Gateway + Lambda handlers, template.yaml, resources.env, Makefile, env.json
frontend/    React + Vite SPA (pt-BR, accessible)
ml/          data/ · features/ · train/ · evaluate/ · serve/ (Lambda model packaging)
docs/        architecture, backend, auth, dynamodb-schema, ml-pipeline, lgpd, frontend, design-system
```

## Agreed decisions to respect

- Resource naming convention from 0shared: `namespace=learning-profile`, `project=learning-profile` (e.g. table `learning-profile`, buckets `learning-profile-files` / `-data` / `-front`).
- Docs-first: every layer gets a doc in `docs/` before/with implementation, mirroring 0shared's `architecture.md` / `backend.md` / `dynamodb-schema.md` / `auth.md`.
- MVP = full vertical slice: auth → children/guardianship → VARK assessment → ML prediction → recommendations → reports.

## Key external references

- Reference architecture: https://github.com/luidsonl/0shared (mirror its auth flow, presigned-URL upload/download, S3→SQS async patterns, CloudFormation-export → Terraform data-source integration).
- Training dataset: Armand, Eboue (2021) "Student Learning Preferences", Mendeley Data, V1, doi: 10.17632/bwrr6zypcj.1 — VARK questionnaire, ~245 records, 16 questions × 4 options (V/A/R/K) + multimodal label. **Caveat: subjects are university students, not children** — domain gap; use kids' VARK version and collect own data for retraining.
