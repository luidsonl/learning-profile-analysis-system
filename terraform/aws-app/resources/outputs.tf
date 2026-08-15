output "table_name" {
  value       = module.database.table_name
  description = "DynamoDB table name (consumed by SAM)"
}

output "table_arn" {
  value       = module.database.table_arn
  description = "DynamoDB table ARN"
}

output "files_bucket_name" {
  value       = module.files.bucket_id
  description = "S3 bucket name for reports/documents"
}

output "files_bucket_arn" {
  value       = module.files.bucket_arn
  description = "S3 bucket ARN for reports/documents"
}

output "data_bucket_name" {
  value       = module.data.bucket_id
  description = "S3 bucket name for ML snapshots/artifacts"
}

output "data_bucket_arn" {
  value       = module.data.bucket_arn
  description = "S3 bucket ARN for ML snapshots/artifacts"
}

output "report_queue_url" {
  value       = module.report_queue.queue_url
  description = "SQS report queue URL"
}

output "report_queue_arn" {
  value       = module.report_queue.queue_arn
  description = "SQS report queue ARN"
}

output "report_generator_lambda_name" {
  value       = module.report_queue.lambda_function_name
  description = "Report generator Lambda function name"
}

output "report_generator_lambda_role_name" {
  value       = module.report_queue.lambda_role_name
  description = "Report generator Lambda IAM role name"
}

output "feature_export_lambda_name" {
  value       = module.feature_export.lambda_function_name
  description = "Feature export Lambda function name"
}

output "feature_export_lambda_role_name" {
  value       = module.feature_export.lambda_role_name
  description = "Feature export Lambda IAM role name"
}
