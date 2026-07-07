#!/bin/bash
# Write JS/CSS cache-control snippet only (included by nginx-toolbasecamp.conf)
set -euo pipefail

SNIPPET="/etc/nginx/snippets/toolbasecamp-static-cache.conf"
mkdir -p /etc/nginx/snippets

cat > "$SNIPPET" << 'EOF'
location ~ ^/(js|css)/ {
    add_header Cache-Control "no-cache, must-revalidate" always;
}
EOF

echo "OK: static cache snippet at $SNIPPET"
