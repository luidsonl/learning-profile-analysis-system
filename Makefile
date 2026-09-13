# ─────────────────────────────────────────────────────────────────────────────
# learning-profile-analysis-system — full-stack deployment orchestrator
#
# Deploy order (each layer feeds the next):
#   1. terraform/aws-bootstrap → S3 state bucket (one-time, first run only)
#   2. terraform/aws-app       → DynamoDB + S3 buckets + SQS + async Lambdas
#   3. sam-app                 → API Lambdas + API Gateway (served under /api/*)
#   4. terraform/aws-frontend  → S3 + CloudFront SPA (one domain for app + /api/*)
#
# ML is fully offline: `make train` / `make package` run locally in ml/ and
# bundle the artifact into sam-app before the next backend deploy.
#
# Typical workflows:
#   make deploy-all        # full stack: aws-app → sam-app → frontend
#   make deploy-api        # backend only: aws-app → sam-app (no frontend)
#   make deploy-aws-app    # single stage — stateful infra only
#   make deploy-sam-app    # single stage — API Lambdas + API Gateway only
#   make deploy-aws-front  # single stage — SPA build + S3 + CloudFront only
#   make bootstrap         # first-time only: create remote state bucket
#   make destroy-all       # teardown everything (reverse order)
# ─────────────────────────────────────────────────────────────────────────────

TF          ?= terraform
STACK_NAME  ?= learning-profile-api
REGION      ?= us-east-1

.PHONY: all deploy-all deploy-api bootstrap
.PHONY: deploy-aws-app deploy-sam-app deploy-aws-front
.PHONY: sync frontend-serve validate-api
.PHONY: train package sanity smoke
.PHONY: destroy-all destroy-sam-app destroy-aws-app destroy-aws-front

# ── Compose ──────────────────────────────────────────────────────────────────
# Full stack (everything). Equivalent to `make all`.
deploy-all: deploy-aws-app deploy-sam-app deploy-aws-front

# Backend only — no frontend. Same as `deploy-all` minus `deploy-aws-front`.
deploy-api: deploy-aws-app deploy-sam-app

all: deploy-all

# ── Stage 1/4 — State backend (one-time) ────────────────────────────────────
bootstrap:
	cd terraform/aws-bootstrap && $(TF) init -input=false && $(TF) apply -auto-approve

# ── Stage 2/4 — Stateful infrastructure ─────────────────────────────────────
# DynamoDB + S3 + SQS + async Lambdas (namespace=learning-profile).
deploy-aws-app:
	cd terraform/aws-app && $(TF) init -input=false && $(TF) apply -auto-approve

# ── Stage 3/4 — Backend API ──────────────────────────────────────────────────
# API Lambdas + API Gateway. Consumes the aws-app outputs via parameter
# overrides in sam-app/Makefile.
deploy-sam-app:
	cd sam-app && $(MAKE) deploy
	@echo ""
	@echo "API: $$(cd sam-app && aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) \
		--query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
		--output text --region $(REGION))"

# ── Stage 4/4 — Frontend (Angular SPA → S3 + CloudFront) ─────────────────────
# Build + upload + CloudFront invalidation run here (NOT inside Terraform), so
# the module never references the frontend/ tree and can't break on its absence.
# `frontend_enabled=true` activates terraform/aws-frontend explicitly.
deploy-aws-front:
	@if [ ! -d frontend ]; then echo "--> frontend/ missing (Angular SPA not scaffolded) — skipping."; exit 0; fi
	cd frontend && npm install --no-audit --no-fund && npm run build
	cd terraform/aws-frontend && $(TF) init -input=false && $(TF) apply -auto-approve -var 'frontend_enabled=true'
	@echo "--> Uploading to S3..."
	@aws s3 sync frontend/dist/frontend/browser/ "s3://$$(cd terraform/aws-frontend && $(TF) output -raw bucket_name)/" --delete
	@echo "--> Invalidating CloudFront..."
	@aws cloudfront create-invalidation --distribution-id "$$(cd terraform/aws-frontend && $(TF) output -raw cloudfront_id)" --paths "/*"
	@echo "--> Frontend available at: https://$$(cd terraform/aws-frontend && $(TF) output -raw cloudfront_domain_name)"

# ── Dev shortcuts ────────────────────────────────────────────────────────────
# Dev loop: watch mode syncing handler code to live Lambdas in seconds.
sync:
	cd sam-app && $(MAKE) sync

# Dev server that proxies /api to the deployed API Gateway (no CORS, mirrors
# prod). Requires the API deployed (`make deploy-api`) + AWS credentials.
frontend-serve:
	cd frontend && node scripts/fetch-api.js && npm start -- --proxy-config proxy.conf.json

# Validate the OpenAPI contract (specs/api.yaml) with Redocly.
validate-api:
	npx --yes @redocly/cli@latest lint specs/api.yaml

# ── Offline ML pipeline (never runs in AWS) ──────────────────────────────────
train:
	cd ml && $(MAKE) train

package:
	cd ml && $(MAKE) package

sanity:
	cd ml && $(MAKE) sanity

smoke:
	cd ml && $(MAKE) smoke-lambda

# ── Teardown (reverse order) ─────────────────────────────────────────────────
destroy-sam-app:
	-sam delete --stack-name $(STACK_NAME) --region $(REGION) --no-prompts

destroy-aws-app:
	cd terraform/aws-app && $(TF) destroy -auto-approve

destroy-aws-front:
	cd terraform/aws-frontend && $(TF) destroy -auto-approve

destroy-all: destroy-sam-app destroy-aws-app destroy-aws-front