#!/bin/bash
set -euo pipefail

SITE_SRC="/opt/toolbasecamp-deploy/nginx-toolbasecamp-translate.conf"
SITE="/etc/nginx/sites-available/toolbasecamp-translate"

bash /opt/toolbasecamp-deploy/expand-portal-certs.sh

if [[ ! -f "$SITE_SRC" ]]; then
  echo "ERROR: $SITE_SRC not found"
  exit 1
fi

cp "$SITE_SRC" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/toolbasecamp-translate

nginx -t
systemctl reload nginx

CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ -H 'Host: translate.toolbasecamp.com' || echo 000)"
echo "translate.toolbasecamp.com HTTP $CODE"
[[ "$CODE" == "200" ]] || exit 1
echo "OK: translate.toolbasecamp.com"
