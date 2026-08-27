output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.main.domain_name
  description = "CloudFront distribution domain name"
}

output "cloudfront_id" {
  value       = aws_cloudfront_distribution.main.id
  description = "CloudFront distribution ID"
}

output "bucket_name" {
  value       = aws_s3_bucket.frontend.id
  description = "S3 bucket name for the frontend"
}

output "api_endpoint" {
  value       = data.aws_cloudformation_export.api_url.value
  description = "API Gateway endpoint URL (from SAM CloudFormation export)"
}
