#!/bin/bash
set -euo pipefail

SITE_SRC="/opt/toolbasecamp-deploy/nginx-toolbasecamp-chef.conf"
SITE="/etc/nginx/sites-available/toolbasecamp-chef"
WEB_ROOT="/var/www/toolbasecamp-chef"

if [[ ! -f "$WEB_ROOT/index.html" ]]; then
  echo "ERROR: $WEB_ROOT/index.html missing — run install-cyberchef-release.sh first."
  echo "  sudo bash /opt/toolbasecamp-deploy/install-cyberchef-release.sh"
  ls -la "$WEB_ROOT" 2>/dev/null || true
  exit 1
fi

bash /opt/toolbasecamp-deploy/expand-portal-certs.sh

if [[ ! -f "$SITE_SRC" ]]; then
  echo "ERROR: $SITE_SRC not found"
  exit 1
fi

cp "$SITE_SRC" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/toolbasecamp-chef
bash /opt/toolbasecamp-deploy/install-portal-home-bar-static.sh "$WEB_ROOT"

nginx -t
systemctl reload nginx

CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ -H 'Host: chef.toolbasecamp.com' || echo 000)"
echo "chef.toolbasecamp.com HTTP $CODE"
[[ "$CODE" == "200" ]] || exit 1
echo "OK: chef.toolbasecamp.com"
