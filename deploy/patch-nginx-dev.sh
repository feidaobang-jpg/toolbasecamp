#!/bin/bash
# Enable dev.toolbasecamp.com (next-tools SPA) on HTTP + HTTPS
set -euo pipefail

SITE_SRC="/opt/toolbasecamp-deploy/nginx-toolbasecamp-dev.conf"
SITE="/etc/nginx/sites-available/toolbasecamp-dev"
WEB_ROOT="/var/www/toolbasecamp-dev"
MAIN_SITE="/etc/nginx/sites-enabled/toolbasecamp"
MARKER_BEGIN="# BEGIN toolbasecamp-dev"
MARKER_END="# END toolbasecamp-dev"
CERT_DIR="/etc/letsencrypt/live/toolbasecamp.com"
CERT_EMAIL="${CERT_EMAIL:-admin@toolbasecamp.com}"

mkdir -p "$WEB_ROOT"

if [[ ! -f "$SITE_SRC" ]]; then
  echo "ERROR: $SITE_SRC not found"
  exit 1
fi

# Remove duplicate dev configs from earlier runs
rm -f /etc/nginx/conf.d/00-toolbasecamp-dev.conf
if [[ -f "$MAIN_SITE" ]]; then
  sed -i "/${MARKER_BEGIN}/,/${MARKER_END}/d" "$MAIN_SITE"
fi

# Cloudflare Full SSL hits origin on :443 — cert must cover dev subdomain
bash /opt/toolbasecamp-deploy/expand-portal-certs.sh

cp "$SITE_SRC" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/toolbasecamp-dev

nginx -t
systemctl reload nginx

echo "=== dev server blocks ==="
nginx -T 2>/dev/null | grep -c 'server_name dev.toolbasecamp.com' || true

if [[ ! -f "$WEB_ROOT/index.html" ]]; then
  echo "ERROR: $WEB_ROOT/index.html missing"
  exit 1
fi

echo "=== HTTP :80 ==="
curl -s http://127.0.0.1/ -H 'Host: dev.toolbasecamp.com' | grep -i '<title' | head -1 || true

echo "=== HTTPS :443 ==="
curl -sk https://127.0.0.1/ -H 'Host: dev.toolbasecamp.com' | grep -i '<title' | head -1 || true

HTTPS_BODY="$(curl -sk https://127.0.0.1/ -H 'Host: dev.toolbasecamp.com' || true)"
if echo "$HTTPS_BODY" | grep -q 'Tool Basecamp — Productivity Tools Hub'; then
  echo "ERROR: HTTPS still serves main site — check certbot and nginx 443 vhost."
  exit 1
fi

if echo "$HTTPS_BODY" | grep -qi 'next tools'; then
  echo "OK: dev.toolbasecamp.com serves next-tools on HTTP and HTTPS."
else
  echo "WARNING: HTTPS test did not return next-tools (cert or nginx issue)."
fi
