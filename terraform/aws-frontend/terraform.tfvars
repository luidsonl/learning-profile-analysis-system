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

# No SPA for now (owner removed it; planned rebuild in Angular) — keep the
# module inert so `terraform validate`/`plan`/`apply` and `make deploy` don't
# break. Flip to true and run `make frontend` when the SPA is reintroduced.
frontend_enabled = false
