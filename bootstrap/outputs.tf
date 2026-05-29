output "GCP_WIF_PROVIDER" {
  value = google_iam_workload_identity_pool_provider.github_provider.name
}

output "GCP_SERVICE_ACCOUNT" {
  value = google_service_account.github_actions.email
}

output "GCS_BACKEND_BUCKET" {
  value = google_storage_bucket.terraform_state.name
}