# Security & Public Repository Rules — Learning Profile Analysis System

> **This repository is intended to be public on GitHub.** Everything committed must be safe to publish. These are binding rules — every contributor, every automated agent (including opencode), and every CI step must respect them. Violations are release-blockers.

## 1. Secrets — absolute prohibition

- **Never commit** access keys, secret keys, tokens, passwords, connection strings, cookies, or any credential — not even commented out, not even in test fixtures, not even "temporarily".
- Real credentials live only in:
  - AWS environment variables / AWS CLI credential files (outside the repo),
  - AWS Secrets Manager for deployed values,
  - GitHub Actions **secrets** for CI.
- `.env`, `env.json`, `*.pem`, `*.key`, and credential files are git-ignored (root `.gitignore`). Commit **`.example`** templates only, with placeholders.
- If a secret is ever committed (even if removed later), treat it as **compromised**: rotate it, and purge it from git history before publication (see §7).

## 2. AWS-specific rules

- **Never commit an AWS Account ID** (12 digits) or a resource ARN containing one. Use placeholders (`<ACCOUNT_ID>`, `arn:aws:s3:::<bucket>`).
- Region references in committed files must use the default/placeholder form (`us-east-1` is fine; account-scoped values are not).
- `*.tfstate` files are never committed — they contain live resource identifiers and sometimes secrets.
- `terraform/aws-bootstrap/terraform.tfvars` is safe to commit: it holds only **public metadata** (bucket name, owner GitHub handle, project name). Local environment overrides go in git-ignored `*.auto.tfvars`.
- Never grant public access or commit IAM policies allowing `*` principals without explicit review.

## 3. Personal data (LGPD) — never in the repo

- **No real personal data of any person** (children, guardians, educators, teachers) may be committed: names, birth dates, emails, phone numbers, addresses, school names, or any identifying combination.
- Test fixtures, seed scripts, and screenshots must use **fabricated, clearly-fake data** (e.g., `Crianca Teste`, `teste@example.com`).
- Screenshots in docs must not show real people, real child data, or real school names. Blur/anonymize or use mock screens.
- The system handles minors' data (see [LGPD](./lgpd.md)); leaking it publicly is both a security and a compliance failure.

## 4. Datasets & ML artifacts

- **Do not commit the raw training dataset** (Armand, Eboue 2021, DOI: 10.17632/bwrr6zypcj.1). It is CC BY 4.0 — redistribute only per its license and with attribution. `ml/data/raw/` and `ml/data/snapshots/` are git-ignored; a documented script downloads the file.
- Do not commit trained model artifacts (`*.joblib`, `*.parquet`) — they can embed/overfit personal data from exported snapshots and bloat the repo.
- The anonymized export contract (see [ML Pipeline](./ml-pipeline.md)) guarantees exported snapshots contain no direct identifiers; still, never commit a snapshot.

## 5. Commit hygiene & review

- Review every diff before committing (`git diff`, `git status`) — stage only intended files, never `git add .` blindly.
- Run the secret scan (see §6) on every change; a failing scan blocks the commit.
- Do not paste secrets into issue reports, PR descriptions, logs, or support tickets.
- Public issue templates must warn against posting real personal data or credentials.

## 6. Automated enforcement

| Layer | Tool | Where |
|-------|------|-------|
| Pre-commit | **gitleaks** (secrets) + trailing-whitespace hook | `.pre-commit-config.yaml` |
| CI | **gitleaks-action** on push/PR | `.github/workflows/secret-scan.yml` |
| CI | `terraform validate` + `tfsec`/`checkov` (infra scan) | to be added with `aws-app` |
| CI | `npm audit`/dependabot for frontend + Lambda deps | enable on GitHub |
| GitHub | **Secret scanning** + **Dependabot** + branch protection on `main` | repository settings |

- `gitleaks` config lives in `.gitleaks.toml` at repo root; extend it when new secret formats appear.
- A release is **blocked** if any scan fails or if a reviewer flags a §1–§4 violation.

## 7. Pre-publication checklist (run before first push / making public)

- [ ] `gitleaks detect --no-badge` on full history → 0 findings.
- [ ] Confirm no `*.tfstate`, `.env`, `env.json`, `*.pem`, `*.key`, `*.joblib`, `*.parquet` tracked (`git ls-files | grep`).
- [ ] Confirm no 12-digit AWS account ID and no real emails/names in tracked files.
- [ ] Test data confirmed fabricated (grep for real-looking names in fixtures).
- [ ] Dataset/models confirmed absent (download-only).
- [ ] Choose and add a **LICENSE** file (legal decision — pick explicitly; do not publish without one).
- [ ] `SECURITY.md` present with a vulnerability-reporting contact/policy.
- [ ] If any secret ever existed in history, rewrite history (filter-branch/BFG) and rotate the secret before publishing.
- [ ] Enable GitHub branch protection + secret scanning on the repository.

## 8. Reporting vulnerabilities

See [SECURITY.md](../../SECURITY.md) — private disclosure, no public posting of live exploits or user data.

---

## See Also

- [LGPD](./lgpd.md) — personal-data handling rules this spec reinforces
- [Architecture](./architecture.md) — infrastructure design that keeps secrets out of code
- [Authentication](./auth.md) — credential handling at runtime
- [ML Pipeline](./ml-pipeline.md) — dataset/model artifact policy
