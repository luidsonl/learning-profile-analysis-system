terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
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
    }
  }
}
