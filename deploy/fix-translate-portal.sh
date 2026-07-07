#!/bin/bash
# Fix translate.toolbasecamp.com showing main site (HTTPS vhost / cert / Docker)
set -euo pipefail

echo "========== translate.toolbasecamp.com fix =========="

apt-get update -qq
apt-get install -y certbot python3-certbot-nginx curl >/dev/null 2>&1 || true

echo ""
echo "[1] LibreTranslate Docker"
bash /opt/toolbasecamp-deploy/install-libretranslate.sh
bash /opt/toolbasecamp-deploy/build-libretranslate-app-patch.sh || true

echo ""
echo "[2] nginx + certificate"
bash /opt/toolbasecamp-deploy/patch-nginx-translate.sh

if [[ ! -f /opt/toolbasecamp-deploy/translate-ui-patch.js ]]; then
  echo "WARNING: translate-ui-patch.js missing — re-run GitHub Actions deploy."
else
  echo "OK: translate-ui-patch.js present"
fi

echo ""
echo "[3] Verify origin"
CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/ || echo 000)"
echo "LibreTranslate :5000 HTTP $CODE"

HTTPS_BODY="$(curl -sk https://127.0.0.1/ -H 'Host: translate.toolbasecamp.com' || true)"
echo -n "translate HTTPS title: "
echo "$HTTPS_BODY" | grep -oP '(?<=<title>)[^<]+' | head -1 || echo "(none)"

if echo "$HTTPS_BODY" | grep -qE '子站入口|Portals|Productivity Tools Hub|basecampTools'; then
  echo ""
  echo "ERROR: HTTPS still serves the main site."
  echo "  1) Cloudflare: set translate to DNS only (grey cloud) temporarily"
  echo "  2) sudo bash /opt/toolbasecamp-deploy/expand-portal-certs.sh"
  echo "  3) Re-run this script"
  exit 1
fi

echo ""
echo "SUCCESS. Hard-refresh https://translate.toolbasecamp.com (Ctrl+Shift+R)."
