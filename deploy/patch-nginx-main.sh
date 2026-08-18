#!/bin/bash
# Restore main site nginx snippets (no legacy vhost).
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"

bash "$DEPLOY/patch-nginx-api.sh"
bash "$DEPLOY/patch-nginx-main-cache.sh"
bash "$DEPLOY/patch-disable-toolbasecamp-legacy.sh"

if [[ -f "$DEPLOY/expand-zhengxiaohui-portal-certs.sh" ]]; then
  bash "$DEPLOY/expand-zhengxiaohui-portal-certs.sh" || true
fi

nginx -t
systemctl reload nginx

echo "OK: main site nginx snippets updated"
