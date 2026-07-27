#!/bin/bash
# Fix auth: ensure phone/email login (no SMS) is live; kill stale API orphans
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

if ! grep -q 'auth_phone_login' "$APP_DIR/main.py" 2>/dev/null; then
  echo "ERROR: main.py missing auth_phone_login — rsync server/ first"
  exit 1
fi

if ! grep -qE 'normalize_phone|parse_account_fields|account: str' "$APP_DIR/main.py" 2>/dev/null; then
  echo "ERROR: main.py missing phone login fields — rsync server/ first"
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
from main import hash_password, verify_password, LoginBody, parse_account_fields
h = hash_password('test123456')
assert verify_password('test123456', h)
b = LoginBody(account='13800138000', password='test123456')
assert b.account == '13800138000'
em, ph = parse_account_fields(account='13800138000')
assert em is None and ph == '13800138000'
print('bcrypt + phone login schema OK')
"
)

echo "=== Nuclear restart auth API ==="
systemctl stop toolbasecamp-api 2>/dev/null || true
sleep 1
fuser -k 8001/tcp 2>/dev/null || true
pkill -9 -f '/opt/toolbasecamp-api/venv/bin/python' 2>/dev/null || true
pkill -9 -f 'run.py' 2>/dev/null || true
sleep 2
for _ in 1 2 3 4 5; do
  if ss -lnt 2>/dev/null | grep -q ':8001'; then
    fuser -k -9 8001/tcp 2>/dev/null || true
    pkill -9 -f '/opt/toolbasecamp-api/venv/bin/python' 2>/dev/null || true
    sleep 2
  else
    break
  fi
done
rm -rf "$APP_DIR/__pycache__" "$APP_DIR"/*/__pycache__ 2>/dev/null || true
find "$APP_DIR" -name '*.pyc' -delete 2>/dev/null || true
systemctl daemon-reload
systemctl reset-failed toolbasecamp-api 2>/dev/null || true
systemctl start toolbasecamp-api
sleep 3
systemctl is-active toolbasecamp-api

HEALTH="$(curl -sf http://127.0.0.1:8001/health || echo '{}')"
echo "health: $HEALTH"
echo "$HEALTH" | grep -F '"auth_phone_login":true' >/dev/null || {
  echo "ERROR: health missing auth_phone_login — process still stale"
  journalctl -u toolbasecamp-api -n 40 --no-pager || true
  exit 1
}

OPENAPI="$(curl -sf http://127.0.0.1:8001/openapi.json || echo '{}')"
echo "$OPENAPI" | grep -F '"account"' >/dev/null || {
  echo "ERROR: openapi LoginBody missing account — process still stale"
  exit 1
}

# Phone-shaped body must not 422 for missing email
PHONE_HTTP="$(curl -s -o /tmp/tb-phone-login.json -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d '{"account":"13800138000","password":"wrong-password-xx"}' \
  http://127.0.0.1:8001/auth/login)"
echo "phone-shaped login HTTP $PHONE_HTTP"
cat /tmp/tb-phone-login.json || true
echo ""
if [[ "$PHONE_HTTP" == "422" ]]; then
  echo "ERROR: phone login still 422 (email still required)"
  exit 1
fi
if [[ "$PHONE_HTTP" != "400" && "$PHONE_HTTP" != "200" ]]; then
  echo "ERROR: unexpected login status $PHONE_HTTP"
  exit 1
fi

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

echo "SUCCESS: auth phone login + register OK"
