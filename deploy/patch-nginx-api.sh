#!/bin/bash
# Write /api reverse-proxy snippet only (included by nginx-toolbasecamp.conf)
set -euo pipefail

SNIPPET="/etc/nginx/snippets/toolbasecamp-api.conf"
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

echo "OK: API snippet at $SNIPPET"
