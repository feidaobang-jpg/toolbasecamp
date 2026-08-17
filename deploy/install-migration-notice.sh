#!/bin/bash
# toolbasecamp.com / → migration notice (auto-redirect to zhengxiaohui.cn).
# zhengxiaohui.cn keeps public/index.html from rsync.
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
WEB="/var/www/toolbasecamp"
NOTICE_SRC="$DEPLOY/migration-notice.html"
NOTICE_DST="$WEB/migration-notice.html"

if [[ ! -f "$NOTICE_SRC" ]]; then
  echo "ERROR: $NOTICE_SRC not found"
  exit 1
fi

mkdir -p "$WEB"
cp "$NOTICE_SRC" "$NOTICE_DST"
chmod 644 "$NOTICE_DST"

bash "$DEPLOY/patch-nginx-main.sh"

TITLE="$(curl -sk https://127.0.0.1/ -H 'Host: toolbasecamp.com' | grep -oP '(?<=<title>)[^<]+' | head -1 || true)"
echo "toolbasecamp.com title: ${TITLE:-"(none)"}"

if ! echo "$TITLE" | grep -q '站点已迁移'; then
  echo "ERROR: toolbasecamp.com / did not serve migration notice"
  exit 1
fi

MAIN_TITLE="$(curl -sk https://127.0.0.1/ -H 'Host: zhengxiaohui.cn' | grep -oP '(?<=<title>)[^<]+' | head -1 || true)"
echo "zhengxiaohui.cn title: ${MAIN_TITLE:-"(none)"}"

if echo "$MAIN_TITLE" | grep -q '站点已迁移'; then
  echo "ERROR: zhengxiaohui.cn / incorrectly serves migration notice"
  exit 1
fi

echo "OK: migration notice on toolbasecamp.com only"
