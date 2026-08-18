#!/bin/bash
# Enable 301 from old VPS portals to zhengxiaohui.cn
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
SRC="$DEPLOY/nginx-legacy-toolbasecamp-redirects.conf"
SITE="/etc/nginx/sites-available/toolbasecamp-legacy-redirects"

if ! bash "$DEPLOY/require-zhengxiaohui-portal-san.sh" chef.zhengxiaohui.cn; then
  echo "WARNING: skip legacy redirects until new portal cert is ready"
  exit 0
fi

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: $SRC not found"
  exit 1
fi

cp "$SRC" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/toolbasecamp-legacy-redirects
nginx -t
systemctl reload nginx
echo "OK: legacy portal redirects"
