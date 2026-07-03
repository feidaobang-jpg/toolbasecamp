#!/bin/bash
# Emergency fix: dev.toolbasecamp.com HTTPS serves main site (Cloudflare Full + no :443 vhost)
set -euo pipefail

echo "=== Fix dev portal HTTPS ==="

apt-get update -qq
apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1 || true

if [[ ! -f /var/www/toolbasecamp-dev/index.html ]]; then
  echo "ERROR: /var/www/toolbasecamp-dev/index.html missing — run GitHub Actions deploy first."
  exit 1
fi

bash /opt/toolbasecamp-deploy/patch-nginx-dev.sh

echo ""
echo "=== Compare titles (must differ) ==="
echo -n "dev HTTPS:  "
curl -sk https://127.0.0.1/ -H 'Host: dev.toolbasecamp.com' | grep -oP '(?<=<title>)[^<]+' | head -1 || echo "(none)"
echo -n "main HTTPS: "
curl -sk https://127.0.0.1/ -H 'Host: toolbasecamp.com' | grep -oP '(?<=<title>)[^<]+' | head -1 || echo "(none)"

echo ""
echo "If dev shows Next Tools above, hard-refresh browser (Ctrl+Shift+R)."
echo "Cloudflare SSL must be Full or Flexible (not Off)."
