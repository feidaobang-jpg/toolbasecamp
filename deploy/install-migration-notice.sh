#!/bin/bash
# Verify zhengxiaohui.cn main site (toolbasecamp.com redirects removed).
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"

bash "$DEPLOY/patch-nginx-api.sh" || true
bash "$DEPLOY/patch-nginx-main-cache.sh" || true
bash "$DEPLOY/patch-disable-toolbasecamp-legacy.sh" || true

MAIN_TITLE="$(curl -sk https://127.0.0.1/ -H 'Host: zhengxiaohui.cn' | grep -oP '(?<=<title>)[^<]+' | head -1 || true)"
echo "zhengxiaohui.cn title: ${MAIN_TITLE:-"(none)"}"

if echo "$MAIN_TITLE" | grep -q '站点已迁移'; then
  echo "ERROR: zhengxiaohui.cn / incorrectly serves migration notice"
  exit 1
fi

echo "OK: main site nginx (no toolbasecamp.com redirect)"
