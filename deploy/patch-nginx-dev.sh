#!/bin/bash
# Enable dev.toolbasecamp.com (next-tools SPA)
set -euo pipefail

SITE_SRC="/opt/toolbasecamp-deploy/nginx-toolbasecamp-dev.conf"
SITE="/etc/nginx/sites-available/toolbasecamp-dev"
WEB_ROOT="/var/www/toolbasecamp-dev"

mkdir -p "$WEB_ROOT"

if [[ -f "$SITE_SRC" ]]; then
  cp "$SITE_SRC" "$SITE"
  ln -sf "$SITE" /etc/nginx/sites-enabled/toolbasecamp-dev
  echo "Dev portal nginx site enabled."
else
  echo "Warning: $SITE_SRC not found."
  exit 0
fi

nginx -t
systemctl reload nginx
echo "Dev portal nginx ready (dev.toolbasecamp.com -> $WEB_ROOT)."
