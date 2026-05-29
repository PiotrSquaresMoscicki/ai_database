GCP Logs MCP Server
This repository contains a Model Context Protocol (MCP) server designed to expose Google Cloud Platform (GCP) logs to AI agents. It is specifically configured and tested to work with the GitHub Copilot Cloud Agent.

Because this service is secured behind Cloudflare Zero Trust, the connection requires a Service Token. Furthermore, to support remote execution, it utilizes Server-Sent Events (SSE) rather than standard HTTP endpoints.

🚀 Connecting GitHub Copilot Cloud Agent
To allow GitHub Copilot to autonomously fetch your GCP logs, you must configure it to recognize this MCP server and provide the necessary Cloudflare credentials.

Prerequisites
Deploy the Service: Ensure this repository has been deployed via GitHub Actions and the Cloud Run service is active.

Cloudflare Credentials: You need the client_id and client_secret generated during deployment.

Where to find them: Check the GCP Secret Manager in your project for a secret named mcp-COPILOT_TOKEN.

Step 1: Configure GitHub Environment Secrets
You cannot hardcode your Cloudflare credentials directly into the Copilot configuration. You must securely inject them using GitHub Environments.

Go to your repository Settings on GitHub.

In the left sidebar under Security, click Environments.

Create a new environment named exactly: copilot

Inside the copilot environment, click Add secret and create the following two secrets:

Name: COPILOT_MCP_CF_CLIENT_ID

Value: (Paste your Cloudflare Client ID)

Name: COPILOT_MCP_CF_CLIENT_SECRET

Value: (Paste your Cloudflare Client Secret)

⚠️ Important: The COPILOT*MCP* prefix is strictly required. GitHub Copilot will fail to substitute the variables if they are named anything else.

Step 2: Add the MCP Configuration
Next, you will provide Copilot with the JSON block that tells it where your server is and how to authenticate.

Still in your repository Settings, scroll down the left sidebar to Code & automation and click Copilot.

Select Cloud agent.

Scroll down to the MCP configuration section.

Paste the following JSON configuration:

JSON
{
"mcpServers": {
"gcp-logs-mcp": {
"type": "sse",
"url": "https://mcp.squaressoftware.com/api/mcp/sse",
"tools": ["*"],
"headers": {
"CF-Access-Client-Id": "$COPILOT_MCP_CF_CLIENT_ID",
        "CF-Access-Client-Secret": "$COPILOT_MCP_CF_CLIENT_SECRET"
}
}
}
}
Configuration Details:
type: Must be "sse" (Server-Sent Events). GitHub Copilot Cloud Agent does not support standard "http" for remote MCP servers.

url: Ensure this points directly to the /sse route, not the root domain.

tools: This array is mandatory for the Copilot Cloud Agent. Using ["*"] allows Copilot to discover and use all tools exposed by the server (currently fetch_gcp_logs).

Click Save. Copilot will validate the JSON syntax.

Step 3: Verification
To verify the connection is working, open GitHub Copilot and ask:

"What tools are available to you from the gcp-logs-mcp server?"

If configured correctly, Copilot will successfully complete the SSE handshake, read the tool schema, and reply that it can use fetch_gcp_logs to retrieve your Google Cloud logs.
