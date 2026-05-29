#!/bin/bash
set -euo pipefail

PROJECT_ID=$(jq -r .gcp.project_id config.json)
PROJECT_NAME=$(jq -r .environments.prod.project_name config.json)

cat > .sops.yaml <<EOF
creation_rules:
  - path_regex: \\.enc\\.json$
    gcp_kms: projects/${PROJECT_ID}/locations/global/keyRings/${PROJECT_NAME}-sops-ring/cryptoKeys/${PROJECT_NAME}-sops-key
EOF
