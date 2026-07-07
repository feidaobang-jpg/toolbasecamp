#!/bin/bash
# Install self-hosted /drawio/ static files + nginx snippet (never overwrite main site config)
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
SNIPPET="/etc/nginx/snippets/toolbasecamp-drawio.conf"

bash "$DEPLOY/install-drawio-static.sh"

mkdir -p /etc/nginx/snippets
cat > "$SNIPPET" << 'EOF'
location ^~ /drawio/ {
    root /var/www/toolbasecamp;
    try_files $uri $uri/ /drawio/index.html;
    add_header Cache-Control "public, max-age=3600";
}
EOF

echo "OK: draw.io snippet at $SNIPPET"

CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1/drawio/" -H 'Host: toolbasecamp.com' 2>/dev/null || echo 000)"
if [[ "$CODE" == "200" || "$CODE" == "301" || "$CODE" == "302" ]]; then
  echo "toolbasecamp.com/drawio/ HTTP $CODE"
else
  echo "NOTE: /drawio/ HTTP $CODE — run patch-nginx-main.sh to reload nginx with drawio include"
fi
