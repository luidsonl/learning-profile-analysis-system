locals {
  env_dash         = var.environment != "" ? "-${var.environment}" : ""
  env_under        = var.environment != "" ? "_${var.environment}" : ""
  name_prefix      = "${var.project_name}${local.env_dash}"
  full_prefix      = var.namespace != "" ? "${var.namespace}-${var.project_name}${local.env_dash}" : "${var.project_name}${local.env_dash}"
  files_bucket_arn = "arn:aws:s3:::${local.full_prefix}${var.files_bucket_suffix}"
  data_bucket_arn  = "arn:aws:s3:::${local.full_prefix}${var.data_bucket_suffix}"
}
