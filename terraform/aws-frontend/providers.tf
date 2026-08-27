terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }

  backend "s3" {
    bucket       = "luidsonl-learning-profile-terraform-state"
    key          = "terraform/aws-frontend/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      "env"     = var.environment
      "project" = var.project_name
      "manager" = "terraform"
      "owner"   = var.owner != null ? var.owner : "unknown"
      "purpose" = "frontend"
    }
  }
}
