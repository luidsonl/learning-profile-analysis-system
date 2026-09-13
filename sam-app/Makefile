# ─────────────────────────────────────────────────────────────────────────────
# learning-profile — backend (SAM): API Lambdas + API Gateway
#
# Deployed AFTER terraform/aws-app (consumes its outputs).
# `make deploy` also forces a fresh API Gateway deployment (SAM "empty
# deployment" race workaround).
#
# Resource names come from resources.env; live Terraform outputs take
# precedence when available.
# ─────────────────────────────────────────────────────────────────────────────

RESOURCES := $(shell grep -v '^#' resources.env | grep -v '^$$')
$(foreach v,$(RESOURCES),$(eval $(v)))

TF_TABLE := $(shell cd ../terraform/aws-app && terraform output -raw table_name 2>/dev/null)
ifneq ($(TF_TABLE),)
TABLE_NAME := $(TF_TABLE)
endif

STACK_NAME ?= learning-profile-api

export TABLE_NAME FILES_BUCKET DATA_BUCKET STACK_NAME REGION

.PHONY: install validate build deploy redeploy-api unit-test e2e-test test clean db-wipe

install:
	npm install --no-audit --no-fund --prefix src

validate:
	sam validate --lint

# --cached skips the heavy pip install (numpy/scikit-learn) unless
# src/inference/requirements.txt actually changes. Model training NEVER runs
# here: the artifacts are static files under src/inference/models/<formId>/.
build:
	sam build --cached

deploy: build
	@out=$$(sam deploy --resolve-s3 --no-confirm-changeset --no-fail-on-empty-changeset \
		--capabilities CAPABILITY_IAM \
		--stack-name $(STACK_NAME) \
		--parameter-overrides \
		"DynamoDBTableName=$$(cd ../terraform/aws-app && terraform output -raw table_name)" \
		"FilesBucket=$$(cd ../terraform/aws-app && terraform output -raw files_bucket_name)" \
		"DataBucket=$$(cd ../terraform/aws-app && terraform output -raw data_bucket_name)" \
		"ReportQueueUrl=$$(cd ../terraform/aws-app && terraform output -raw report_queue_url)" \
		2>&1); \
	if [ $$? -eq 0 ]; then echo "SAM deploy succeeded."; \
	elif echo "$$out" | grep -q "No changes to deploy"; then echo "SAM: stack up to date (no changes)."; \
	else echo "$$out"; exit 1; fi
	@$(MAKE) redeploy-api

# Fast dev loop: syncs changed handler code straight to the real Lambdas in
# seconds (no CloudFormation wait). Template.yaml changes take the slow CFN
# path automatically. Run a final `make deploy` before considering work done.
sync:
	sam sync --stack-name $(STACK_NAME) --watch

# Workaround for the SAM "empty deployment" race: force a fresh deployment so
# the Prod stage actually exposes the routes (avoids "Missing Authentication
# Token" after no-op deploys). NOTE: our template declares an EXPLICIT Api
# resource (logical id "Api", stage "prod"), not SAM's implicit one.
redeploy-api:
	@REST_API_ID=$$(aws cloudformation describe-stack-resource \
		--stack-name $(STACK_NAME) \
		--logical-resource-id Api \
		--query "StackResourceDetail.PhysicalResourceId" \
		--output text --region $(REGION)); \
	echo "Forcing fresh API Gateway deployment for $$REST_API_ID"; \
	aws apigateway create-deployment \
		--rest-api-id $$REST_API_ID \
		--stage-name prod \
		--region $(REGION) >/dev/null

unit-test:
	node --test tests/unit/*.test.mjs

# e2e requires the API deployed to AWS. API_BASE is resolved from the deployed
# stack output; the suite deletes only the fixtures it inserts. Scenarios run in
# order and share ctx, so only a contiguous prefix runs in isolation; FILTER is
# an optional filter that picks the LAST scenario to run, by id ("04") or by
# name ("inference") — everything after it is skipped. Examples:
#   make e2e-test                # no filter → full suite (01 → 09)
#   make e2e-test FILTER=04      # bootstrap → ML inference only (01 → 04)
#   make e2e-test FILTER=inference # same, by scenario label
#   make e2e-inference           # shorthand (via the e2e-% rule below)
# NOTE: no clean table required — if an admin already exists the suite uses a
# staged admin (registers a fixture educator and promotes it to admin directly
# in the DB), otherwise it exercises the "first educator -> admin" bootstrap.
# The suite only ever creates/removes its own fixture data.
e2e-test:
	API_BASE=$$(aws cloudformation describe-stacks --stack-name $(STACK_NAME) \
		--query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
		--output text) FILTER="$(FILTER)" node tests/e2e/api.test.mjs

# Shorthand: make e2e-inference  ≡  make e2e-test FILTER=inference
e2e-%:
	$(MAKE) e2e-test FILTER="$*"

test:
	@if [ -n "$(FILTER)" ]; then npm test -- --test-name-pattern="$(FILTER)"; else npm test; fi

# Full dev DB wipe. The single table is disposable in development; this deletes
# EVERY item (all entity prefixes). Requires explicit confirmation:
#   make clean CONFIRM=yes
# (The old `db-clean` default targeted legacy MODEL#/FORM# orphans which no
# longer exist — use `clean` for a real reset, or script scripts/clean-db.mjs
# directly with PREFIXES for a targeted prefix cleanup.)
clean:
	@if [ "$(CONFIRM)" != "yes" ]; then echo "Refusing to wipe '$(TABLE_NAME)' without CONFIRM=yes."; exit 2; fi
	CONFIRM=yes node scripts/clean-db.mjs --all

# Compatibility alias for the old full-wipe name.
db-wipe: clean
