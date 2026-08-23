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

.PHONY: install validate build deploy redeploy-api unit-test e2e-test test db-clean db-wipe clean

install:
	npm install --no-audit --no-fund --prefix src

validate:
	sam validate --lint

build:
	sam build

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

# Workaround for the SAM "empty deployment" race: force a fresh deployment so
# the Prod stage actually exposes the routes (avoids "Missing Authentication
# Token" after no-op deploys).
redeploy-api:
	@REST_API_ID=$$(aws cloudformation describe-stack-resource \
		--stack-name $(STACK_NAME) \
		--logical-resource-id ServerlessRestApi \
		--query "StackResourceDetail.PhysicalResourceId" \
		--output text --region $(REGION)); \
	echo "Forcing fresh API Gateway deployment for $$REST_API_ID"; \
	aws apigateway create-deployment \
		--rest-api-id $$REST_API_ID \
		--stage-name Prod \
		--region $(REGION) >/dev/null

unit-test:
	node --test tests/unit/*.test.mjs

# e2e requires the API deployed to AWS. API_BASE is resolved from the deployed
# stack output; the suite deletes only the fixtures it inserts.
e2e-test:
	API_BASE=$$(aws cloudformation describe-stacks --stack-name $(STACK_NAME) \
		--query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
		--output text) node tests/e2e/api.test.mjs

test:
	@if [ -n "$(FILTER)" ]; then npm test -- --test-name-pattern="$(FILTER)"; else npm test; fi

# Remove items by PK prefix. Defaults to legacy orphans; pass your own:
#   make db-clean PREFIXES="MODEL# FORM# EMAIL#stale@"
db-clean:
	node scripts/clean-db.mjs $(PREFIXES)

# Full wipe — dev only, requires explicit confirmation:
#   make db-wipe CONFIRM=yes
db-wipe:
	@if [ "$(CONFIRM)" != "yes" ]; then echo "Refusing to wipe '$(TABLE_NAME)' without CONFIRM=yes."; exit 2; fi
	CONFIRM=yes node scripts/clean-db.mjs --all

clean:
	rm -rf .aws-sam
