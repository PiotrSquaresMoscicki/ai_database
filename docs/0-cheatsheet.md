gcloud auth login
gcloud config set project gamestudioinfra

gcloud services api-keys list

gcloud auth application-default login

gcloud config set project your-gcp-project-id

terraform init
terraform apply


gcloud services enable logging.googleapis.com
gcloud services api-keys create --display-name="Copilot Cloud Agent MCP" --api-target=service=logging.googleapis.com
gcloud services api-keys get-key-string $(gcloud services api-keys list --filter="displayName='Copilot Cloud Agent MCP'" --format="value(uid)")

{
  "mcpServers": {
    "gcp-logging": {
      "type": "sse",
      "url": "https://logging.googleapis.com/mcp",
      "headers": {
        "x-goog-api-key": "$COPILOT_MCP_GCP_API_KEY"
      },
      "tools": ["*"]
    }
  }
}