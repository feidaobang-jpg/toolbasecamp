#!/bin/bash
# One-shot: DNS + cert + nginx for the zhengxiaohui.cn portal that is still
# online (news). The dev/chef/hoppscotch/pdf/translate portals were retired in
# 2026-10; their install scripts and nginx confs are gone from this directory.
set -euo pipefail
DEPLOY="/opt/toolbasecamp-deploy"
export API_ENV="${API_ENV:-/etc/toolbasecamp-api.env}"

chmod +x \
  "$DEPLOY/dnspod-upsert-zhengxiaohui-portals.py" \
  "$DEPLOY/expand-zhengxiaohui-portal-certs.sh" \
  "$DEPLOY/patch-disable-toolbasecamp-legacy.sh" \
  "$DEPLOY/patch-nginx-news.sh" \
  "$DEPLOY/patch-nginx-main.sh" \
  "$DEPLOY/install-migration-notice.sh"

if [[ "${SKIP_DNSPOD:-0}" != "1" ]]; then
  echo "===== DNSPod A records (optional) ====="
  if /opt/toolbasecamp-api/venv/bin/python "$DEPLOY/dnspod-upsert-zhengxiaohui-portals.py"; then
    echo "DNSPod upsert OK"
  else
    echo "WARNING: DNSPod upsert skipped/failed — ensure the news A record exists in console"
  fi
fi

echo "===== wait DNS ====="
ok=0
for i in $(seq 1 24); do
  ip="$(getent ahostsv4 "news.zhengxiaohui.cn" 2>/dev/null | awk '{print $1; exit}')"
  if [[ "$ip" == "111.229.172.111" ]]; then
    ok=1
    break
  fi
  echo "try $i/24 news.zhengxiaohui.cn -> ${ip:-none}"
  sleep 5
done
if [[ "$ok" != "1" ]]; then
  echo "WARNING: DNS not visible yet — certbot may fail; continuing."
fi

echo "===== cert SAN sync ====="
bash "$DEPLOY/expand-zhengxiaohui-portal-certs.sh"

echo "===== nginx portals ====="
bash "$DEPLOY/patch-nginx-news.sh"
bash "$DEPLOY/patch-disable-toolbasecamp-legacy.sh"
bash "$DEPLOY/install-migration-notice.sh"

echo "===== local HTTPS titles ====="
for h in news.zhengxiaohui.cn zhengxiaohui.cn; do
  code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 https://127.0.0.1/ -H "Host: $h" || echo fail)"
  title="$(curl -sk --max-time 20 https://127.0.0.1/ -H "Host: $h" | grep -oP '(?<=<title>)[^<]+' | head -1 || true)"
  echo "$h HTTPS=$code title=${title:-none}"
done
echo "DONE"
