#!/bin/bash
# One-shot: DNS + cert + nginx for zhengxiaohui.cn portals
set -euo pipefail
DEPLOY="/opt/toolbasecamp-deploy"
export API_ENV="${API_ENV:-/etc/toolbasecamp-api.env}"

chmod +x \
  "$DEPLOY/dnspod-upsert-zhengxiaohui-portals.py" \
  "$DEPLOY/expand-zhengxiaohui-portal-certs.sh" \
  "$DEPLOY/patch-nginx-legacy-redirects.sh" \
  "$DEPLOY/patch-nginx-nas-proxy.sh" \
  "$DEPLOY/patch-nginx-dev.sh" \
  "$DEPLOY/patch-nginx-chef.sh" \
  "$DEPLOY/patch-nginx-news.sh" \
  "$DEPLOY/patch-nginx-hoppscotch.sh" \
  "$DEPLOY/patch-nginx-main.sh" \
  "$DEPLOY/install-migration-notice.sh"

if [[ "${SKIP_DNSPOD:-0}" != "1" ]]; then
  echo "===== DNSPod A records (optional) ====="
  if /opt/toolbasecamp-api/venv/bin/python "$DEPLOY/dnspod-upsert-zhengxiaohui-portals.py"; then
    echo "DNSPod upsert OK"
  else
    echo "WARNING: DNSPod upsert skipped/failed — ensure A records exist in console"
  fi
fi

echo "===== wait DNS ====="
ok=0
for i in $(seq 1 24); do
  hit=0
  for h in dev chef news hoppscotch pdf translate; do
    ip="$(getent ahostsv4 "${h}.zhengxiaohui.cn" 2>/dev/null | awk '{print $1; exit}')"
    if [[ "$ip" == "111.229.172.111" ]]; then
      hit=$((hit + 1))
    fi
  done
  echo "try $i/24 resolved $hit/6"
  if [[ "$hit" -eq 6 ]]; then
    ok=1
    break
  fi
  sleep 5
done
if [[ "$ok" != "1" ]]; then
  echo "WARNING: DNS not fully visible yet — certbot may fail; continuing."
fi

echo "===== cert expand ====="
bash "$DEPLOY/expand-zhengxiaohui-portal-certs.sh"

echo "===== nginx portals ====="
bash "$DEPLOY/patch-nginx-dev.sh"
bash "$DEPLOY/patch-nginx-chef.sh"
bash "$DEPLOY/patch-nginx-news.sh"
bash "$DEPLOY/patch-nginx-hoppscotch.sh" || true
bash "$DEPLOY/patch-nginx-nas-proxy.sh"
bash "$DEPLOY/patch-nginx-legacy-redirects.sh"
bash "$DEPLOY/install-migration-notice.sh"

echo "===== local HTTPS titles ====="
for h in dev.zhengxiaohui.cn chef.zhengxiaohui.cn news.zhengxiaohui.cn hoppscotch.zhengxiaohui.cn pdf.zhengxiaohui.cn translate.zhengxiaohui.cn zhengxiaohui.cn; do
  code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 https://127.0.0.1/ -H "Host: $h" || echo fail)"
  title="$(curl -sk --max-time 20 https://127.0.0.1/ -H "Host: $h" | grep -oP '(?<=<title>)[^<]+' | head -1 || true)"
  echo "$h HTTPS=$code title=${title:-none}"
done
echo "DONE"
