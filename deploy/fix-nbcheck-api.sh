#!/usr/bin/env bash
# One-shot fix when /api/nbcheck/* returns 404 (stale API process / missing module).
set -euo pipefail

APP_DIR=/opt/toolbasecamp-api

echo "=== Check nbcheck files ==="
test -f "$APP_DIR/nbcheck.py" || {
  echo "FAILED: missing $APP_DIR/nbcheck.py ?deploy server/ first"
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
for _seed in cpu gpu soc nb_cpu nb_gpu; do
  test -f "$APP_DIR/data/nbcheck/${_seed}.json" || {
    echo "WARN: missing seed $APP_DIR/data/nbcheck/${_seed}.json"
  }
done

echo "=== Verify import on disk ==="
(
  cd "$APP_DIR"
  "$APP_DIR/venv/bin/python" -B -c "
from main import app
paths=sorted(getattr(r,'path','') for r in app.routes)
print([p for p in paths if 'nbcheck' in p])
assert '/nbcheck/status' in paths, paths
assert '/nbcheck/refresh' in paths, paths
assert '/nbcheck/{list_id}' in paths, paths
print('nbcheck routes OK on disk')
"
)

echo "=== Clear bytecode ==="
find "$APP_DIR" -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true
find "$APP_DIR" -type f -name '*.pyc' -delete 2>/dev/null || true

echo "=== Nuclear restart (kill orphans on 8001) ==="
systemctl stop toolbasecamp-api 2>/dev/null || true
sleep 1
for _ in 1 2 3 4 5; do
  fuser -k -9 8001/tcp 2>/dev/null || true
  pkill -9 -f '/opt/toolbasecamp-api/venv/bin/python' 2>/dev/null || true
  pkill -9 -f 'run.py' 2>/dev/null || true
  sleep 1
  if ss -lnt 2>/dev/null | grep -q ':8001'; then
    echo "port 8001 still busy ?retry kill"
  else
    break
  fi
done

if [[ -f /opt/toolbasecamp-deploy/toolbasecamp-api.service ]]; then
  cp /opt/toolbasecamp-deploy/toolbasecamp-api.service /etc/systemd/system/toolbasecamp-api.service
  systemctl daemon-reload
fi

systemctl reset-failed toolbasecamp-api 2>/dev/null || true
systemctl start toolbasecamp-api
sleep 3
systemctl is-active toolbasecamp-api
ss -lntp 2>/dev/null | grep 8001 || netstat -lntp 2>/dev/null | grep 8001 || true

echo "=== Health / openapi ==="
HEALTH="$(curl -sf http://127.0.0.1:8001/health || true)"
echo "$HEALTH" | head -c 1200
echo
echo "$HEALTH" | grep -q '"nbcheck_api":true' || {
  echo "FAILED: health missing nbcheck_api=true (stale orphan still on 8001?)"
  journalctl -u toolbasecamp-api -n 80 --no-pager || true
  ss -lntp 2>/dev/null | grep 8001 || true
  exit 1
}
echo "$HEALTH" | grep -q '"nbcheck_api_rev":2' || {
  echo "FAILED: health missing nbcheck_api_rev=2"
  exit 1
}
# OpenAPI shows /nbcheck/{list_id}, not the concrete /nbcheck/nb_gpu
curl -sf http://127.0.0.1:8001/openapi.json | grep -q '/nbcheck/status' || {
  echo "FAILED: openapi missing /nbcheck/status"
  exit 1
}
curl -sf http://127.0.0.1:8001/openapi.json | grep -q '/nbcheck/{list_id}' || {
  echo "FAILED: openapi missing /nbcheck/{list_id}"
  exit 1
}
curl -sf http://127.0.0.1:8001/nbcheck/nb_gpu | grep -q '"items"' || {
  echo "FAILED: /nbcheck/nb_gpu has no items"
  exit 1
}
for _id in cpu gpu soc nb_cpu; do
  curl -sf "http://127.0.0.1:8001/nbcheck/${_id}" | grep -q '"items"' || {
    echo "WARN: /nbcheck/${_id} has no items (seed/refresh may be needed)"
  }
done

echo "nbcheck API OK"
