output "cloudfront_domain_name" {
  value       = one(aws_cloudfront_distribution.main[*].domain_name)
  description = "CloudFront distribution domain name (null while the frontend is disabled)"
}

output "cloudfront_id" {
  value       = one(aws_cloudfront_distribution.main[*].id)
  description = "CloudFront distribution ID (null while the frontend is disabled)"
}

output "bucket_name" {
  value       = one(aws_s3_bucket.frontend[*].id)
  description = "S3 bucket name for the frontend (null while the frontend is disabled)"
}

output "api_endpoint" {
  value       = one(data.aws_cloudformation_export.api_url[*].value)
  description = "API Gateway endpoint URL (from SAM CloudFormation export; null while the frontend is disabled)"
}
