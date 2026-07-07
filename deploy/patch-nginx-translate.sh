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

HTTPS_BODY="$(curl -sk https://127.0.0.1/ -H 'Host: translate.toolbasecamp.com' || true)"
if echo "$HTTPS_BODY" | grep -qE '子站入口|Portals|Productivity Tools Hub'; then
  echo "ERROR: HTTPS serves main site — run expand-portal-certs.sh (grey-cloud DNS helps)."
  exit 1
fi

if [[ "$CODE" == "200" ]] || echo "$HTTPS_BODY" | grep -qi 'libretranslate\|translate'; then
  echo "OK: translate.toolbasecamp.com"
else
  echo "WARNING: translate check HTTP $CODE — is Docker running on :5000?"
  docker ps --filter name=libretranslate 2>/dev/null || true
  exit 1
fi
