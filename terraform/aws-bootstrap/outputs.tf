output "state_bucket" {
  value       = aws_s3_bucket.terraform_state.bucket
  description = "S3 bucket name for Terraform state"
}

output "state_bucket_arn" {
  value       = aws_s3_bucket.terraform_state.arn
  description = "S3 bucket ARN for Terraform state"
}
