#!/bin/bash
# Enable dev.toolbasecamp.com (next-tools SPA)
set -euo pipefail

SITE_SRC="/opt/toolbasecamp-deploy/nginx-toolbasecamp-dev.conf"
MAIN_SITE="/etc/nginx/sites-enabled/toolbasecamp"
SITE="/etc/nginx/sites-available/toolbasecamp-dev"
CONF_D="/etc/nginx/conf.d/00-toolbasecamp-dev.conf"
WEB_ROOT="/var/www/toolbasecamp-dev"
MARKER_BEGIN="# BEGIN toolbasecamp-dev"
MARKER_END="# END toolbasecamp-dev"

mkdir -p "$WEB_ROOT"

if [[ ! -f "$SITE_SRC" ]]; then
  echo "ERROR: $SITE_SRC not found — push to GitHub and wait for deploy rsync, or copy deploy files manually."
  exit 1
fi

cp "$SITE_SRC" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/toolbasecamp-dev
cp "$SITE_SRC" "$CONF_D"

# Also embed dev vhost into the main site file (guaranteed to load).
if [[ -f "$MAIN_SITE" ]]; then
  sed -i "/${MARKER_BEGIN}/,/${MARKER_END}/d" "$MAIN_SITE"
  {
    echo ""
    echo "$MARKER_BEGIN"
    cat "$SITE_SRC"
    echo "$MARKER_END"
  } >> "$MAIN_SITE"
  sed -i 's/listen \[\:\:\]:80 default_server;/listen [::]:80;/g' "$MAIN_SITE"
  sed -i 's/listen 80 default_server;/listen 80;/g' "$MAIN_SITE"
else
  echo "WARNING: $MAIN_SITE not found — standalone dev vhost only."
fi

nginx -t
systemctl reload nginx

echo "=== dev web root ==="
ls -la "$WEB_ROOT" | head -10
if [[ ! -f "$WEB_ROOT/index.html" ]]; then
  echo "ERROR: $WEB_ROOT/index.html missing — next-tools was not deployed."
  echo "Re-run GitHub Actions deploy (workflow: Deploy Tool Basecamp)."
  exit 1
fi

echo "=== index.html title ==="
grep -i '<title' "$WEB_ROOT/index.html" | head -1 || true

echo "=== nginx dev server blocks ==="
nginx -T 2>/dev/null | grep -c 'server_name dev.toolbasecamp.com' || true

echo "=== local HTTP test ==="
HTTP_CODE="$(curl -s -o /tmp/tbc-dev-body.html -w '%{http_code}' \
  http://127.0.0.1/ -H 'Host: dev.toolbasecamp.com')"
echo "HTTP $HTTP_CODE"
head -c 400 /tmp/tbc-dev-body.html
echo ""

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: dev vhost returned HTTP $HTTP_CODE"
  exit 1
fi

if grep -q 'Tool Basecamp — Productivity Tools Hub' /tmp/tbc-dev-body.html; then
  echo "ERROR: dev vhost still serves main site HTML."
  exit 1
fi

if ! grep -qi 'next tools' /tmp/tbc-dev-body.html; then
  echo "ERROR: response is not next-tools."
  exit 1
fi

echo "OK: dev.toolbasecamp.com -> $WEB_ROOT"
