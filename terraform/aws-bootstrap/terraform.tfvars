# Must match the bucket name used in terraform/aws-app/backend.hcl
# Globally unique (buckets are global namespace)
region            = "us-east-1"
state_bucket_name = "luidsonl-learning-profile-terraform-state"
project_name      = "learning-profile"
owner             = "luidsonl"
environment       = ""
