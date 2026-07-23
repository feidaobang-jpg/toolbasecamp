#!/bin/bash
# One-shot fix when /api/image/general-cutout/segment returns 404.
set -euo pipefail

APP_DIR=/opt/toolbasecamp-api

echo "=== Check general cutout files ==="
ls -la "$APP_DIR/general_cutout.py" "$APP_DIR/image_tools.py" "$APP_DIR/main.py"
grep -n "general-cutout\|general_cutout\|segment_general" "$APP_DIR/image_tools.py" || {
  echo "ERROR: image_tools.py has no general cutout wiring"
  exit 1
}

echo "=== Install core deps ==="
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"
if [[ -f "$APP_DIR/requirements-general-cutout.txt" ]]; then
  echo "=== Install rembg (optional, may take a while) ==="
  "$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements-general-cutout.txt" \
    || echo "WARN: rembg install failed — route will load but cutout returns 503"
fi
rm -rf "$APP_DIR/__pycache__"
find "$APP_DIR" -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true

echo "=== Verify routes in Python ==="
(
  cd "$APP_DIR"
  "$APP_DIR/venv/bin/python" -c "
from main import app
paths=[getattr(r,'path','') for r in app.routes]
print([p for p in paths if 'cutout' in p or 'id-photo' in p or 'image' in p])
assert '/image/general-cutout/segment' in paths, 'missing /image/general-cutout/segment'
from general_cutout import rembg_available
print('rembg_available', rembg_available())
"
)

echo "=== Restart API ==="
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

echo "=== Health ==="
HEALTH="$(curl -s http://127.0.0.1:8001/health || true)"
echo "$HEALTH"
echo ""
echo "$HEALTH" | grep -q '"general_cutout_api":true' || {
  echo "FAILED: health general_cutout_api is not true"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}

curl -s http://127.0.0.1:8001/openapi.json | grep -q '/image/general-cutout/segment' || {
  echo "FAILED: openapi missing /image/general-cutout/segment"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}
echo "OK: general cutout API route is loaded"
