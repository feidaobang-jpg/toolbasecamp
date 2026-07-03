#!/bin/bash
# Enable dev.toolbasecamp.com (next-tools SPA)
set -euo pipefail

SITE_SRC="/opt/toolbasecamp-deploy/nginx-toolbasecamp-dev.conf"
SITE="/etc/nginx/sites-available/toolbasecamp-dev"
CONF_D="/etc/nginx/conf.d/00-toolbasecamp-dev.conf"
WEB_ROOT="/var/www/toolbasecamp-dev"

mkdir -p "$WEB_ROOT"

if [[ ! -f "$SITE_SRC" ]]; then
  echo "::error:: $SITE_SRC not found — run deploy rsync first."
  exit 1
fi

cp "$SITE_SRC" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/toolbasecamp-dev
cp "$SITE_SRC" "$CONF_D"

# Ensure main site is not the catch-all default for unknown hosts.
MAIN_SITE="/etc/nginx/sites-enabled/toolbasecamp"
if [[ -f "$MAIN_SITE" ]]; then
  sed -i 's/listen \[\:\:\]:80 default_server;/listen [::]:80;/g' "$MAIN_SITE"
  sed -i 's/listen 80 default_server;/listen 80;/g' "$MAIN_SITE"
fi

nginx -t
systemctl reload nginx

echo "=== dev portal nginx config ==="
nginx -T 2>/dev/null | grep -A6 'server_name dev.toolbasecamp.com' || true

echo "=== dev web root ==="
ls -la "$WEB_ROOT" | head -8

echo "=== local curl (Host: dev.toolbasecamp.com) ==="
BODY="$(curl -sf http://127.0.0.1/ -H 'Host: dev.toolbasecamp.com' | head -c 800 || true)"
echo "$BODY"

if echo "$BODY" | grep -q 'Tool Basecamp — Productivity Tools Hub'; then
  echo "::error:: dev.toolbasecamp.com still serves main site — check nginx vhost and Cloudflare DNS (dev must be A record, not redirect)."
  exit 1
fi

if ! echo "$BODY" | grep -qi 'next tools'; then
  echo "::error:: dev.toolbasecamp.com did not return next-tools HTML."
  exit 1
fi

echo "Dev portal nginx ready (dev.toolbasecamp.com -> $WEB_ROOT)."
