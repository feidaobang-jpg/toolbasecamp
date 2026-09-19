#!/bin/bash
# Expand Let's Encrypt cert for zhengxiaohui.cn portal subdomains
set -euo pipefail

CERT_DIR="/etc/letsencrypt/live/zhengxiaohui.cn"
CERT_EMAIL="${CERT_EMAIL:-admin@zhengxiaohui.cn}"
LOCK_FILE="/var/lock/toolbasecamp-certbot.lock"

if ! command -v certbot >/dev/null 2>&1; then
  echo "WARNING: certbot not installed — skip cert expand."
  exit 0
fi

if [[ ! -f "$CERT_DIR/fullchain.pem" ]]; then
  echo "WARNING: no cert at $CERT_DIR — run certbot for zhengxiaohui.cn first."
  exit 0
fi

wait_certbot_idle() {
  local i
  for i in $(seq 1 60); do
    if pgrep -x certbot >/dev/null 2>&1; then
      echo "Waiting for other certbot process... (${i}/60)"
      sleep 2
    else
      return 0
    fi
  done
  echo "WARNING: certbot still running after 120s — skip expand this run."
  return 1
}

ZHENG_ACCOUNT="${ZHENG_CERTBOT_ACCOUNT:-58d98f58ab709817fe23518a31ccb214}"

run_expand() {
  certbot certonly --nginx \
    --cert-name zhengxiaohui.cn \
    --account "$ZHENG_ACCOUNT" \
    -d zhengxiaohui.cn -d www.zhengxiaohui.cn \
    -d dev.zhengxiaohui.cn -d chef.zhengxiaohui.cn \
    -d news.zhengxiaohui.cn -d hoppscotch.zhengxiaohui.cn \
    -d pdf.zhengxiaohui.cn -d translate.zhengxiaohui.cn \
    --expand --non-interactive --agree-tos -m "$CERT_EMAIL" \
    --keep-until-expiring
}

mkdir -p /var/lock
exec 9>"$LOCK_FILE"
if ! flock -w 180 9; then
  echo "WARNING: could not acquire certbot lock — skip expand."
  exit 0
fi

wait_certbot_idle || exit 0

echo "Expanding zhengxiaohui.cn certificate for portal subdomains..."
if run_expand; then
  nginx -t && systemctl reload nginx
  echo "Cert expanded and nginx reloaded."
else
  echo "WARNING: certbot expand failed — check DNS A records for portal subdomains."
  exit 1
fi
