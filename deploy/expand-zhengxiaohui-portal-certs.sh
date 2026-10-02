#!/bin/bash
# Ensure the shared zhengxiaohui.cn certificate covers exactly the portal
# subdomains that are still online. The 2026-10 portal shutdown removed
# dev/chef/hoppscotch/pdf/translate, so the SAN list must shrink as well:
# certbot renews every name in the cert, and a stale name whose DNS record is
# gone would fail renewal for the main site too.
set -euo pipefail

CERT_DIR="/etc/letsencrypt/live/zhengxiaohui.cn"
CERT_EMAIL="${CERT_EMAIL:-admin@zhengxiaohui.cn}"
LOCK_FILE="/var/lock/toolbasecamp-certbot.lock"

DESIRED=(zhengxiaohui.cn www.zhengxiaohui.cn news.zhengxiaohui.cn)

if ! command -v certbot >/dev/null 2>&1; then
  echo "WARNING: certbot not installed — skip cert sync."
  exit 0
fi

if [[ ! -f "$CERT_DIR/fullchain.pem" ]]; then
  echo "WARNING: no cert at $CERT_DIR — run certbot for zhengxiaohui.cn first."
  exit 0
fi

current_san() {
  openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -text 2>/dev/null \
    | tr ',' '\n' \
    | grep -oE 'DNS:[^ ,]+' \
    | sed 's/^DNS://' \
    | sort -u
}

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
  echo "WARNING: certbot still running after 120s — skip cert sync this run."
  return 1
}

ZHENG_ACCOUNT="${ZHENG_CERTBOT_ACCOUNT:-58d98f58ab709817fe23518a31ccb214}"

run_cert() {
  local -a args=()
  local d
  for d in "${DESIRED[@]}"; do
    args+=(-d "$d")
  done
  # No --expand: this replaces the SAN list so retired names drop out.
  certbot certonly --nginx \
    --cert-name zhengxiaohui.cn \
    --account "$ZHENG_ACCOUNT" \
    "${args[@]}" \
    --force-renewal --non-interactive --agree-tos -m "$CERT_EMAIL"
}

mkdir -p /var/lock
exec 9>"$LOCK_FILE"
if ! flock -w 180 9; then
  echo "WARNING: could not acquire certbot lock — skip cert sync."
  exit 0
fi

wait_certbot_idle || exit 0

want="$(printf '%s\n' "${DESIRED[@]}" | sort -u)"
have="$(current_san)"
if [[ "$have" == "$want" ]]; then
  echo "OK: cert SAN list already matches (${DESIRED[*]})."
  exit 0
fi

echo "Syncing zhengxiaohui.cn certificate SANs..."
echo "  before: $(echo "$have" | tr '\n' ' ')"
echo "  after : ${DESIRED[*]}"
if run_cert; then
  nginx -t && systemctl reload nginx
  echo "Cert synced and nginx reloaded."
else
  echo "WARNING: certbot sync failed — check DNS A records for ${DESIRED[*]}."
  exit 1
fi
