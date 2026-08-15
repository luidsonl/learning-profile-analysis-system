# Generates (with defaults below):
#   table  = learning-profile
#   files  = learning-profile-files
#   data   = learning-profile-data
#   queue  = learning-profile_reports
# Keep derived values in sync with sam-app/resources.env
region       = "us-east-1"
namespace    = ""
project_name = "learning-profile"
owner        = "luidsonl"

table_suffix        = ""
files_bucket_suffix = "-files"
data_bucket_suffix  = "-data"
queue_suffix        = "_reports"
