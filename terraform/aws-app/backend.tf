terraform {
  backend "s3" {
    bucket       = "luidsonl-learning-profile-terraform-state"
    key          = "terraform/aws-app/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
