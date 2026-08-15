# Security Policy

This project is a serverless platform for **learning-profile analysis of children** (gifted and specific-needs students). It processes sensitive personal data of minors — security and privacy are treated as foundational.

## Reporting a Vulnerability

**Do not open a public issue** for security vulnerabilities, and never post live exploits, credentials, or real personal data.

Report privately to the maintainers:

- **Email:** [luidsonlsti@gmail.com](mailto:luidsonlsti@gmail.com) — subject prefix `[learning-profile-security]`
- Use the GitHub **private vulnerability reporting** feature if enabled on this repository (Settings → Security → Advisories → New draft).

### What to include
- Type of issue (XSS, auth bypass, data exposure, IaC misconfiguration, dependency CVE, etc.)
- Affected component / endpoint / file
- Steps to reproduce (sanitized — use fabricated data only)
- Suggested impact and, if available, a fix
- Proof-of-concept **only if** it does not contain real personal data

### What happens next
1. Acknowledgment within **5 business days**.
2. Triage and confirmation of impact within **14 days**.
3. A fix is developed, then a coordinated public disclosure.

## Scope

In scope: `terraform/`, `sam-app/`, `frontend/`, `ml/`, CI configuration.

Out of scope: third-party dependencies and AWS-managed services themselves (report CVEs on upstream projects to their own channels).

## Safe harbor

Actions taken in good faith to identify and report vulnerabilities — without harming the platform, exposing real user data, or violating laws — are welcomed. Do not access or modify data you are not authorized to access.
