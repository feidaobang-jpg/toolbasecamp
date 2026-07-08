#!/bin/bash
# After PDF runs on home NAS via Cloudflare Tunnel — free VPS RAM
set -euo pipefail

echo "========== Stop VPS pdf (NAS migration) =========="

FLAG="/opt/toolbasecamp-deploy/pdf-on-nas.flag"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$FLAG"
echo "OK: created $FLAG (deploy will skip Stirling on VPS)"

if docker ps -a --format '{{.Names}}' | grep -qx 'stirling-pdf'; then
  echo "Stopping stirling-pdf container..."
  docker stop stirling-pdf 2>/dev/null || true
  docker rm stirling-pdf 2>/dev/null || true
  echo "OK: stirling-pdf removed from VPS"
else
  echo "stirling-pdf not present on VPS — skip"
fi

PDF_SITE="/etc/nginx/sites-enabled/toolbasecamp-pdf"
if [[ -L "$PDF_SITE" || -f "$PDF_SITE" ]]; then
  rm -f /etc/nginx/sites-enabled/toolbasecamp-pdf
  echo "Disabled nginx pdf vhost on VPS"
  nginx -t
  systemctl reload nginx
fi

echo ""
echo "Next steps:"
echo "  1) Cloudflare Tunnel on NAS must serve pdf.toolbasecamp.com"
echo "  2) Remove old pdf A record pointing to this VPS (if still present)"
echo "  3) Purge Cloudflare cache for pdf.toolbasecamp.com"
echo "  4) free -h  — confirm memory dropped"
echo "Done."
