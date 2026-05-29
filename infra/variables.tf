variable "app_image" {
  description = "The Docker image URL to deploy"
  type        = string
  default     = "node:22-bookworm-slim"
}

variable "db_password" {
  description = "Database password loaded from secrets.auto.tfvars.json"
  type        = string
  sensitive   = true
}

variable "gemini_api_key" {
  description = "Google Gemini API key loaded from secrets.auto.tfvars.json"
  type        = string
  sensitive   = true
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token loaded from secrets.auto.tfvars.json"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID (passed by the deploy workflow from config.json)"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID (passed by the deploy workflow from config.json)"
  type        = string
}
