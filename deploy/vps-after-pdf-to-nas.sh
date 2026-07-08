#!/bin/bash
# After PDF moved to home NAS: free VPS RAM + refresh dev/chef nginx
set -euo pipefail

echo "========== VPS after PDF → NAS migration =========="

echo ""
echo "=== Memory BEFORE ==="
free -h
echo ""
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' 2>/dev/null || true

echo ""
bash /opt/toolbasecamp-deploy/stop-vps-pdf-after-nas-migration.sh

echo ""
echo "=== Fix dev (inline bar + clear PWA service worker cache) ==="
bash /opt/toolbasecamp-deploy/patch-nginx-dev.sh

echo ""
echo "=== Fix chef ==="
bash /opt/toolbasecamp-deploy/fix-chef-portal.sh

echo ""
echo "=== Memory AFTER ==="
free -h
echo ""
docker ps --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null || echo "(no docker containers)"

echo ""
echo "If stirling-pdf still listed above, PDF was NOT removed from VPS."
echo "Purge Cloudflare cache, then on phone open dev once (auto-clears old service worker)."
echo "Done."
