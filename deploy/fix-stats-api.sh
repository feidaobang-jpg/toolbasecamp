#!/usr/bin/env bash
# One-shot fix when /api/stats/* returns 404 (stale API process).
set -euo pipefail

APP_DIR=/opt/toolbasecamp-api

echo "=== Check site_stats files ==="
test -f "$APP_DIR/site_stats.py" || {
  echo "FAILED: missing $APP_DIR/site_stats.py — deploy server/ first"
  exit 1
}
grep -n "site_stats\|stats_api\|/stats/hit" "$APP_DIR/main.py" "$APP_DIR/site_stats.py" | head -40 || true

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
echo "$HEALTH" | head -c 800
echo
echo "$HEALTH" | grep -q '"stats_api":true' || {
  echo "FAILED: health missing stats_api"
  journalctl -u toolbasecamp-api -n 60 --no-pager || true
  exit 1
}
curl -sf http://127.0.0.1:8001/openapi.json | grep -q '/stats/hit' || {
  echo "FAILED: openapi missing /stats/hit"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}

echo "=== Hit once ==="
HIT="$(curl -sf -X POST http://127.0.0.1:8001/stats/hit \
  -H 'Content-Type: application/json' \
  -d '{"visitor_id":"00000000-0000-4000-8000-000000000001"}' || true)"
echo "$HIT"
echo "$HIT" | grep -q 'site_pv' || {
  echo "FAILED: hit response missing site_pv"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}

echo "OK: stats API live"
