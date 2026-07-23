#!/bin/bash
# One-shot fix when /api/image/general-cutout/segment returns 404 (stale API process).
set -euo pipefail

APP_DIR=/opt/toolbasecamp-api

echo "=== Disk files ==="
ls -la "$APP_DIR/general_cutout.py" "$APP_DIR/image_tools.py" "$APP_DIR/main.py" "$APP_DIR/DEPLOY_SHA" || true
echo "DEPLOY_SHA=$(cat "$APP_DIR/DEPLOY_SHA" 2>/dev/null || true)"
grep -n "general-cutout\|general_cutout_api\|segment_general" "$APP_DIR/image_tools.py" "$APP_DIR/main.py" || {
  echo "ERROR: general cutout code missing on disk — rsync server/ first"
  exit 1
}

echo "=== Install core deps ==="
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"
if [[ -f "$APP_DIR/requirements-general-cutout.txt" ]]; then
  echo "=== Install rembg (optional) ==="
  "$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements-general-cutout.txt" \
    || echo "WARN: rembg install failed — route will load but cutout returns 503"
fi

echo "=== Clear bytecode ==="
find "$APP_DIR" -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true
find "$APP_DIR" -type f -name '*.pyc' -delete 2>/dev/null || true

echo "=== Verify import on disk ==="
(
  cd "$APP_DIR"
  "$APP_DIR/venv/bin/python" -B -c "
from main import app
paths=sorted(getattr(r,'path','') for r in app.routes)
print('cutout paths', [p for p in paths if 'cutout' in p or 'id-photo' in p])
assert '/image/general-cutout/segment' in paths, paths
from general_cutout import rembg_available
print('rembg_available', rembg_available())
"
)

echo "=== Nuclear restart (free :8001) ==="
systemctl stop toolbasecamp-api 2>/dev/null || true
sleep 1
# Kill whatever still holds 8001 (stale orphans were the 404 root cause)
for _ in 1 2 3 4 5; do
  fuser -k -9 8001/tcp 2>/dev/null || true
  pkill -9 -f '/opt/toolbasecamp-api/venv/bin/python' 2>/dev/null || true
  pkill -9 -f 'run.py' 2>/dev/null || true
  sleep 1
  if ! ss -lnt 2>/dev/null | grep -q ':8001'; then
    break
  fi
  echo "port 8001 still busy, killing again..."
done
if ss -lnt 2>/dev/null | grep -q ':8001'; then
  echo "ERROR: cannot free port 8001"
  ss -lntp | grep 8001 || true
  exit 1
fi

# Ensure service file uses python -B
if [[ -f /opt/toolbasecamp-deploy/toolbasecamp-api.service ]]; then
  cp /opt/toolbasecamp-deploy/toolbasecamp-api.service /etc/systemd/system/toolbasecamp-api.service
  systemctl daemon-reload
fi

systemctl reset-failed toolbasecamp-api 2>/dev/null || true
systemctl start toolbasecamp-api
sleep 3
systemctl is-active toolbasecamp-api
ss -lntp 2>/dev/null | grep 8001 || true

echo "=== Health / openapi ==="
OK=0
for i in 1 2 3 4 5 6 7 8; do
  HEALTH="$(curl -sf http://127.0.0.1:8001/health || true)"
  echo "try $i: $HEALTH"
  if echo "$HEALTH" | grep -q '"general_cutout_api":true'; then
    OK=1
    break
  fi
  sleep 2
done
if [[ "$OK" != "1" ]]; then
  echo "FAILED: health missing general_cutout_api"
  journalctl -u toolbasecamp-api -n 60 --no-pager || true
  exit 1
fi
curl -sf http://127.0.0.1:8001/openapi.json | grep -q '/image/general-cutout/segment' || {
  echo "FAILED: openapi missing route"
  exit 1
}
echo "OK: general cutout route is live on :8001"
