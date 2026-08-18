#!/bin/bash
# Restore main site nginx (HTTP + HTTPS)
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
SITE_SRC="$DEPLOY/nginx-toolbasecamp.conf"
SITE_AVAIL="/etc/nginx/sites-available/toolbasecamp"
SITE_ENABLED="/etc/nginx/sites-enabled/toolbasecamp"

bash "$DEPLOY/patch-nginx-api.sh"
bash "$DEPLOY/patch-nginx-main-cache.sh"

rm -f /etc/nginx/snippets/toolbasecamp-drawio.conf
rm -rf /var/www/toolbasecamp/drawio 2>/dev/null || true

if [[ ! -f "$SITE_SRC" ]]; then
  echo "ERROR: $SITE_SRC not found"
  exit 1
fi

cp "$SITE_SRC" "$SITE_AVAIL"
ln -sf "$SITE_AVAIL" "$SITE_ENABLED"

if [[ -f "$DEPLOY/expand-portal-certs.sh" ]]; then
  bash "$DEPLOY/expand-portal-certs.sh" || true
fi
if [[ -f "$DEPLOY/expand-zhengxiaohui-portal-certs.sh" ]]; then
  bash "$DEPLOY/expand-zhengxiaohui-portal-certs.sh" || true
fi

nginx -t
systemctl reload nginx

HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ -H 'Host: toolbasecamp.com' || echo 000)"
LOC="$(curl -sI http://127.0.0.1/ -H 'Host: toolbasecamp.com' | grep -i '^Location:' | head -1 || true)"

echo "toolbasecamp.com HTTP $HTTP_CODE"
echo "toolbasecamp.com Location: ${LOC:-"(none)"}"

if [[ "$HTTP_CODE" != "301" ]] || ! echo "$LOC" | grep -q 'zhengxiaohui.cn'; then
  echo "ERROR: toolbasecamp.com should 301 to zhengxiaohui.cn"
  exit 1
fi

echo "OK: main site nginx restored"
