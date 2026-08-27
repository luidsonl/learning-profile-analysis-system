locals {
  env_dash    = var.environment != "" ? "-${var.environment}" : ""
  name_prefix = "${var.project_name}${local.env_dash}"
  full_prefix = "${var.namespace}-${var.project_name}${local.env_dash}"

  bucket_name   = "${local.full_prefix}${var.front_bucket_suffix}"
  oac_name      = "${local.name_prefix}${var.oac_name_suffix}"
  s3_origin_id  = "${local.name_prefix}-s3"
  api_origin_id = "${local.name_prefix}-api"
}
