variable "region" {
  type    = string
  default = "us-east-1"
}

variable "namespace" {
  type        = string
  description = "Unique namespace prefix for globally unique resource names (e.g. S3 buckets)"
}

variable "project_name" {
  type        = string
  description = "Base name used for most resource names"
}

variable "environment" {
  type        = string
  description = "Environment name (e.g. staging, prod). Leave empty for default."
  default     = ""
}

variable "owner" {
  type        = string
  description = "Owner tag value"
  default     = null
}

variable "front_bucket_suffix" {
  type        = string
  description = "Suffix appended to the frontend S3 bucket name (e.g. '-front')"
  default     = "-front"
}

variable "oac_name_suffix" {
  type        = string
  description = "Suffix appended to the CloudFront OAC name (e.g. '-s3-oac')"
  default     = "-s3-oac"
}

variable "sam_stack_name" {
  type        = string
  description = "SAM CloudFormation stack name (used to look up the ApiEndpoint export)"
}

variable "frontend_enabled" {
  type        = bool
  description = "Deploy the SPA infra (S3 + CloudFront + upload). False while the SPA is absent — the module then creates nothing."
  default     = false
}
