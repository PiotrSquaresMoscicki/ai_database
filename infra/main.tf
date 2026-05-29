locals {
  config         = jsondecode(file("../config.json"))
  env            = local.config.environments[terraform.workspace]
  secrets        = fileexists("secrets.auto.tfvars.json") ? jsondecode(file("secrets.auto.tfvars.json")) : {}
  region         = try(local.env.region, "europe-central2")
  container_port = try(local.env.container_port, 80)
}

# 1. Secret Manager Bindings for Cloud Run
resource "google_secret_manager_secret" "db_password" {
  secret_id = "${local.env.project_name}-DB_PASSWORD"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password_data" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = local.secrets.db_password
}

data "google_compute_default_service_account" "default" {}

resource "google_secret_manager_secret_iam_member" "db_password_accessor" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_compute_default_service_account.default.email}"
}

# Secret Manager binding for the Gemini API key consumed by the /api/chat
# endpoint. Kept in the same SOPS-encrypted secrets file as db_password so
# the deploy workflow loads it via secrets.auto.tfvars.json.
resource "google_secret_manager_secret" "gemini_api_key" {
  secret_id = "${local.env.project_name}-GEMINI_API_KEY"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "gemini_api_key_data" {
  secret      = google_secret_manager_secret.gemini_api_key.id
  secret_data = local.secrets.gemini_api_key
}

resource "google_secret_manager_secret_iam_member" "gemini_api_key_accessor" {
  secret_id = google_secret_manager_secret.gemini_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_compute_default_service_account.default.email}"
}

# Enable the APIs needed for browser-side client error reporting:
#   - clouderrorreporting.googleapis.com receives the events:report POSTs
#   - apikeys.googleapis.com lets us provision the browser-restricted API key
resource "google_project_service" "clouderrorreporting" {
  service            = "clouderrorreporting.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "apikeys" {
  service            = "apikeys.googleapis.com"
  disable_on_destroy = false
}

# Browser-exposed API key used by app/src/telemetry.js to POST directly to
# https://clouderrorreporting.googleapis.com/v1beta1/projects/{p}/events:report
# Restricted to the Error Reporting API target and the application's HTTP
# referrer, so leaking it from page source does not enable abuse from other
# origins.
resource "google_apikeys_key" "error_reporting_browser" {
  name         = "${local.env.project_name}-err-rep-browser"
  display_name = "${local.env.project_name} Error Reporting (browser)"

  restrictions {
    api_targets {
      service = "clouderrorreporting.googleapis.com"
    }
    browser_key_restrictions {
      allowed_referrers = [
        "https://${local.env.custom_domain}/*",
        "https://${local.env.custom_domain}",
      ]
    }
  }

  depends_on = [
    google_project_service.apikeys,
    google_project_service.clouderrorreporting,
  ]
}

# 2. Cloudflare Zero Trust Access Application & Policy
resource "cloudflare_zero_trust_access_application" "secure_service" {
  zone_id                   = local.config.cloudflare.zone_id
  name                      = "${local.env.project_name} Secure App"
  domain                    = local.env.custom_domain
  session_duration          = "24h"
  auto_redirect_to_identity = true
}

resource "cloudflare_zero_trust_access_policy" "google_accounts_only" {
  application_id = cloudflare_zero_trust_access_application.secure_service.id
  zone_id        = local.config.cloudflare.zone_id
  name           = "${local.env.project_name} - Allow Specific Accounts"
  precedence     = 1
  decision       = "allow"

  include {
    email = local.config.security.allowed_google_emails
  }
}

# 3. Cloud Run V2 Deployment
resource "google_cloud_run_v2_service" "default" {
  name     = local.env.project_name
  location = local.region
  ingress  = "INGRESS_TRAFFIC_ALL"
  depends_on = [
    google_secret_manager_secret_version.db_password_data,
    google_secret_manager_secret_iam_member.db_password_accessor,
    google_secret_manager_secret_version.gemini_api_key_data,
    google_secret_manager_secret_iam_member.gemini_api_key_accessor,
  ]

  template {
    scaling {
      min_instance_count = 1
    }

    # Web Service Container
    containers {
      name  = local.env.project_name
      image = var.app_image
      ports {
        container_port = local.container_port
      }
      env {
        name  = "CLOUDFLARE_AUDIENCE_TAG"
        value = cloudflare_zero_trust_access_application.secure_service.aud
      }
      env {
        name  = "CLOUDFLARE_TEAM_DOMAIN"
        value = "https://${local.config.cloudflare.team_name}.cloudflareaccess.com"
      }
      env {
        name = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_password.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini_api_key.secret_id
            version = "latest"
          }
        }
      }
      # Project id surfaced to both the server logger and the browser telemetry
      # module (via /api/client-config).
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = local.config.gcp.project_id
      }
      # Browser-exposed, referrer-restricted API key for direct Browser →
      # GCP Error Reporting POSTs. Returned to the SPA by /api/client-config.
      env {
        name  = "ERROR_REPORTING_BROWSER_API_KEY"
        value = google_apikeys_key.error_reporting_browser.key_string
      }
      env {
        name  = "APP_SERVICE"
        value = local.env.project_name
      }
    }
  }
}

# 4. Allow unauthenticated invocations (Cloudflare Access enforces auth at the edge,
#    the application enforces JWT validation defense-in-depth).
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = google_cloud_run_v2_service.default.project
  location = google_cloud_run_v2_service.default.location
  name     = google_cloud_run_v2_service.default.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# 5. Point DNS at the Cloud Run service. The Cloudflare Worker (below) intercepts
#    requests on this hostname and rewrites the Host header before forwarding to
#    Cloud Run, so we point straight at the native run.app hostname here.
resource "cloudflare_record" "service_cname" {
  zone_id = var.cloudflare_zone_id
  name    = local.env.custom_domain
  type    = "CNAME"
  content = replace(google_cloud_run_v2_service.default.uri, "https://", "")
  proxied = true
}

# 6. Cloudflare Worker reverse proxy that rewrites the Host header to the native
#    Cloud Run hostname. This works around the Enterprise-tier restriction on
#    Host header rewrites in cloudflare_ruleset.
resource "cloudflare_worker_script" "cloud_run_proxy" {
  account_id = var.cloudflare_account_id
  name       = "${local.env.project_name}-proxy"
  module     = true
  content    = <<-EOT
    export default {
      async fetch(request) {
        const url = new URL(request.url);
        url.hostname = "${replace(google_cloud_run_v2_service.default.uri, "https://", "")}";
        const newHeaders = new Headers(request.headers);
        newHeaders.set("Host", "${replace(google_cloud_run_v2_service.default.uri, "https://", "")}");
        const newReq = new Request(url.toString(), {
          method: request.method,
          headers: newHeaders,
          body: request.body,
          redirect: "manual",
        });
        return fetch(newReq);
      },
    };
  EOT
}

resource "cloudflare_worker_route" "cloud_run_route" {
  zone_id     = var.cloudflare_zone_id
  pattern     = "${local.env.custom_domain}/*"
  script_name = cloudflare_worker_script.cloud_run_proxy.name
}
