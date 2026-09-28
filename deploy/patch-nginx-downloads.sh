#!/bin/bash
# Software download hub: nginx internal location for X-Accel-Redirect file serving.
# Public download flow: /api/downloads/{id}/file (FastAPI counts the hit)
#   -> X-Accel-Redirect: /downloads-internal/<file> (nginx streams from disk).
set -euo pipefail

DOWNLOADS_DIR="${DOWNLOADS_DIR:-/opt/toolbasecamp-downloads}"
SNIPPET="/etc/nginx/snippets/toolbasecamp-downloads.conf"

mkdir -p /etc/nginx/snippets "$DOWNLOADS_DIR/files" "$DOWNLOADS_DIR/chunks"
chmod 755 "$DOWNLOADS_DIR" "$DOWNLOADS_DIR/files" "$DOWNLOADS_DIR/chunks" || true

cat > "$SNIPPET" << EOF
# Software download files — served only via X-Accel-Redirect from the API.
location /downloads-internal/ {
    internal;
    alias $DOWNLOADS_DIR/files/;
    add_header Cache-Control "public, max-age=300";
    access_log off;
    try_files \$uri =404;
}
EOF

# Make sure the API env carries the storage paths (idempotent).
ENV_FILE="/etc/toolbasecamp-api.env"
if [ -f "$ENV_FILE" ]; then
  grep -q '^DOWNLOADS_DIR=' "$ENV_FILE" || echo "DOWNLOADS_DIR=$DOWNLOADS_DIR" >> "$ENV_FILE"
  grep -q '^DOWNLOADS_XACCEL_PREFIX=' "$ENV_FILE" || echo "DOWNLOADS_XACCEL_PREFIX=/downloads-internal" >> "$ENV_FILE"
fi

MARK="# toolbasecamp-downloads"
for site in /etc/nginx/sites-enabled/home-zhengxiaohui.cn /etc/nginx/sites-enabled/toolbasecamp; do
  [ -f "$site" ] || continue
  if grep -q "$MARK" "$site" 2>/dev/null; then
    echo "skip include: $site"
    continue
  fi
  sudo sed -i "/include snippets\\/toolbasecamp-api.conf;/a\\    include snippets/toolbasecamp-downloads.conf; $MARK" "$site"
  echo "patched: $site"
done

nginx -t
systemctl reload nginx
echo "OK: /downloads-internal/ -> $DOWNLOADS_DIR/files/ (internal, X-Accel only)"
