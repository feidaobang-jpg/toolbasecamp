#!/bin/bash
# Fix mobile/pdf: Stirling warmup, nginx inject, Cloudflare proxy for pdf DNS
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
  echo "WARNING: pdf HTTPS $PDF_CODE"
  if [[ -f "$DEPLOY/check-pdf-dns.sh" ]]; then
    bash "$DEPLOY/check-pdf-dns.sh" || true
  else
    echo "  Cloudflare: set pdf to ORANGE cloud (Proxied), same as dev — grey cloud blocks CN mobile."
  fi
elif [[ "$PDF_TITLE" == *"Tool Basecamp"* ]] && [[ "$PDF_TITLE" != *"PDF"* ]]; then
  echo "WARNING: pdf still serves main site — run fix-pdf-portal.sh + expand cert for pdf subdomain"
fi

echo ""
echo "Cloudflare: pdf MUST be ORANGE cloud (Proxied) for China/mobile access."
echo "Grey cloud (DNS only) only works where the US VPS IP is reachable; long OCR may 524 via proxy."
echo "Phone: purge cache, hard refresh; first load up to 60s if JVM was cold."
echo "Done."
