#!/bin/bash
# Fix toolbasecamp.com nginx (HTTPS vhost / duplicate /api/)
set -euo pipefail

echo "========== toolbasecamp.com main site fix =========="
bash /opt/toolbasecamp-deploy/patch-nginx-main.sh
echo ""
echo "SUCCESS. Purge Cloudflare cache, then hard-refresh https://toolbasecamp.com"
