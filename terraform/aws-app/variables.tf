variable "region" {
  type    = string
  default = "us-east-1"
}

variable "namespace" {
  type        = string
  description = "Unique namespace prefix for globally unique resource names. Empty for learning-profile (bucket names are `learning-profile-files` etc., per architecture docs)."
  default     = ""
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

# ── Resource name suffixes ──────────────────────
variable "table_suffix" {
  type        = string
  description = "Suffix appended to the DynamoDB table name (e.g. '_test')"
  default     = ""
}

variable "files_bucket_suffix" {
  type        = string
  description = "Suffix appended to the files S3 bucket name"
  default     = "-files"
}

variable "data_bucket_suffix" {
  type        = string
  description = "Suffix appended to the ML data S3 bucket name"
  default     = "-data"
}

variable "queue_suffix" {
  type        = string
  description = "Suffix appended to the SQS report queue name"
  default     = "_reports"
}

variable "lambda_runtime" {
  type        = string
  description = "Runtime for async Lambdas"
  default     = "nodejs22.x"
}

variable "report_retention_days" {
  type        = number
  description = "Retention in days for generated report PDFs (LGPD retention policy)"
  default     = 90
}
