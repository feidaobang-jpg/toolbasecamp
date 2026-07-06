#!/bin/bash
set -euo pipefail

SITE_SRC="/opt/toolbasecamp-deploy/nginx-toolbasecamp-hoppscotch.conf"
SITE="/etc/nginx/sites-available/toolbasecamp-hoppscotch"

bash /opt/toolbasecamp-deploy/expand-portal-certs.sh

if [[ ! -f "$SITE_SRC" ]]; then
  echo "ERROR: $SITE_SRC not found"
  exit 1
fi

cp "$SITE_SRC" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/toolbasecamp-hoppscotch

nginx -t
systemctl reload nginx

CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ -H 'Host: hoppscotch.toolbasecamp.com' || echo 000)"
echo "hoppscotch.toolbasecamp.com HTTP $CODE"
[[ "$CODE" == "200" ]] || exit 1
echo "OK: hoppscotch.toolbasecamp.com"
