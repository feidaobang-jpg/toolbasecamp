#!/bin/bash
# Fix hoppscotch.toolbasecamp.com showing main site (HTTPS vhost / cert / Docker)
set -euo pipefail

echo "========== hoppscotch.toolbasecamp.com fix =========="

apt-get update -qq
apt-get install -y certbot python3-certbot-nginx curl >/dev/null 2>&1 || true

echo ""
echo "[1] Hoppscotch Docker (postgres + app)"
bash /opt/toolbasecamp-deploy/install-hoppscotch.sh

echo ""
echo "[2] nginx + certificate"
bash /opt/toolbasecamp-deploy/patch-nginx-hoppscotch.sh

echo ""
echo "[3] Verify origin"
CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || echo 000)"
echo "Hoppscotch app :3000 HTTP $CODE"

HTTPS_BODY="$(curl -sk https://127.0.0.1/ -H 'Host: hoppscotch.toolbasecamp.com' || true)"
echo -n "hoppscotch HTTPS title: "
echo "$HTTPS_BODY" | grep -oP '(?<=<title>)[^<]+' | head -1 || echo "(none)"

if echo "$HTTPS_BODY" | grep -qE '子站入口|Portals|Productivity Tools Hub|basecampTools'; then
  echo ""
  echo "ERROR: HTTPS still serves the main site."
  echo "  1) Cloudflare: set hoppscotch to DNS only (grey cloud) temporarily"
  echo "  2) sudo bash /opt/toolbasecamp-deploy/expand-portal-certs.sh"
  echo "  3) Re-run this script"
  exit 1
fi

echo ""
echo "SUCCESS. Hard-refresh https://hoppscotch.toolbasecamp.com (Ctrl+Shift+R)."
