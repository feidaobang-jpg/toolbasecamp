#!/bin/bash
# Fix mobile portal issues: dev styles (portal-home-bar.js) + pdf HTTPS vhost
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"

echo "========== fix dev + pdf portals (mobile) =========="

bash "$DEPLOY/patch-nginx-dev.sh"
bash "$DEPLOY/patch-nginx-pdf.sh"

echo ""
echo "=== Public checks (optional) ==="
DEV_JS="$(curl -s 'https://dev.toolbasecamp.com/portal-home-bar.js' | head -c 20 || true)"
echo "dev portal-home-bar.js: ${DEV_JS}"
PDF_TITLE="$(curl -sk 'https://pdf.toolbasecamp.com/' | grep -oP '(?<=<title>)[^<]+' | head -1 || true)"
echo "pdf title: ${PDF_TITLE:-"(timeout or empty)"}"

if [[ "$DEV_JS" != "(function () {"* ]]; then
  echo "WARNING: dev JS still wrong — purge Cloudflare cache for dev.toolbasecamp.com"
fi
if [[ "$PDF_TITLE" == *"Tool Basecamp"* ]] && [[ "$PDF_TITLE" != *"PDF"* ]]; then
  echo "WARNING: pdf still serves main site — set pdf DNS to grey cloud, run fix-pdf-portal.sh"
fi

echo ""
echo "Done. On phone: clear browser cache or use private mode, then retry."
