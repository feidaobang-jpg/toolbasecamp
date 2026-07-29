#!/usr/bin/env bash
# One-shot fix when /api/nbcheck/* returns 404 (stale API process / missing module).
set -euo pipefail

APP_DIR=/opt/toolbasecamp-api

echo "=== Check nbcheck files ==="
test -f "$APP_DIR/nbcheck.py" || {
  echo "FAILED: missing $APP_DIR/nbcheck.py — deploy server/ first"
  exit 1
}
grep -q 'include_router(nbcheck_router)' "$APP_DIR/main.py" || {
  echo "FAILED: $APP_DIR/main.py missing nbcheck_router"
  exit 1
}
grep -q 'nbcheck_api' "$APP_DIR/main.py" || {
  echo "FAILED: $APP_DIR/main.py missing nbcheck_api health flag"
  exit 1
}
mkdir -p "$APP_DIR/data/nbcheck"
test -f "$APP_DIR/data/nbcheck/nb_gpu.json" || {
  echo "WARN: missing seed $APP_DIR/data/nbcheck/nb_gpu.json"
}

echo "=== Nuclear restart ==="
systemctl stop toolbasecamp-api 2>/dev/null || true
sleep 1
pkill -9 -f '/opt/toolbasecamp-api/venv/bin/python' 2>/dev/null || true
sleep 1
rm -rf /opt/toolbasecamp-api/__pycache__ /opt/toolbasecamp-api/*/__pycache__ 2>/dev/null || true
find /opt/toolbasecamp-api -name '*.pyc' -delete 2>/dev/null || true

if [[ -f /opt/toolbasecamp-deploy/toolbasecamp-api.service ]]; then
  cp /opt/toolbasecamp-deploy/toolbasecamp-api.service /etc/systemd/system/toolbasecamp-api.service
  systemctl daemon-reload
fi

systemctl reset-failed toolbasecamp-api 2>/dev/null || true
systemctl start toolbasecamp-api
sleep 2
systemctl is-active toolbasecamp-api

echo "=== Health / openapi ==="
HEALTH="$(curl -sf http://127.0.0.1:8001/health || true)"
echo "$HEALTH" | head -c 900
echo
echo "$HEALTH" | grep -q '"nbcheck_api":true' || {
  echo "FAILED: health missing nbcheck_api"
  journalctl -u toolbasecamp-api -n 60 --no-pager || true
  exit 1
}
curl -sf http://127.0.0.1:8001/openapi.json | grep -q '/nbcheck/nb_gpu' || {
  echo "FAILED: openapi missing /nbcheck/nb_gpu"
  exit 1
}
curl -sf http://127.0.0.1:8001/nbcheck/nb_gpu | grep -q '"items"' || {
  echo "FAILED: /nbcheck/nb_gpu has no items"
  exit 1
}

echo "nbcheck API OK"
