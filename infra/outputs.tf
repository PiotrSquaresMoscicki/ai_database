output "service_name" {
  description = "The deployed Cloud Run service name"
  value       = google_cloud_run_v2_service.default.name
}

output "cloud_run_url" {
  description = "The native Cloud Run service URL"
  value       = google_cloud_run_v2_service.default.uri
}

output "custom_domain" {
  description = "The custom domain fronted by Cloudflare"
  value       = "https://${local.env.custom_domain}"
}