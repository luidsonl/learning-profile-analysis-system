variable "queue_name" {
  type = string
}

variable "project_name" {
  type = string
}

variable "dynamodb_table_name" {
  type = string
}

variable "dynamodb_table_arn" {
  type = string
}

variable "files_bucket_name" {
  type = string
}

variable "files_bucket_arn" {
  type = string
}

variable "lambda_runtime" {
  type    = string
  default = "nodejs22.x"
}
