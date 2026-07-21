#!/bin/bash
# One-shot fix when /api/watermark/* returns 404 (stale API process or missing opencv).
set -euo pipefail

APP_DIR=/opt/toolbasecamp-api

echo "=== Check watermark files ==="
ls -la "$APP_DIR/watermark.py" "$APP_DIR/main.py"
grep -n "watermark" "$APP_DIR/main.py" || {
  echo "ERROR: main.py has no watermark wiring"
  exit 1
}

echo "=== Install deps & clear cache ==="
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"
rm -rf "$APP_DIR/__pycache__"
find "$APP_DIR" -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true

echo "=== Verify OpenCV ==="
"$APP_DIR/venv/bin/python" -c "import cv2, numpy; print('opencv', cv2.__version__)"

echo "=== Verify routes in Python ==="
(
  cd "$APP_DIR"
  "$APP_DIR/venv/bin/python" -c "
from main import app
paths=[getattr(r,'path','') for r in app.routes]
print([p for p in paths if 'watermark' in p])
assert '/watermark/image/process' in paths, 'missing /watermark/image/process'
assert '/watermark/health' in paths, 'missing /watermark/health'
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
echo "$HEALTH" | grep -q '"watermark_api":true' || {
  echo "FAILED: health watermark_api is not true"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}

echo "=== Local route check ==="
curl -s http://127.0.0.1:8001/openapi.json | grep -q '/watermark/image/process' || {
  echo "FAILED: openapi missing /watermark/image/process"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}
CODE="$(curl -s -o /tmp/wm-health.txt -w '%{http_code}' http://127.0.0.1:8001/watermark/health)"
echo "GET /watermark/health -> $CODE"
cat /tmp/wm-health.txt; echo ""
if [[ "$CODE" == "404" ]]; then
  echo "FAILED: still 404"
  exit 1
fi
echo "OK: watermark API is loaded"
