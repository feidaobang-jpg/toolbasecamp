#!/bin/bash
# Diagnose + fix chef.toolbasecamp.com (403/404/526)
set -euo pipefail

WEB_ROOT="/var/www/toolbasecamp-chef"
CERT="/etc/letsencrypt/live/toolbasecamp.com/fullchain.pem"

echo "========== chef.toolbasecamp.com fix =========="

echo ""
echo "=== 1. Static files ==="
if [[ -f "$WEB_ROOT/index.html" ]]; then
  echo "OK: $WEB_ROOT/index.html exists ($(wc -c < "$WEB_ROOT/index.html") bytes)"
  grep -i '<title' "$WEB_ROOT/index.html" | head -1 || true
else
  echo "ERROR: $WEB_ROOT/index.html MISSING"
  echo "  CyberChef is built in GitHub Actions (Node 24) and rsynced here."
  echo "  Fix: open GitHub → Actions → re-run the latest deploy on master."
  echo "  Or check the 'Build CyberChef portal' step for build failures."
  ls -la "$WEB_ROOT" 2>/dev/null || echo "  (directory empty or missing)"
  exit 1
fi

echo ""
echo "=== 2. TLS certificate SAN ==="
if [[ -f "$CERT" ]]; then
  openssl x509 -in "$CERT" -noout -text | grep -A1 'Subject Alternative Name' || true
  if ! openssl x509 -in "$CERT" -noout -text | grep -q 'chef.toolbasecamp.com'; then
    echo "WARNING: cert does not include chef.toolbasecamp.com"
    echo "  Temporarily set Cloudflare chef → DNS only (grey cloud), then run:"
    echo "  sudo bash /opt/toolbasecamp-deploy/expand-portal-certs.sh"
    echo "  sudo systemctl reload nginx"
  else
    echo "OK: cert includes chef.toolbasecamp.com"
  fi
else
  echo "WARNING: no cert at $CERT"
fi

echo ""
echo "=== 3. nginx vhost ==="
bash /opt/toolbasecamp-deploy/patch-nginx-chef.sh

echo ""
echo "=== 4. Local checks ==="
echo -n "HTTP :80  "
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/ -H 'Host: chef.toolbasecamp.com'
echo -n "HTTPS :443 "
curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1/ -H 'Host: chef.toolbasecamp.com'

BODY="$(curl -sk https://127.0.0.1/ -H 'Host: chef.toolbasecamp.com' || true)"
if echo "$BODY" | grep -qi 'cyberchef'; then
  echo "SUCCESS: origin serves CyberChef. Hard-refresh browser (Ctrl+Shift+R)."
else
  echo "WARNING: origin HTML does not look like CyberChef."
  echo "$BODY" | head -c 300
  echo ""
fi
