#!/bin/bash
# Restore main site nginx (HTTP + HTTPS) — do NOT overwrite with HTTP-only config
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
SITE_SRC="$DEPLOY/nginx-toolbasecamp.conf"
SITE_AVAIL="/etc/nginx/sites-available/toolbasecamp"
SITE_ENABLED="/etc/nginx/sites-enabled/toolbasecamp"

for script in patch-nginx-api.sh patch-nginx-main-cache.sh; do
  if [[ -f "$DEPLOY/$script" ]]; then
    bash "$DEPLOY/$script"
  fi
done

if [[ -f "$DEPLOY/patch-nginx-drawio.sh" ]]; then
  bash "$DEPLOY/patch-nginx-drawio.sh"
fi

if [[ ! -f "$SITE_SRC" ]]; then
  echo "ERROR: $SITE_SRC not found"
  exit 1
fi

cp "$SITE_SRC" "$SITE_AVAIL"
ln -sf "$SITE_AVAIL" "$SITE_ENABLED"

if [[ -f "$DEPLOY/expand-portal-certs.sh" ]]; then
  bash "$DEPLOY/expand-portal-certs.sh" || true
fi

nginx -t
systemctl reload nginx

HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ -H 'Host: toolbasecamp.com' || echo 000)"
HTTPS_TITLE="$(curl -sk https://127.0.0.1/ -H 'Host: toolbasecamp.com' | grep -oP '(?<=<title>)[^<]+' | head -1 || true)"

echo "toolbasecamp.com HTTP $HTTP_CODE"
echo "toolbasecamp.com HTTPS title: ${HTTPS_TITLE:-"(none)"}"

if echo "$HTTPS_TITLE" | grep -qi 'cyberchef'; then
  echo "ERROR: HTTPS still serves CyberChef — check nginx 443 vhost for toolbasecamp.com"
  exit 1
fi

if ! echo "$HTTPS_TITLE" | grep -qi 'tool basecamp'; then
  echo "WARNING: expected Tool Basecamp title, got: $HTTPS_TITLE"
fi

echo "OK: main site nginx restored"
