#!/bin/bash
# pdf.zhengxiaohui.cn / translate.zhengxiaohui.cn → NAS via existing Cloudflare Tunnel
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
SRC="$DEPLOY/nginx-zhengxiaohui-nas-proxy.conf"
SITE="/etc/nginx/sites-available/zhengxiaohui-nas-proxy"

if ! bash "$DEPLOY/require-zhengxiaohui-portal-san.sh" pdf.zhengxiaohui.cn; then
  echo "WARNING: skip NAS proxy until cert includes pdf.zhengxiaohui.cn"
  exit 0
fi

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: $SRC not found"
  exit 1
fi

if [[ -f "$DEPLOY/expand-zhengxiaohui-portal-certs.sh" ]]; then
  bash "$DEPLOY/expand-zhengxiaohui-portal-certs.sh"
fi

cp "$SRC" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/zhengxiaohui-nas-proxy
nginx -t
systemctl reload nginx

PDF_CODE="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 https://127.0.0.1/ -H 'Host: pdf.zhengxiaohui.cn' || echo 000)"
TR_CODE="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 https://127.0.0.1/ -H 'Host: translate.zhengxiaohui.cn' || echo 000)"
echo "pdf.zhengxiaohui.cn HTTPS $PDF_CODE"
echo "translate.zhengxiaohui.cn HTTPS $TR_CODE"
echo "OK: NAS portal proxy nginx"
