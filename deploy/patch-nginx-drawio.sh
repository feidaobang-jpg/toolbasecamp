#!/bin/bash
# Ensure main site serves self-hosted /drawio/ and draw.war is installed
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
SITE_SRC="$DEPLOY/nginx-toolbasecamp.conf"
SITE="/etc/nginx/sites-enabled/toolbasecamp"

bash "$DEPLOY/install-drawio-static.sh"

if [[ -f "$SITE_SRC" && -f "$SITE" ]]; then
  if ! grep -q 'location \^~ /drawio/' "$SITE"; then
    cp "$SITE_SRC" "/etc/nginx/sites-available/toolbasecamp"
    ln -sf "/etc/nginx/sites-available/toolbasecamp" "$SITE"
    echo "Updated main nginx site from $SITE_SRC"
  fi
fi

nginx -t
systemctl reload nginx

CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1/drawio/" -H 'Host: toolbasecamp.com' || echo 000)"
echo "toolbasecamp.com/drawio/ HTTP $CODE"

if [[ "$CODE" != "200" && "$CODE" != "301" && "$CODE" != "302" ]]; then
  echo "WARNING: /drawio/ returned HTTP $CODE"
  ls -la /var/www/toolbasecamp/drawio/index.html 2>/dev/null || true
  exit 1
fi

echo "OK: self-hosted draw.io at /drawio/"
