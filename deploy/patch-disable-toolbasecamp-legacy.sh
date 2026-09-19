#!/bin/bash
# Disable legacy 301 redirects (domain retired).
set -euo pipefail

removed=0
for site in toolbasecamp toolbasecamp-legacy-redirects; do
  if [[ -L "/etc/nginx/sites-enabled/$site" || -f "/etc/nginx/sites-enabled/$site" ]]; then
    rm -f "/etc/nginx/sites-enabled/$site"
    echo "Removed sites-enabled/$site"
    removed=1
  fi
done

if [[ "$removed" == "1" ]]; then
  nginx -t
  systemctl reload nginx
  echo "OK: legacy nginx disabled"
else
  echo "OK: no legacy nginx sites enabled"
fi
