variable "namespace" {
  type    = string
  default = ""
}

variable "project_name" {
  type = string
}

variable "environment" {
  type    = string
  default = ""
}

variable "table_suffix" {
  type    = string
  default = ""
}

variable "files_bucket_suffix" {
  type    = string
  default = "-files"
}

variable "data_bucket_suffix" {
  type    = string
  default = "-data"
}

variable "queue_suffix" {
  type    = string
  default = "_reports"
}

variable "lambda_runtime" {
  type    = string
  default = "nodejs22.x"
}

variable "report_retention_days" {
  type    = number
  default = 90
}
