#!/usr/bin/env bash
# Infrastructure E2E Security Validation Script
# Validates Zero Trust architecture by testing that unauthenticated and
# spoofed requests are blocked on both the native Cloud Run URL and the
# custom domain fronted by Cloudflare.
#
# Required environment variables:
#   CLOUD_RUN_URL      - Native Cloud Run service URL (from Terraform output)
#   APP_CUSTOM_DOMAIN  - Custom domain fronted by Cloudflare (from Terraform output)

set -euo pipefail

PASS=0
FAIL=0

check_env() {
  local var_name="$1"
  if [ -z "${!var_name:-}" ]; then
    echo "ERROR: Required environment variable $var_name is not set."
    exit 1
  fi
}

check_env CLOUD_RUN_URL
check_env APP_CUSTOM_DOMAIN

assert_status_in() {
  local description="$1"
  shift
  local actual="${!#}"  # last argument is actual status
  set -- "${@:1:$#-1}" # all but last are expected values

  for expected in "$@"; do
    if [ "$actual" -eq "$expected" ]; then
      echo "  ✓ PASS: $description (HTTP $actual)"
      PASS=$((PASS + 1))
      return
    fi
  done
  echo "  ✗ FAIL: $description — expected HTTP $*, got HTTP $actual"
  FAIL=$((FAIL + 1))
}

echo "=== Zero Trust Security Validation ==="
echo ""

# --- Test 1: Direct access to Cloud Run (no headers) ---
echo "[Test 1] Direct access to Cloud Run URL (no auth headers)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$CLOUD_RUN_URL")
assert_status_in "Direct bypass blocked" 401 403 "$STATUS"
echo ""

# --- Test 2: Spoofed JWT on Cloud Run ---
echo "[Test 2] Direct access to Cloud Run URL with fake JWT header"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  -H "Cf-Access-Jwt-Assertion: fake.jwt.token" \
  "$CLOUD_RUN_URL")
assert_status_in "Spoofed bypass blocked" 401 403 "$STATUS"
echo ""

# --- Test 3: Unauthenticated access to custom domain (no headers) ---
echo "[Test 3] Access custom domain without any auth headers"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  --no-location \
  "$APP_CUSTOM_DOMAIN")
assert_status_in "Unauthenticated custom domain blocked" 302 303 401 403 "$STATUS"
echo ""

# --- Test 4: Spoofed JWT on custom domain ---
echo "[Test 4] Access custom domain with fake JWT header"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  --no-location \
  -H "Cf-Access-Jwt-Assertion: fake.jwt.token" \
  "$APP_CUSTOM_DOMAIN")
assert_status_in "Spoofed custom domain blocked" 302 303 401 403 "$STATUS"
echo ""

# --- Summary ---
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
