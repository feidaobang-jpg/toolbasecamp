#!/bin/bash
# One-shot fix when /api/wan/* returns 404 (stale API process on :8001).
set -euo pipefail

APP_DIR=/opt/toolbasecamp-api

echo "=== Check wan files ==="
ls -la "$APP_DIR/wan_video.py" "$APP_DIR/main.py"
grep -n "wan_video\|wan_router\|/wan/" "$APP_DIR/main.py" || {
  echo "ERROR: main.py has no wan wiring — rsync server/ first"
  exit 1
}

echo "=== Install deps & clear cache ==="
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"
rm -rf "$APP_DIR/__pycache__"
find "$APP_DIR" -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true

echo "=== Verify routes in Python ==="
(
  cd "$APP_DIR"
  "$APP_DIR/venv/bin/python" -c "
from main import app
import wan_video
paths=[getattr(r,'path','') for r in app.routes]
print('wan routes', [p for p in paths if 'wan' in p])
assert '/wan/i2v/submit' in paths, 'missing /wan/i2v/submit'
assert '/wan/status' in paths, 'missing /wan/status'
print('wan config', wan_video.get_wan_config())
"
)

echo "=== Restart API (kill stale port 8001) ==="
systemctl stop toolbasecamp-api 2>/dev/null || true
sleep 1
fuser -k -9 8001/tcp 2>/dev/null || true
pkill -9 -f '/opt/toolbasecamp-api/venv/bin/python' 2>/dev/null || true
pkill -9 -f 'run.py' 2>/dev/null || true
sleep 2
if ss -lnt 2>/dev/null | grep -q ':8001'; then
  echo "port 8001 still busy — killing again"
  fuser -k -9 8001/tcp 2>/dev/null || true
  sleep 2
fi
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
echo "$HEALTH" | grep -q '"wan_i2v_api":true' || {
  echo "FAILED: health wan_i2v_api is not true"
  journalctl -u toolbasecamp-api -n 60 --no-pager || true
  exit 1
}

echo "=== Local route check ==="
curl -s http://127.0.0.1:8001/openapi.json | grep -q '/wan/i2v/submit' || {
  echo "FAILED: openapi missing /wan/i2v/submit"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}
CODE="$(curl -s -o /tmp/wan-status.txt -w '%{http_code}' http://127.0.0.1:8001/wan/status)"
echo "GET /wan/status -> $CODE (expect 401 without auth)"
cat /tmp/wan-status.txt; echo ""
if [[ "$CODE" == "404" ]]; then
  echo "FAILED: still 404"
  exit 1
fi
echo "OK: wan I2V API is loaded"
