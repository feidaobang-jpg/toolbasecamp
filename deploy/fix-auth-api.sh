#!/bin/bash
# Fix /auth/register HTTP 500 (stale passlib + bcrypt incompatibility)
set -euo pipefail

APP_DIR="/opt/toolbasecamp-api"
ENV_FILE="/etc/toolbasecamp-api.env"

echo "========== fix auth API =========="

if [[ ! -d "$APP_DIR" ]]; then
  echo "ERROR: $APP_DIR not found"
  exit 1
fi

if grep -q 'passlib' "$APP_DIR/main.py" 2>/dev/null; then
  echo "ERROR: main.py still uses passlib — run GitHub Actions deploy or rsync server/ first"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  bash /opt/toolbasecamp-deploy/ensure-api-db.sh || true
fi

bash /opt/toolbasecamp-deploy/ensure-api-db.sh || true

[[ -d "$APP_DIR/venv" ]] || python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install -q -U pip
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"
"$APP_DIR/venv/bin/pip" uninstall -y passlib 2>/dev/null || true

echo "Verify bcrypt hash..."
(
  cd "$APP_DIR"
  "$APP_DIR/venv/bin/python" -c "
from main import hash_password, verify_password
h = hash_password('test123456')
assert verify_password('test123456', h)
print('bcrypt OK')
"
)

systemctl daemon-reload
systemctl restart toolbasecamp-api
sleep 2

HEALTH="$(curl -sf http://127.0.0.1:8001/health || echo '{}')"
echo "health: $HEALTH"

TEST_EMAIL="fixtest_$(date +%s)@example.com"
REG="$(curl -s -o /tmp/tb-reg.json -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"test123456\"}" \
  http://127.0.0.1:8001/auth/register)"
echo "register HTTP $REG"
cat /tmp/tb-reg.json || true
echo ""

if [[ "$REG" != "200" ]]; then
  echo "ERROR: register still failing — recent logs:"
  journalctl -u toolbasecamp-api -n 25 --no-pager || true
  exit 1
fi

echo "SUCCESS: auth register OK"
