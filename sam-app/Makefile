.PHONY: install validate build deploy unit-test e2e-test test clean

API_STACK := learning-profile-api

install:
	npm install --no-audit --no-fund --prefix src

validate:
	sam validate --lint

build:
	sam build

# Deploy the API to AWS. Table/buckets/queue names come from terraform/aws-app outputs.
deploy: build
	sam deploy --resolve-s3 --no-confirm-changeset --no-fail-on-empty-changeset \
		--capabilities CAPABILITY_IAM \
		--stack-name $(API_STACK) \
		--parameter-overrides \
		"DynamoDBTableName=$$(cd ../terraform/aws-app && terraform output -raw table_name) \
		FilesBucket=$$(cd ../terraform/aws-app && terraform output -raw files_bucket_name) \
		DataBucket=$$(cd ../terraform/aws-app && terraform output -raw data_bucket_name) \
		ReportQueueUrl=$$(cd ../terraform/aws-app && terraform output -raw report_queue_url)"

unit-test:
	node --test tests/unit/*.test.mjs

# e2e requires the API deployed to AWS. API_BASE is resolved from the deployed
# stack output; the test deletes only the data it inserts.
e2e-test:
	API_BASE=$$(aws cloudformation describe-stacks --stack-name $(API_STACK) \
		--query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
		--output text) node tests/e2e/api.test.mjs

test: unit-test e2e-test

clean:
	rm -rf .aws-sam
