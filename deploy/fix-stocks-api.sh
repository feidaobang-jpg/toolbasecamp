#!/usr/bin/env bash
# One-shot fix when /api/stocks/* returns 404 (stale API process).
set -euo pipefail

APP_DIR=/opt/toolbasecamp-api

echo "=== Check stocks files ==="
test -f "$APP_DIR/stocks.py" || {
  echo "FAILED: missing $APP_DIR/stocks.py — deploy server/ first"
  exit 1
}
grep -n "stocks\|stocks_api\|recommend-tail-buy\|recommend-monthly-recovery\|_assess_hs300" \
  "$APP_DIR/main.py" "$APP_DIR/stocks.py" | head -80 || true
grep -q 'include_router(stocks_router)' "$APP_DIR/main.py" || {
  echo "FAILED: $APP_DIR/main.py missing stocks_router"
  exit 1
}
grep -q 'stocks_api' "$APP_DIR/main.py" || {
  echo "FAILED: $APP_DIR/main.py missing stocks_api health flag"
  exit 1
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
echo "$HEALTH" | grep -q '"stocks_api":true' || {
  echo "FAILED: health missing stocks_api"
  journalctl -u toolbasecamp-api -n 60 --no-pager || true
  exit 1
}
curl -sf http://127.0.0.1:8001/openapi.json | grep -q '/stocks/recommend-tail-buy' || {
  echo "FAILED: openapi missing /stocks/recommend-tail-buy"
  exit 1
}
curl -sf http://127.0.0.1:8001/openapi.json | grep -q '/stocks/recommend-monthly-recovery' || {
  echo "FAILED: openapi missing /stocks/recommend-monthly-recovery"
  exit 1
}

echo "stocks API OK"
