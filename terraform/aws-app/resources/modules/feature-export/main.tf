data "aws_region" "current" {}

locals {
  lambda_name = "${var.project_name}-feature-export"
}

# ---------------------------------------------------------------------------
# Feature Export Lambda (EventBridge-triggered, nightly)
# ---------------------------------------------------------------------------
data "archive_file" "feature_export_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../../../src"
  output_path = "${path.module}/lambda-feature-export.zip"
}

resource "aws_iam_role" "feature_export_lambda" {
  name = "${local.lambda_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
      Effect    = "Allow"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "feature_export_lambda_basic" {
  role       = aws_iam_role.feature_export_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "feature_export_lambda" {
  # DynamoDB permissions (read labeled assessments + observations via GSIs)
  statement {
    sid    = "DynamoDBAccess"
    effect = "Allow"
    actions = [
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      var.dynamodb_table_arn,
      "${var.dynamodb_table_arn}/index/*",
    ]
  }

  # S3 permissions (write anonymized snapshots)
  statement {
    sid    = "S3Write"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:ListBucket",
    ]
    resources = [
      var.data_bucket_arn,
      "${var.data_bucket_arn}/*",
    ]
  }

  # CloudWatch Logs
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${data.aws_region.current.name}:*:*"]
  }
}

resource "aws_iam_role_policy" "feature_export_lambda" {
  name   = "${local.lambda_name}-policy"
  role   = aws_iam_role.feature_export_lambda.id
  policy = data.aws_iam_policy_document.feature_export_lambda.json
}

resource "aws_lambda_function" "feature_export" {
  filename      = data.archive_file.feature_export_lambda.output_path
  function_name = local.lambda_name
  role          = aws_iam_role.feature_export_lambda.arn
  handler       = "feature-export.lambdaHandler"
  runtime       = var.lambda_runtime
  timeout       = 120
  memory_size   = 256

  source_code_hash = data.archive_file.feature_export_lambda.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE = var.dynamodb_table_name
      DATA_BUCKET    = var.data_bucket_name
    }
  }

  logging_config {
    log_format            = "JSON"
    application_log_level = "INFO"
    system_log_level      = "WARN"
  }
}

# ---------------------------------------------------------------------------
# EventBridge schedule (nightly 02:00 UTC)
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_event_rule" "nightly_export" {
  name                = "${var.project_name}-nightly-export"
  description         = "Triggers the feature-export Lambda nightly"
  schedule_expression = "cron(0 2 * * ? *)"
}

resource "aws_cloudwatch_event_target" "feature_export" {
  rule      = aws_cloudwatch_event_rule.nightly_export.name
  target_id = "feature-export"
  arn       = aws_lambda_function.feature_export.arn
}

resource "aws_lambda_permission" "feature_export_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.feature_export.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.nightly_export.arn
}
