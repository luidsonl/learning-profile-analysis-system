output "table_name" {
  value       = module.resources.table_name
  description = "DynamoDB table name (consumed by SAM)"
}

output "files_bucket_name" {
  value       = module.resources.files_bucket_name
  description = "S3 bucket name for reports/documents (consumed by SAM)"
}

output "data_bucket_name" {
  value       = module.resources.data_bucket_name
  description = "S3 bucket name for ML snapshots/artifacts (consumed by SAM and the offline pipeline)"
}

output "report_queue_url" {
  value       = module.resources.report_queue_url
  description = "SQS report queue URL (consumed by SAM)"
}

output "report_queue_arn" {
  value       = module.resources.report_queue_arn
  description = "SQS report queue ARN"
}

output "report_generator_lambda_name" {
  value       = module.resources.report_generator_lambda_name
  description = "Report generator Lambda function name"
}

output "report_generator_lambda_role_name" {
  value       = module.resources.report_generator_lambda_role_name
  description = "Report generator Lambda IAM role name"
}

output "feature_export_lambda_name" {
  value       = module.resources.feature_export_lambda_name
  description = "Feature export Lambda function name"
}
