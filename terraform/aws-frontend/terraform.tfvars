# Generates (with defaults below):
#   bucket = learning-profile-front
#   oac    = learning-profile-s3-oac
region       = "us-east-1"
namespace    = ""
project_name = "learning-profile"
environment  = ""
owner        = "luidsonl"

sam_stack_name = "learning-profile-api"

front_bucket_suffix = "-front"
oac_name_suffix     = "-s3-oac"

# Angular SPA scaffolded at frontend/; deploy via `make frontend` (passes
# frontend_enabled=true). Keep the module inert for plain terraform runs so
# `terraform validate`/`plan`/`apply` and `make deploy` don't force-create it.
frontend_enabled = false
