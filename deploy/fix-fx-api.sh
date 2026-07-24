#!/bin/bash
# Ensure /fx/rate is live (stale API process after deploy).
set -euo pipefail
APP_DIR=/opt/toolbasecamp-api

echo "=== FX route on disk ==="
grep -n "fx_router\|/fx/rate\|fx_rates" "$APP_DIR/main.py" "$APP_DIR/fx_rates.py" | head -20 || {
  echo "ERROR: fx wiring missing on disk"
  exit 1
}

rm -rf "$APP_DIR/__pycache__" 2>/dev/null || true
find "$APP_DIR" -name '*.pyc' -delete 2>/dev/null || true

(
  cd "$APP_DIR"
  "$APP_DIR/venv/bin/python" -B -c "
from main import app
paths=sorted(getattr(r,'path','') for r in app.routes)
assert '/fx/rate' in paths, paths
print('ok', [p for p in paths if 'fx' in p])
"
)

systemctl stop toolbasecamp-api 2>/dev/null || true
sleep 1
fuser -k -9 8001/tcp 2>/dev/null || true
pkill -9 -f '/opt/toolbasecamp-api/venv/bin/python' 2>/dev/null || true
sleep 2
systemctl reset-failed toolbasecamp-api 2>/dev/null || true
systemctl start toolbasecamp-api
sleep 3
systemctl is-active toolbasecamp-api

OK=0
for i in 1 2 3 4 5 6 7 8; do
  HEALTH="$(curl -sf http://127.0.0.1:8001/health || true)"
  echo "try $i: $(echo "$HEALTH" | head -c 200)"
  if echo "$HEALTH" | grep -q '"fx_api":true'; then
    OK=1
    break
  fi
  sleep 2
done
if [[ "$OK" != "1" ]]; then
  echo "FAILED: health missing fx_api"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
fi
curl -sf "http://127.0.0.1:8001/fx/rate?from=CNY&to=USD" | grep -q '"rate"' || {
  echo "FAILED: /fx/rate did not return rate"
  exit 1
}
echo "OK: fx API live"
