#!/bin/bash
# Fix toolbasecamp.com showing CyberChef or wrong site on HTTPS
set -euo pipefail

echo "========== toolbasecamp.com main site fix =========="
bash /opt/toolbasecamp-deploy/patch-nginx-main.sh
echo ""
echo "SUCCESS. Purge Cloudflare cache, then hard-refresh https://toolbasecamp.com"
