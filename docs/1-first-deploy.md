# Getting Started: First Deploy

Welcome to your new infrastructure repository. This template provisions a secure, Zero Trust Cloud Run web service fronted by Cloudflare Access with JWT validation.

## Design Choices & Architecture

Before diving into the setup, it is important to understand the architectural decisions driving this repository's structure:

1. **Two-Phase Deployment (`bootstrap/` vs `infra/`):** We solve the Terraform "chicken-and-egg" problem by splitting the code. The `bootstrap/` directory is run manually exactly once to create the Terraform state bucket, Key Management Service (KMS), and Workload Identity Federation (WIF). The `infra/` directory contains the actual application and is deployed exclusively by GitHub Actions.
2. **GitOps Secret Management (SOPS):** We do not inject secrets manually via CLI scripts. All secrets (like the Cloudflare API token or database passwords) are stored securely in the repository using Mozilla SOPS. They are encrypted at rest using a Google Cloud KMS key and decrypted on the fly by the CI/CD pipeline.
3. **Keyless Authentication (WIF):** GitHub Actions authenticates to Google Cloud using Workload Identity Federation. There are no long-lived JSON service account keys stored in GitHub, dramatically reducing the risk of credential leakage.
4. **Zero Trust Ingress:** The Cloud Run service is publicly addressable but fronted by Cloudflare Access. Cloudflare DNS proxies to the native `.run.app` origin, a Cloudflare Origin Rule rewrites the Host header to that origin, Cloudflare Access authenticates users at the edge, and the application validates the `Cf-Access-Jwt-Assertion` JWT on every request as defense-in-depth so no one can bypass your Cloudflare Access policies.

---

## Prerequisites

Before starting, ensure you have the following installed locally:

- [Google Cloud CLI (`gcloud`)](https://cloud.google.com/sdk/docs/install)
- [Terraform CLI](https://developer.hashicorp.com/terraform/downloads)
- [Mozilla SOPS](https://github.com/getsops/sops)

You also need accounts on **Google Cloud** and **Cloudflare** (with a domain already added to Cloudflare).

---

## Obtaining Required Secrets & IDs

Before running any Terraform, you need to gather several values from the Google Cloud Console and the Cloudflare Dashboard. This section walks you through each one.

### Google Cloud: Create a Project and Find Your IDs

1. **Create a new Google Cloud Project:**
   - Go to [console.cloud.google.com](https://console.cloud.google.com/).
   - Click the project selector dropdown at the top of the page (next to "Google Cloud").
   - Click **New Project**.
   - Enter a **Project name** (e.g., `my-web-service`).
   - Note the **Project ID** shown below the name field — this is the globally-unique identifier you will use everywhere (it may differ from the name if the name is already taken). You can also edit it before creating.
   - Click **Create**.

2. **Find your Project ID and Project Number later:**
   - Go to [console.cloud.google.com](https://console.cloud.google.com/) and select your project.
   - Open the navigation menu (☰) → **IAM & Admin** → **Settings** (or simply look at the **Dashboard** home page).
   - Your **Project ID** (a string like `my-web-service-123456`) and **Project Number** (a numeric value like `743511732787`) are both displayed on this page.

3. **Enable billing:**
   - A billing account must be linked to the project for Cloud Run, KMS, and other services to work. Go to **Billing** in the navigation menu and link or create a billing account.

### Cloudflare: Find Your Account ID, Zone ID, and Team Name

1. **Find your Account ID:**
   - Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
   - On the left sidebar, click the account/home icon. Your **Account ID** is displayed on the right side of the account overview page under **API**.
   - Alternatively: select any domain → scroll down on the **Overview** page → look at the right-hand sidebar under **API** → **Account ID**.

2. **Find your Zone ID:**
   - In the Cloudflare Dashboard, click on the domain (zone) you want to use for this service.
   - On the **Overview** page, look at the right-hand sidebar under **API**.
   - Copy the **Zone ID** value.

3. **Find your Team Name (for Zero Trust / Cloudflare Access):**
   - In the Cloudflare Dashboard, go to **Zero Trust** (from the left navigation or via [one.dash.cloudflare.com](https://one.dash.cloudflare.com/)).
   - Navigate to **Settings** → **Custom Pages** (or **Settings** → **General**).
   - Your **Team name** is the subdomain of `<team-name>.cloudflareaccess.com`. For example, if your access URL is `mycompany.cloudflareaccess.com`, your team name is `mycompany`.
   - If you haven't set up Zero Trust yet, you'll be prompted to choose a team name during the onboarding flow.

### Cloudflare: Create an API Token

The Cloudflare API Token is the main secret that Terraform uses to manage your DNS records, Access policies, and Workers. You must create one with the correct permissions.

1. **Go to the API Tokens page:**
   - In the Cloudflare Dashboard, click your profile icon (top-right) → **My Profile** → **API Tokens** tab.
   - Or navigate directly to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens).

2. **Create a Custom Token:**
   - Click **Create Token**.
   - Choose **Create Custom Token** (at the bottom, click "Get started").

3. **Configure permissions:**
   - **Token name:** Give it a descriptive name (e.g., `Terraform - web-service-template`).
   - **Permissions** — add the following permission rows:
     | Resource | Permission |
     |----------|-----------|
     | Zone → Zone | Read |
     | Zone → DNS | Edit |
     | Zone → Workers Routes | Edit |
     | Account → Cloudflare Workers Scripts | Edit |
     | Account → Access: Apps and Policies | Edit |
   - **Zone Resources:** Set to **Include → Specific zone** → select the domain you'll use.
   - **Account Resources:** Set to **Include → Your account**.
   - Leave IP filtering and TTL as defaults (or restrict if desired).

4. **Create and copy the token:**
   - Click **Continue to summary**, then **Create Token**.
   - **Copy the token value immediately** — it is shown only once. This is the value you will put into `secrets.enc.json` as `cloudflare_api_token`.

---

## Step-by-Step Setup Guide

### Step 1: Scaffold the Project Identities

You must replace the template placeholders with your specific project names. **Always use hyphens** (e.g., `my-cool-app`), as Google Cloud restricts underscores in certain resource names (like service accounts and buckets).

**1. Update Bootstrap Variables:**
Open `bootstrap/terraform.tfvars` and configure the foundational identities:

```hcl
project_name = "web-service-template"
project_id   = "your-gcp-project-id"
github_repo  = "your-github-username/your-repo-name"
```

**2. Update Infrastructure Variables:**
Open `infra/stage.tfvars` and `infra/prod.tfvars` (the workflow selects between them) and configure your application's routing and access logic. Use the values you gathered in the [Obtaining Required Secrets & IDs](#obtaining-required-secrets--ids) section above:

~~~hcl
project_name          = "web-service-template"
project_id            = "your-gcp-project-id"          # From GCP Console → IAM & Admin → Settings
custom_domain         = "app.example.com"
cloudflare_zone_id    = "your-zone-id"                 # From Cloudflare Dashboard → your domain → Overview → API
cloudflare_account_id = "your-account-id"              # From Cloudflare Dashboard → Overview → API
allowed_google_emails = ["your.email@gmail.com"]
~~~

**3. Update SOPS Configuration:**
Open the `.sops.yaml` file in the root directory. Update the `gcp_kms` path with your **Project ID** and **Project Name**:

```yaml
creation_rules:
  - path_regex: \.enc\.json$
    gcp_kms: projects/your-gcp-project-id/locations/global/keyRings/web-service-template-sops-ring/cryptoKeys/web-service-template-sops-key
```

### Step 2: Bootstrap the Foundation (Manual)

This step creates the state bucket, the KMS encryption key, and sets up GitHub's permission to deploy.

**1.** Authenticate your local terminal with Google Cloud:

```bash
gcloud auth application-default login
gcloud config set project your-gcp-project-id
```

**2.** Navigate to the bootstrap directory and deploy:

```bash
cd bootstrap/
terraform init
terraform apply
```

**3.** After the apply finishes, Terraform will print several outputs to your terminal (e.g., `GCP_WIF_PROVIDER`, `GCS_BACKEND_BUCKET`, `GCP_SERVICE_ACCOUNT`). Keep your terminal open; you will need these in the next step.

### Step 3: Configure GitHub Actions Variables

Navigate to your repository on GitHub. Go to **Settings > Secrets and variables > Actions > Variables**.

Create the following plain-text variables using the outputs from the bootstrap step:

- `GCP_PROJECT_ID`: Your exact Google Cloud Project ID.
- `GCP_WIF_PROVIDER`: The Workload Identity Provider string from Terraform outputs.
- `GCP_SERVICE_ACCOUNT`: The GitHub Actions service account email from Terraform outputs.
- `GCS_BACKEND_BUCKET`: The Terraform state bucket name from Terraform outputs.

### Step 4: Encrypt Application Secrets

Now that the KMS key is created, you can securely encrypt your application secrets.

**1.** Navigate to the `infra/` directory.
**2.** Create a new file named secrets.enc.json and paste the following raw JSON into it. Replace the placeholders with your actual values (see [Create an API Token](#cloudflare-create-an-api-token) above for the Cloudflare token):

```json
{
  "cloudflare_api_token": "YOUR_ACTUAL_TOKEN_HERE",
  "db_password": "YOUR_ACTUAL_PASSWORD_HERE",
  "gemini_api_key": "YOUR_ACTUAL_GEMINI_API_KEY_HERE"
}
```

> `gemini_api_key` is consumed by the `/api/chat` endpoint. Create it at
> <https://aistudio.google.com/app/apikey>. It is injected into Cloud Run as
> the `GEMINI_API_KEY` environment variable via Secret Manager.

**3.** Initialize SOPS to encrypt the file in place

```bash
sops -e -i secrets.enc.json
```

**4.** Once run, open the file in your editor. You will see that your plaintext passwords are now cipher text and a sops metadata block has been appended to the bottom of the file. From now on, you can simply run sops secrets.enc.json to safely view or edit the file.

### What Happens Next?

Navigate to the **Actions** tab in your GitHub repository. You will see the pipeline running. It will:

1. Authenticate to Google Cloud seamlessly without a password.
2. Decrypt `secrets.enc.json` into memory.
3. Initialize the remote state bucket.
4. Provision your Cloudflare DNS, Zero Trust Access application, Cloudflare origin rule, and Cloud Run web service.

Future updates to your infrastructure or secrets will only require modifying the files in `infra/` and pushing the changes to Git. You never have to run `bootstrap` again.
