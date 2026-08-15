output "lambda_function_name" {
  value = aws_lambda_function.feature_export.function_name
}

output "lambda_function_arn" {
  value = aws_lambda_function.feature_export.arn
}

output "lambda_role_name" {
  value = aws_iam_role.feature_export_lambda.name
}

output "event_rule_name" {
  value = aws_cloudwatch_event_rule.nightly_export.name
}
