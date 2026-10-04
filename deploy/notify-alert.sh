#!/usr/bin/env bash
# Send ops alert. Supports Feishu/Lark bot webhook or generic JSON webhook.
# Env: FEISHU_WEBHOOK_URL or ALERT_WEBHOOK_URL (from /etc/toolbasecamp-api.env)
set -euo pipefail

MSG="${1:-toolbasecamp alert}"
ENV_FILE="${ENV_FILE:-/etc/toolbasecamp-api.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

URL="${FEISHU_WEBHOOK_URL:-${ALERT_WEBHOOK_URL:-}}"
if [[ -z "$URL" ]]; then
  echo "[notify] no FEISHU_WEBHOOK_URL / ALERT_WEBHOOK_URL — skip: $MSG"
  exit 0
fi

if echo "$URL" | grep -Eqi 'feishu\.cn|larksuite\.com'; then
  BODY=$(printf '{"msg_type":"text","content":{"text":%s}}' "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$MSG")")
else
  BODY=$(printf '{"text":%s}' "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$MSG")")
fi

curl -sS -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -d "$BODY" \
  --max-time 15 \
  -o /tmp/toolbasecamp-notify-resp.txt \
  -w 'notify_http=%{http_code}\n' || true
head -c 200 /tmp/toolbasecamp-notify-resp.txt 2>/dev/null || true
echo
