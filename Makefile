# ─────────────────────────────────────────────────────────────────────────────
# learning-profile-analysis-system — full-stack deployment orchestrator
#
# Deploy order (each layer feeds the next):
#   1. terraform/aws-bootstrap  → S3 state bucket (one-time)
#   2. terraform/aws-app        → DynamoDB + S3 buckets + SQS + async Lambdas
#   3. sam-app                  → API Lambdas + API Gateway (served under /api/*)
#   4. frontend                 → S3 + CloudFront SPA (single domain for app + /api/*)
#                                (skipped while the SPA is absent — planned Angular rebuild)
#
# ML is fully offline: `make train` / `make package` run locally in ml/ and
# bundle the artifact into sam-app before the next backend deploy.
# ─────────────────────────────────────────────────────────────────────────────

TF          ?= terraform
STACK_NAME  ?= learning-profile-api
REGION      ?= us-east-1

.PHONY: all deploy deploy-full bootstrap infra backend frontend train package sanity smoke destroy destroy-backend

all: deploy

# Regular deployment (skips the state bucket — already exists).
# `frontend` is NOT in the chain while the SPA is absent; run it explicitly
# once the frontend/ directory is reintroduced.
deploy: infra backend
	@echo ""
	@echo "=========================================================="
	@echo " Deployment complete."
	@echo " API: $$(cd sam-app && aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) \
		--query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
		--output text --region $(REGION))"
	@echo "=========================================================="

# First-time deployment (includes state bucket creation)
deploy-full: bootstrap deploy

# 1. State backend (one-time)
bootstrap:
	cd terraform/aws-bootstrap && $(TF) init -input=false && $(TF) apply -auto-approve

# 2. Stateful infrastructure (DynamoDB + S3 + SQS + async Lambdas)
infra:
	cd terraform/aws-app && $(TF) init -input=false && $(TF) apply -auto-approve

# 3. Backend (API Lambdas + API Gateway; parameter overrides from TF outputs)
backend:
	cd sam-app && $(MAKE) deploy

# Dev loop: watch mode syncing handler code to live Lambdas in seconds.
sync:
	cd sam-app && $(MAKE) sync

# 4. Frontend (future Angular SPA → S3 + CloudFront; serves app + API under the same domain)
# No-op while the SPA is absent. `frontend_enabled=true` activates
# terraform/aws-frontend explicitly — otherwise the module creates nothing.
# Build + upload + CloudFront invalidation run here (NOT inside Terraform), so
# the module never references the frontend/ tree and can't break on its absence.
frontend:
	@if [ ! -d frontend ]; then echo "--> frontend/ missing (SPA removed; Angular rebuild planned) — skipping."; exit 0; fi
	cd frontend && npm install --no-audit --no-fund && npm run build
	cd terraform/aws-frontend && $(TF) init -input=false && $(TF) apply -auto-approve -var 'frontend_enabled=true'
	@echo "--> Uploading to S3..."
	@aws s3 sync frontend/dist/ "s3://$$(cd terraform/aws-frontend && $(TF) output -raw bucket_name)/" --delete
	@echo "--> Invalidating CloudFront..."
	@aws cloudfront create-invalidation --distribution-id "$$(cd terraform/aws-frontend && $(TF) output -raw cloudfront_id)" --paths "/*"
	@echo "--> Frontend available at: https://$$(cd terraform/aws-frontend && $(TF) output -raw cloudfront_domain_name)"

# ── Offline ML pipeline (never runs in AWS) ──────────────────────────────────
train:
	cd ml && $(MAKE) train

package:
	cd ml && $(MAKE) package

sanity:
	cd ml && $(MAKE) sanity

smoke:
	cd ml && $(MAKE) smoke-lambda

# ── Teardown ──────────────────────────────────────────────────────────────────
destroy-backend:
	-sam delete --stack-name $(STACK_NAME) --region $(REGION) --no-prompts

destroy: destroy-backend
	cd terraform/aws-app && $(TF) destroy -auto-approve
