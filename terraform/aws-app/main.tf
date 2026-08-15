module "resources" {
  source = "./resources"

  namespace             = var.namespace
  project_name          = var.project_name
  environment           = var.environment
  table_suffix          = var.table_suffix
  files_bucket_suffix   = var.files_bucket_suffix
  data_bucket_suffix    = var.data_bucket_suffix
  queue_suffix          = var.queue_suffix
  lambda_runtime        = var.lambda_runtime
  report_retention_days = var.report_retention_days
}
