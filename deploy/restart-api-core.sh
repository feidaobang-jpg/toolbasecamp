#!/usr/bin/env bash
# Nuclear restart of toolbasecamp-api and verify core wallet routes.
set -euo pipefail

APP_DIR=/opt/toolbasecamp-api

if [[ -f /opt/toolbasecamp-deploy/toolbasecamp-api.service ]]; then
  cp /opt/toolbasecamp-deploy/toolbasecamp-api.service /etc/systemd/system/toolbasecamp-api.service
  systemctl daemon-reload
fi
systemctl enable toolbasecamp-api 2>/dev/null || true

echo "=== Clear bytecode ==="
find "$APP_DIR" -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true
find "$APP_DIR" -type f -name '*.pyc' -delete 2>/dev/null || true

echo "=== Nuclear restart ==="
systemctl stop toolbasecamp-api 2>/dev/null || true
sleep 1
for _ in 1 2 3 4 5; do
  fuser -k -9 8001/tcp 2>/dev/null || true
  pkill -9 -f '/opt/toolbasecamp-api/venv/bin/python' 2>/dev/null || true
  pkill -9 -f 'run.py' 2>/dev/null || true
  sleep 1
  if ss -lnt 2>/dev/null | grep -q ':8001'; then
    echo "port 8001 still busy — retry kill"
  else
    break
  fi
done

systemctl reset-failed toolbasecamp-api 2>/dev/null || true
systemctl start toolbasecamp-api
sleep 3
systemctl is-active toolbasecamp-api

echo "=== Verify openapi wallet routes ==="
OPENAPI="$(curl -sf http://127.0.0.1:8001/openapi.json || true)"
echo "$OPENAPI" | grep -F '/wallet/redeem' >/dev/null || {
  echo "FAILED: missing /wallet/redeem"
  journalctl -u toolbasecamp-api -n 60 --no-pager || true
  exit 1
}
echo "$OPENAPI" | grep -F '/wallet/admin/users' >/dev/null || {
  echo "FAILED: missing /wallet/admin/users"
  journalctl -u toolbasecamp-api -n 60 --no-pager || true
  exit 1
}
echo "OK: wallet API live (redeem + admin/users)"
