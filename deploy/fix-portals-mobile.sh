#!/bin/bash
# Fix mobile/pdf timeout: Stirling memory, warmup, nginx, Cloudflare grey cloud
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"

echo "========== fix dev + pdf portals (mobile) =========="

bash "$DEPLOY/patch-nginx-dev.sh"
bash "$DEPLOY/fix-pdf-portal.sh"

if [[ -f "$DEPLOY/install-stirling-warmup-cron.sh" ]]; then
  bash "$DEPLOY/install-stirling-warmup-cron.sh"
fi

echo ""
echo "=== Public checks ==="
DEV_JS="$(curl -s --connect-timeout 10 --max-time 30 'https://dev.toolbasecamp.com/portal-home-bar.js' | head -c 20 || true)"
echo "dev portal-home-bar.js: ${DEV_JS}"

PDF_CODE="$(curl -sk --connect-timeout 10 --max-time 90 -o /tmp/tbc-pdf-mobile.html -w '%{http_code}' 'https://pdf.toolbasecamp.com/' || echo 000)"
PDF_TITLE="$(grep -oP '(?<=<title>)[^<]+' /tmp/tbc-pdf-mobile.html 2>/dev/null | head -1 || true)"
echo "pdf HTTPS: $PDF_CODE title=${PDF_TITLE:-"(empty)"}"

if [[ "$DEV_JS" != "(function () {"* ]]; then
  echo "WARNING: dev JS still wrong — purge Cloudflare cache for dev.toolbasecamp.com"
fi
if [[ "$PDF_CODE" != "200" ]]; then
  echo "WARNING: pdf HTTPS $PDF_CODE — Cloudflare: set pdf to DNS only (grey cloud), wait 2 min, retry."
elif [[ "$PDF_TITLE" == *"Tool Basecamp"* ]] && [[ "$PDF_TITLE" != *"PDF"* ]]; then
  echo "WARNING: pdf still serves main site — grey cloud + fix-pdf-portal.sh"
fi

echo ""
echo "Cloudflare: pdf.toolbasecamp.com MUST be grey cloud (DNS only), not orange proxy."
echo "Phone: use Wi‑Fi once after fix; first load may take up to 60s if JVM was cold."
echo "Done."
