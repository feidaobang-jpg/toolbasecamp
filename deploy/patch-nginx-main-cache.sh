#!/bin/bash
# Idempotent: avoid long-lived Cloudflare cache for mutable JS/CSS on main site
set -euo pipefail

SNIPPET="/etc/nginx/snippets/toolbasecamp-static-cache.conf"
SITE="/etc/nginx/sites-enabled/toolbasecamp"

mkdir -p /etc/nginx/snippets

cat > "$SNIPPET" << 'EOF'
location ~ ^/(js|css)/ {
    add_header Cache-Control "no-cache, must-revalidate" always;
}
EOF

if [[ ! -f "$SITE" ]]; then
  echo "Warning: $SITE not found. Skipping static cache snippet."
  exit 0
fi

if ! grep -q 'snippets/toolbasecamp-static-cache.conf' "$SITE"; then
  sed -i '/server_name toolbasecamp.com/a \    include snippets/toolbasecamp-static-cache.conf;' "$SITE"
  echo "Added static cache snippet to main nginx site."
else
  echo "Static cache snippet already present."
fi

nginx -t
systemctl reload nginx
echo "Main site JS/CSS cache headers ready."
