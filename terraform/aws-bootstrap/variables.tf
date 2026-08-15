variable "region" {
  type        = string
  description = "AWS region for the Terraform state bucket"
  default     = "us-east-1"
}

variable "state_bucket_name" {
  type        = string
  description = "Globally unique name for the Terraform state S3 bucket"
}

variable "project_name" {
  type        = string
  description = "Project name used in default tags"
  default     = "learning-profile"
}

variable "owner" {
  type        = string
  description = "Owner tag value"
  default     = null
}

variable "environment" {
  type        = string
  description = "Environment tag value (leave empty for default)"
  default     = ""
}
