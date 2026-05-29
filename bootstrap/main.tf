terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "google" {
  project = local.config.gcp.project_id
  region  = var.region
}

locals {
  config       = jsondecode(file("../config.json"))
  project_name = local.config.environments.prod.project_name
}

# 1. Enable Required APIs
locals {
  services = [
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "secretmanager.googleapis.com",
    "run.googleapis.com",
    "compute.googleapis.com",
    "cloudkms.googleapis.com",
    "clouderrorreporting.googleapis.com",
    "apikeys.googleapis.com",
    "artifactregistry.googleapis.com"
  ]
}

resource "google_project_service" "enabled_services" {
  for_each           = toset(local.services)
  project            = local.config.gcp.project_id
  service            = each.key
  disable_on_destroy = false
}

# 2. Remote State Bucket
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "google_storage_bucket" "terraform_state" {
  project       = local.config.gcp.project_id
  name          = "${local.project_name}-tfstate-${random_id.bucket_suffix.hex}"
  location      = var.region
  force_destroy = false
  
  uniform_bucket_level_access = true
  
  versioning {
    enabled = true
  }

  depends_on = [google_project_service.enabled_services]
}

# 3. GitHub Actions Service Account & Roles
resource "google_service_account" "github_actions" {
  project      = local.config.gcp.project_id
  account_id   = "${local.project_name}-gha"
  display_name = "GitHub Actions SA for ${local.project_name}"
  depends_on   = [google_project_service.enabled_services]
}

locals {
  roles = [
    "roles/run.admin",
    "roles/iam.serviceAccountUser",
    "roles/secretmanager.admin",
    "roles/storage.admin",
    "roles/resourcemanager.projectIamAdmin",
    "roles/compute.viewer",
    "roles/cloudkms.cryptoKeyDecrypter",
    "roles/serviceusage.apiKeysAdmin" # Add this line
  ]
}

resource "google_project_iam_member" "sa_roles" {
  for_each = toset(local.roles)
  project  = local.config.gcp.project_id
  role     = each.key
  member   = "serviceAccount:${google_service_account.github_actions.email}"
}

# 4. Workload Identity Federation
resource "google_iam_workload_identity_pool" "github_pool" {
  project                   = local.config.gcp.project_id
  workload_identity_pool_id = "${local.project_name}-pool"
  display_name              = "WIF Pool for ${local.project_name}"
  depends_on                = [google_project_service.enabled_services]
}

resource "google_iam_workload_identity_pool_provider" "github_provider" {
  project                            = local.config.gcp.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "${local.project_name}-prv"
  display_name                       = "WIF Provider for ${local.project_name}"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }
  
  attribute_condition = "assertion.repository == '${local.config.github_repo}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_sa_bind" {
  service_account_id = google_service_account.github_actions.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_pool.name}/attribute.repository/${local.config.github_repo}"
}

# 5. SOPS Key Management Service (KMS)
resource "google_kms_key_ring" "sops" {
  project    = local.config.gcp.project_id
  name       = "${local.project_name}-sops-ring"
  location   = "global"
  depends_on = [google_project_service.enabled_services]
}

resource "google_kms_crypto_key" "sops_key" {
  name            = "${local.project_name}-sops-key"
  key_ring        = google_kms_key_ring.sops.id
  rotation_period = "7776000s" # 90 days
}

# Grant local admin permission to encrypt files locally
data "google_client_openid_userinfo" "me" {}

resource "google_kms_crypto_key_iam_member" "local_admin" {
  crypto_key_id = google_kms_crypto_key.sops_key.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "user:${data.google_client_openid_userinfo.me.email}"
}

# 6. Pre-create the Cloudflare API Token Container
resource "google_secret_manager_secret" "cf_token" {
  project   = local.config.gcp.project_id
  secret_id = "${local.project_name}-CF_API_TOKEN"
  
  replication {
    auto {}
  }
  
  depends_on = [google_project_service.enabled_services]
}

resource "google_artifact_registry_repository" "app_repo" {
  project       = local.config.gcp.project_id
  location      = var.region
  repository_id = "${local.project_name}-repo"
  description   = "Docker repository for application images"
  format        = "DOCKER"
  depends_on    = [google_project_service.enabled_services]
}

resource "google_artifact_registry_repository_iam_member" "github_actions_writer" {
  project    = local.config.gcp.project_id
  location   = google_artifact_registry_repository.app_repo.location
  repository = google_artifact_registry_repository.app_repo.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.github_actions.email}"
}