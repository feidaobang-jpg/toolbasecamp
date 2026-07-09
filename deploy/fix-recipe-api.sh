#!/bin/bash
# One-shot fix when /api/recipe/* returns 404 (stale API or missing files).
set -euo pipefail

APP_DIR=/opt/toolbasecamp-api

echo "=== Check recipe files ==="
ls -la "$APP_DIR/recipe_ai.py" "$APP_DIR/main.py"
grep -n "recipe/detect\|recipe/generate" "$APP_DIR/main.py" || { echo "ERROR: main.py has no recipe routes"; exit 1; }

echo "=== Install deps & clear cache ==="
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"
rm -rf "$APP_DIR/__pycache__"

echo "=== Verify routes in Python ==="
(
  cd "$APP_DIR"
  "$APP_DIR/venv/bin/python" -c "from main import app; print([getattr(r,'path','') for r in app.routes if 'recipe' in getattr(r,'path','')])"
)

echo "=== Restart API (kill stale port 8001) ==="
systemctl stop toolbasecamp-api 2>/dev/null || true
fuser -k 8001/tcp 2>/dev/null || true
sleep 1
systemctl start toolbasecamp-api
sleep 2
systemctl status toolbasecamp-api --no-pager || true

echo "=== Health ==="
curl -s http://127.0.0.1:8001/health
echo ""

echo "=== Recipe detect test ==="
DETECT_HTTP="$(curl -s -o /tmp/recipe-detect-test.txt -w '%{http_code}' -X POST http://127.0.0.1:8001/recipe/detect -F 'ingredients_text=tomato' -F 'locale=en')"
echo "POST /recipe/detect -> $DETECT_HTTP"
head -c 300 /tmp/recipe-detect-test.txt
echo ""
if [[ "$DETECT_HTTP" == "404" ]]; then
  echo "FAILED: detect still 404"
  journalctl -u toolbasecamp-api -n 30 --no-pager
  exit 1
fi

echo "=== Recipe generate test ==="
HTTP="$(curl -s -o /tmp/recipe-test.txt -w '%{http_code}' -X POST http://127.0.0.1:8001/recipe/generate -H 'Content-Type: application/json' -d '{"ingredients":["tomato"],"locale":"en"}')"
echo "POST /recipe/generate -> $HTTP"
head -c 300 /tmp/recipe-test.txt
echo ""
if [[ "$HTTP" == "404" ]]; then
  echo "FAILED: generate still 404"
  journalctl -u toolbasecamp-api -n 30 --no-pager
  exit 1
fi
echo "OK: recipe API is reachable (503/400 expected if Qwen key missing)"
