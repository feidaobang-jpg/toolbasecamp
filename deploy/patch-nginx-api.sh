#!/bin/bash
# Write /api reverse-proxy snippet only (included by nginx-toolbasecamp.conf)
set -euo pipefail

SNIPPET="/etc/nginx/snippets/toolbasecamp-api.conf"
mkdir -p /etc/nginx/snippets

cat > "$SNIPPET" << 'EOF'
location /api/chat/ws {
    proxy_pass http://127.0.0.1:8001/chat/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

location /api/ {
    proxy_pass http://127.0.0.1:8001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # Required for 国内/海外: pass Cloudflare visitor country + real IP to API
    proxy_set_header CF-IPCountry $http_cf_ipcountry;
    proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
    proxy_set_header True-Client-IP $http_true_client_ip;
    client_max_body_size 50M;
    proxy_read_timeout 300s;
    proxy_connect_timeout 60s;
    proxy_send_timeout 300s;
}
EOF

echo "OK: API snippet at $SNIPPET"
