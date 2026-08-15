# ---------------------------------------------------------------------------
# Modules
# ---------------------------------------------------------------------------
module "database" {
  source     = "./modules/database"
  table_name = "${var.project_name}${local.env_under}${var.table_suffix}"
}

module "files" {
  source                = "./modules/files"
  bucket_name           = "${local.full_prefix}${var.files_bucket_suffix}"
  report_retention_days = var.report_retention_days
}

module "data" {
  source      = "./modules/data"
  bucket_name = "${local.full_prefix}${var.data_bucket_suffix}"
}

module "report_queue" {
  source              = "./modules/report-queue"
  queue_name          = "${var.project_name}${local.env_under}${var.queue_suffix}"
  project_name        = var.project_name
  dynamodb_table_name = module.database.table_name
  dynamodb_table_arn  = module.database.table_arn
  files_bucket_name   = "${local.full_prefix}${var.files_bucket_suffix}"
  files_bucket_arn    = local.files_bucket_arn
  lambda_runtime      = var.lambda_runtime
}

module "feature_export" {
  source              = "./modules/feature-export"
  project_name        = var.project_name
  dynamodb_table_name = module.database.table_name
  dynamodb_table_arn  = module.database.table_arn
  data_bucket_name    = "${local.full_prefix}${var.data_bucket_suffix}"
  data_bucket_arn     = local.data_bucket_arn
  lambda_runtime      = var.lambda_runtime
}
