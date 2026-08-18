#!/bin/bash
set -euo pipefail

if ! bash /opt/toolbasecamp-deploy/require-zhengxiaohui-portal-san.sh hoppscotch.zhengxiaohui.cn; then
  echo "WARNING: skip hoppscotch hostname cutover until cert includes hoppscotch.zhengxiaohui.cn"
  exit 0
fi

SITE_SRC="/opt/toolbasecamp-deploy/nginx-toolbasecamp-hoppscotch.conf"
SITE="/etc/nginx/sites-available/toolbasecamp-hoppscotch"

bash /opt/toolbasecamp-deploy/expand-portal-certs.sh
if [[ -f /opt/toolbasecamp-deploy/expand-zhengxiaohui-portal-certs.sh ]]; then
  bash /opt/toolbasecamp-deploy/expand-zhengxiaohui-portal-certs.sh || true
fi

if [[ ! -f "$SITE_SRC" ]]; then
  echo "ERROR: $SITE_SRC not found"
  exit 1
fi

cp "$SITE_SRC" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/toolbasecamp-hoppscotch

nginx -t
systemctl reload nginx

CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ -H 'Host: hoppscotch.zhengxiaohui.cn' || echo 000)"
echo "hoppscotch.zhengxiaohui.cn HTTP $CODE"

HTTPS_BODY="$(curl -sk https://127.0.0.1/ -H 'Host: hoppscotch.zhengxiaohui.cn' || true)"
if echo "$HTTPS_BODY" | grep -qE '子站入口|Portals|Productivity Tools Hub'; then
  echo "ERROR: HTTPS serves main site — run expand-portal-certs.sh (grey-cloud DNS helps)."
  exit 1
fi

if [[ "$CODE" == "200" ]] || echo "$HTTPS_BODY" | grep -qi 'hoppscotch'; then
  echo "OK: hoppscotch.zhengxiaohui.cn"
else
  echo "WARNING: hoppscotch check HTTP $CODE — is Docker running on :3000?"
  docker compose -f /opt/toolbasecamp-deploy/hoppscotch-compose.yml ps 2>/dev/null || true
  exit 1
fi
