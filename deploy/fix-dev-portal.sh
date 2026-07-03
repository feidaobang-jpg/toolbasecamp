#!/bin/bash
# One-shot diagnose + fix for dev.toolbasecamp.com (run on server Web Console)
set -euo pipefail

echo "========== Tool Basecamp dev portal fix =========="

echo ""
echo "[1] DNS should be A record dev -> server IP (check in Cloudflare UI)"
echo "    This script only fixes nginx + verifies files on this server."

echo ""
echo "[2] Web root"
WEB_ROOT="/var/www/toolbasecamp-dev"
mkdir -p "$WEB_ROOT"
ls -la "$WEB_ROOT" | head -12
if [[ -L "$WEB_ROOT" ]]; then
  echo "ERROR: $WEB_ROOT is a symlink — should be a real directory."
  exit 1
fi
if [[ ! -f "$WEB_ROOT/index.html" ]]; then
  echo "ERROR: missing $WEB_ROOT/index.html"
  echo "Fix: GitHub -> Actions -> Deploy Tool Basecamp -> Run workflow"
  exit 1
fi
grep -i '<title' "$WEB_ROOT/index.html" | head -1 || true

echo ""
echo "[3] Nginx dev vhost"
if [[ -f /opt/toolbasecamp-deploy/patch-nginx-dev.sh ]]; then
  bash /opt/toolbasecamp-deploy/patch-nginx-dev.sh
else
  echo "ERROR: /opt/toolbasecamp-deploy/patch-nginx-dev.sh not found"
  echo "Push latest code and run GitHub Actions deploy first."
  exit 1
fi

echo ""
echo "[4] Public URL (via Cloudflare)"
PUBLIC_CODE="$(curl -s -o /tmp/tbc-dev-public.html -w '%{http_code}' \
  'https://dev.toolbasecamp.com/' || echo '000')"
echo "HTTPS $PUBLIC_CODE"
head -c 300 /tmp/tbc-dev-public.html
echo ""

if [[ "$PUBLIC_CODE" == "200" ]] && grep -qi 'next tools' /tmp/tbc-dev-public.html; then
  echo ""
  echo "SUCCESS: https://dev.toolbasecamp.com is serving next-tools."
  exit 0
fi

if grep -q 'Tool Basecamp — Productivity Tools Hub' /tmp/tbc-dev-public.html 2>/dev/null; then
  echo ""
  echo "Local nginx is OK but public URL still shows main site."
  echo "Cloudflare: Rules -> disable redirect/worker on dev; Caching -> Purge dev.toolbasecamp.com"
  exit 1
fi

echo ""
echo "Check complete — see messages above."
