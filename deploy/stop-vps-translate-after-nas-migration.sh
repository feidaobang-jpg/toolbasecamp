#!/bin/bash
# After translate runs on home NAS via Cloudflare Tunnel — free VPS RAM
set -euo pipefail

echo "========== Stop VPS translate (NAS migration) =========="

FLAG="/opt/toolbasecamp-deploy/translate-on-nas.flag"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$FLAG"
echo "OK: created $FLAG (deploy will skip LibreTranslate on VPS)"

if docker ps -a --format '{{.Names}}' | grep -qx 'libretranslate'; then
  docker stop libretranslate 2>/dev/null || true
  docker rm libretranslate 2>/dev/null || true
  echo "OK: libretranslate removed from VPS"
else
  echo "libretranslate not present on VPS — skip"
fi

TR_SITE="/etc/nginx/sites-enabled/toolbasecamp-translate"
if [[ -L "$TR_SITE" || -f "$TR_SITE" ]]; then
  rm -f /etc/nginx/sites-enabled/toolbasecamp-translate
  echo "Disabled nginx translate vhost on VPS"
  nginx -t
  systemctl reload nginx
fi

echo ""
echo "Next: Tunnel Public Hostname translate.toolbasecamp.com → translate-proxy:80"
echo "Purge Cloudflare cache. Run: free -h"
echo "Done."
