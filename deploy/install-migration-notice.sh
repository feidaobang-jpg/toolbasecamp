#!/bin/bash
# toolbasecamp.com / → 301 https://zhengxiaohui.cn
# zhengxiaohui.cn keeps public/index.html from rsync.
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"

bash "$DEPLOY/patch-nginx-main.sh"

HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ -H 'Host: toolbasecamp.com' || echo 000)"
LOC="$(curl -sI http://127.0.0.1/ -H 'Host: toolbasecamp.com' | grep -i '^Location:' | head -1 || true)"
echo "toolbasecamp.com HTTP $HTTP_CODE ${LOC:-}"

if [[ "$HTTP_CODE" != "301" ]] || ! echo "$LOC" | grep -q 'zhengxiaohui.cn'; then
  echo "ERROR: toolbasecamp.com / did not 301 to zhengxiaohui.cn"
  exit 1
fi

MAIN_TITLE="$(curl -sk https://127.0.0.1/ -H 'Host: zhengxiaohui.cn' | grep -oP '(?<=<title>)[^<]+' | head -1 || true)"
echo "zhengxiaohui.cn title: ${MAIN_TITLE:-"(none)"}"

if echo "$MAIN_TITLE" | grep -q '站点已迁移'; then
  echo "ERROR: zhengxiaohui.cn / incorrectly serves migration notice"
  exit 1
fi

echo "OK: toolbasecamp.com 301 to zhengxiaohui.cn"
