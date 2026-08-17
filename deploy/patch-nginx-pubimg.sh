#!/bin/bash
# Serve public image thumbnails directly from disk (no FastAPI hop).
set -euo pipefail

SNIPPET="/etc/nginx/snippets/toolbasecamp-pubimg.conf"
mkdir -p /etc/nginx/snippets

cat > "$SNIPPET" << 'EOF'
# Public AI image thumbnails ({id}_thumb.jpg) — grid preview only.
location /pubimg/ {
    alias /var/lib/toolbasecamp/public-images/;
    expires 7d;
    add_header Cache-Control "public, max-age=604800, immutable";
    access_log off;
    try_files $uri =404;
}
EOF

MARK="# toolbasecamp-pubimg"
for site in /etc/nginx/sites-enabled/home-zhengxiaohui.cn /etc/nginx/sites-enabled/toolbasecamp; do
  [ -f "$site" ] || continue
  if grep -q "$MARK" "$site" 2>/dev/null; then
    echo "skip include: $site"
    continue
  fi
  sudo sed -i "/include snippets\\/toolbasecamp-api.conf;/a\\    include snippets/toolbasecamp-pubimg.conf; $MARK" "$site"
  echo "patched: $site"
done

nginx -t
systemctl reload nginx
echo "OK: pubimg at /pubimg/ -> /var/lib/toolbasecamp/public-images/"
