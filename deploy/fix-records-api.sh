#!/bin/bash
# One-shot fix when /api/records/* returns 404 (stale API process or missing files).
set -euo pipefail

APP_DIR=/opt/toolbasecamp-api

echo "=== Check record files ==="
ls -la "$APP_DIR/user_records.py" "$APP_DIR/main.py"
grep -n "user_records\|records_router\|/records" "$APP_DIR/main.py" || {
  echo "ERROR: main.py has no records wiring"
  exit 1
}

echo "=== Install deps & clear cache ==="
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"
rm -rf "$APP_DIR/__pycache__" "$APP_DIR/"**/__pycache__ 2>/dev/null || true
rm -rf "$APP_DIR/__pycache__"

echo "=== Verify routes in Python ==="
(
  cd "$APP_DIR"
  "$APP_DIR/venv/bin/python" -c "
from main import app
paths=[getattr(r,'path','') for r in app.routes]
print([p for p in paths if p.startswith('/records')])
assert '/records/days' in paths, 'missing /records/days: ' + str(paths)
assert '/records/clocks/{clock_id}/reset' in paths, 'missing clock reset: ' + str(paths)
assert '/records/clocks/{clock_id}/logs' in paths, 'missing clock logs: ' + str(paths)
"
)

echo "=== Restart API (kill stale port 8001) ==="
systemctl stop toolbasecamp-api 2>/dev/null || true
sleep 1
fuser -k -9 8001/tcp 2>/dev/null || true
pkill -9 -f '/opt/toolbasecamp-api/venv/bin/python' 2>/dev/null || true
pkill -9 -f 'run.py' 2>/dev/null || true
sleep 2
rm -rf "$APP_DIR/__pycache__"
systemctl reset-failed toolbasecamp-api 2>/dev/null || true
systemctl start toolbasecamp-api
sleep 3
systemctl status toolbasecamp-api --no-pager || true
ss -lntp 2>/dev/null | grep 8001 || true

echo "=== Health ==="
HEALTH="$(curl -s http://127.0.0.1:8001/health || true)"
echo "$HEALTH"
echo ""
echo "$HEALTH" | grep -q '"records_api":true' || {
  echo "FAILED: health records_api is not true"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}
echo "$HEALTH" | grep -q '"records_clock_reset":true' || {
  echo "FAILED: health records_clock_reset is not true (stale process?)"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}
echo "$HEALTH" | grep -q '"records_clock_logs":true' || {
  echo "FAILED: health records_clock_logs is not true (stale process?)"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}

echo "=== Local openapi check ==="
curl -s http://127.0.0.1:8001/openapi.json | grep -q '/records/days' || {
  echo "FAILED: openapi missing /records/days"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}
curl -s http://127.0.0.1:8001/openapi.json | grep -q '/records/clocks/{clock_id}/reset' || {
  echo "FAILED: openapi missing clock reset route"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}
curl -s http://127.0.0.1:8001/openapi.json | grep -q '/records/clocks/{clock_id}/logs' || {
  echo "FAILED: openapi missing clock logs route"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}

echo "=== Auth required check (expect 401) ==="
CODE="$(curl -s -o /tmp/records-days.txt -w '%{http_code}' http://127.0.0.1:8001/records/days)"
echo "GET /records/days -> $CODE"
head -c 200 /tmp/records-days.txt; echo ""
if [[ "$CODE" == "404" ]]; then
  echo "FAILED: still 404"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
fi
echo "OK: records API is loaded (401/403 expected without token)"
