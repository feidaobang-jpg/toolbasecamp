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
"
)

echo "=== Restart API (kill stale port 8001) ==="
systemctl stop toolbasecamp-api 2>/dev/null || true
fuser -k 8001/tcp 2>/dev/null || true
pkill -f '/opt/toolbasecamp-api/venv/bin/python' 2>/dev/null || true
sleep 2
rm -rf "$APP_DIR/__pycache__"
systemctl start toolbasecamp-api
sleep 3
systemctl status toolbasecamp-api --no-pager || true

echo "=== Health ==="
HEALTH="$(curl -s http://127.0.0.1:8001/health || true)"
echo "$HEALTH"
echo ""
echo "$HEALTH" | grep -q '"records_api":true' || {
  echo "FAILED: health records_api is not true"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}

echo "=== Local openapi check ==="
curl -s http://127.0.0.1:8001/openapi.json | grep -q '/records/days' || {
  echo "FAILED: openapi missing /records/days"
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
