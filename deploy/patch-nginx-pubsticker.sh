#!/bin/bash
# Serve sticker thumbnails directly from disk (no FastAPI hop).
set -euo pipefail

SNIPPET="/etc/nginx/snippets/toolbasecamp-pubsticker.conf"
mkdir -p /etc/nginx/snippets

cat > "$SNIPPET" << 'EOF'
# Sticker files (original + thumb) — no immutable: ids/files can change after delete/upload.
location /pubsticker/ {
    alias /var/lib/toolbasecamp/stickers/;
    expires 1h;
    add_header Cache-Control "public, max-age=3600, must-revalidate";
    access_log off;
    try_files $uri =404;
}
EOF

MARK="# toolbasecamp-pubsticker"
for site in /etc/nginx/sites-enabled/home-zhengxiaohui.cn /etc/nginx/sites-enabled/toolbasecamp; do
  [ -f "$site" ] || continue
  if grep -q "$MARK" "$site" 2>/dev/null; then
    echo "skip include: $site"
    continue
  fi
  sudo sed -i "/include snippets\\/toolbasecamp-api.conf;/a\\    include snippets/toolbasecamp-pubsticker.conf; $MARK" "$site"
  echo "patched: $site"
done

nginx -t
systemctl reload nginx
echo "OK: pubsticker at /pubsticker/ -> /var/lib/toolbasecamp/stickers/"
