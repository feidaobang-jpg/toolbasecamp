#!/bin/bash
# Ensure /fx/rate is live (stale API process after deploy).
set -euo pipefail
APP_DIR=/opt/toolbasecamp-api

echo "=== FX route on disk ==="
grep -n "fx_router\|/fx/rate\|fx_rates\|THB\|FX_ALLOWED_REV" "$APP_DIR/main.py" "$APP_DIR/fx_rates.py" | head -30 || {
  echo "ERROR: fx wiring missing on disk"
  exit 1
}

rm -rf "$APP_DIR/__pycache__" 2>/dev/null || true
find "$APP_DIR" -name '*.pyc' -delete 2>/dev/null || true

(
  cd "$APP_DIR"
  "$APP_DIR/venv/bin/python" -B -c "
from main import app
from fx_rates import ALLOWED, FX_ALLOWED_REV
paths=sorted(getattr(r,'path','') for r in app.routes)
assert '/fx/rate' in paths, paths
assert FX_ALLOWED_REV >= 2, FX_ALLOWED_REV
assert 'THB' in ALLOWED and 'TWD' in ALLOWED, sorted(ALLOWED)
print('ok', [p for p in paths if 'fx' in p], 'rev', FX_ALLOWED_REV)
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
  echo "try $i: $(echo "$HEALTH" | head -c 280)"
  if echo "$HEALTH" | grep -q '"fx_api":true' \
    && echo "$HEALTH" | grep -q '"fx_thb_twd":true' \
    && echo "$HEALTH" | grep -q '"fx_allowed_rev":2'; then
    OK=1
    break
  fi
  sleep 2
done
if [[ "$OK" != "1" ]]; then
  echo "FAILED: health missing fx_api / fx_thb_twd / fx_allowed_rev=2"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
fi
curl -sf "http://127.0.0.1:8001/fx/rate?from=CNY&to=USD" | grep -q '"rate"' || {
  echo "FAILED: /fx/rate CNY->USD did not return rate"
  exit 1
}
curl -sf "http://127.0.0.1:8001/fx/rate?from=USD&to=THB" | grep -q '"rate"' || {
  echo "FAILED: /fx/rate USD->THB did not return rate"
  exit 1
}
curl -sf "http://127.0.0.1:8001/fx/rate?from=USD&to=TWD" | grep -q '"rate"' || {
  echo "FAILED: /fx/rate USD->TWD did not return rate"
  exit 1
}
echo "OK: fx API live (incl. THB/TWD)"
