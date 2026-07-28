#!/usr/bin/env bash
# Periodic API + MySQL health check. Alerts on fail/recover (avoids spam).
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/toolbasecamp-api.env}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/toolbasecamp-deploy}"
STATE_DIR="${STATE_DIR:-/var/lib/toolbasecamp}"
STATE_FILE="${STATE_DIR}/api-health.state"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8001/health}"
HOST="$(hostname -f 2>/dev/null || hostname || echo vps)"

mkdir -p "$STATE_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

PREV="unknown"
if [[ -f "$STATE_FILE" ]]; then
  PREV="$(tr -d '[:space:]' < "$STATE_FILE" || true)"
fi

ok=1
detail=""

if ! systemctl is-active --quiet toolbasecamp-api 2>/dev/null; then
  ok=0
  detail="${detail}api_service=inactive; "
fi

if ! systemctl is-active --quiet mysql 2>/dev/null && ! systemctl is-active --quiet mariadb 2>/dev/null; then
  ok=0
  detail="${detail}mysql=inactive; "
fi

BODY="$(curl -sf --max-time 10 "$HEALTH_URL" || true)"
if [[ -z "$BODY" ]]; then
  ok=0
  detail="${detail}health_empty; "
else
  echo "$BODY" | grep -Fq '"ok":true' || { ok=0; detail="${detail}ok!=true; "; }
  echo "$BODY" | grep -Fq '"db":true' || { ok=0; detail="${detail}db!=true; "; }
fi

NOW="$(date -Is)"
if [[ "$ok" -eq 1 ]]; then
  echo "[$NOW] health OK"
  echo ok > "$STATE_FILE"
  if [[ "$PREV" == "fail" ]]; then
    MSG="[toolbasecamp] API recovered on ${HOST}"
    echo "$MSG"
    if [[ -x "$DEPLOY_DIR/notify-alert.sh" ]]; then
      bash "$DEPLOY_DIR/notify-alert.sh" "$MSG" || true
    fi
  fi
  exit 0
fi

echo "[$NOW] health FAIL ${detail}"
echo fail > "$STATE_FILE"
if [[ "$PREV" != "fail" ]]; then
  MSG="[toolbasecamp] API health FAIL on ${HOST}: ${detail}url=${HEALTH_URL}"
  echo "$MSG" >&2
  if [[ -x "$DEPLOY_DIR/notify-alert.sh" ]]; then
    bash "$DEPLOY_DIR/notify-alert.sh" "$MSG" || true
  fi
fi
exit 1
