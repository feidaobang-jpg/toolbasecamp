#!/bin/bash
# Idempotent: add /api reverse proxy snippet for Tool Basecamp API
set -euo pipefail

SNIPPET="/etc/nginx/snippets/toolbasecamp-api.conf"
SITE="/etc/nginx/sites-enabled/toolbasecamp"

mkdir -p /etc/nginx/snippets

cat > "$SNIPPET" << 'EOF'
location /api/ {
    proxy_pass http://127.0.0.1:8001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 50M;
    proxy_read_timeout 300s;
    proxy_connect_timeout 60s;
    proxy_send_timeout 300s;
}
EOF

if [[ ! -f "$SITE" ]]; then
  echo "Warning: $SITE not found. Create nginx site first."
  exit 0
fi

if ! grep -q 'snippets/toolbasecamp-api.conf' "$SITE"; then
  sed -i '/server_name toolbasecamp.com/a \    include snippets/toolbasecamp-api.conf;' "$SITE"
  echo "Added API include to nginx site."
else
  echo "API include already present."
fi

nginx -t
systemctl reload nginx
echo "Nginx API proxy ready."
