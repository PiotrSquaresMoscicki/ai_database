terraform {
  required_version = ">= 1.5.0"

  # The bucket name is injected dynamically via GitHub Actions
  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "google" {
  project = local.config.gcp.project_id
  region  = local.region
}

provider "cloudflare" {
  api_token = local.secrets.cloudflare_api_token
}