#!/bin/bash
# Emergency fix: dev.toolbasecamp.com HTTPS / mobile styles / inline portal bar
set -euo pipefail

echo "=== Fix dev portal HTTPS ==="

apt-get update -qq
apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1 || true

if [[ ! -f /var/www/toolbasecamp-dev/index.html ]]; then
  echo "ERROR: /var/www/toolbasecamp-dev/index.html missing — run GitHub Actions deploy first."
  exit 1
fi

bash /opt/toolbasecamp-deploy/patch-nginx-dev.sh

HTML="$(curl -sk https://127.0.0.1/ -H 'Host: dev.toolbasecamp.com' || true)"
if grep -q 'portal-home-bar.js' <<< "$HTML"; then
  echo "ERROR: dev still uses external portal-home-bar.js — inline inject failed."
  exit 1
fi
if ! grep -q 'portal-has-home-bar' <<< "$HTML"; then
  echo "ERROR: dev HTML missing inline portal bar."
  exit 1
fi
echo "OK: dev inline portal bar"

echo ""
echo "=== Compare titles (must differ) ==="
echo -n "dev HTTPS:  "
curl -sk https://127.0.0.1/ -H 'Host: dev.toolbasecamp.com' | grep -oP '(?<=<title>)[^<]+' | head -1 || echo "(none)"
echo -n "main HTTPS: "
curl -sk https://127.0.0.1/ -H 'Host: toolbasecamp.com' | grep -oP '(?<=<title>)[^<]+' | head -1 || echo "(none)"

echo ""
echo "Purge Cloudflare cache for dev.toolbasecamp.com, then hard-refresh on phone."
echo "Cloudflare SSL must be Full or Flexible (not Off)."
