#!/bin/bash
# Ensure MySQL is running and guestbook/auth tables exist (idempotent, non-fatal)
set -uo pipefail

systemctl start mysql 2>/dev/null || systemctl start mariadb 2>/dev/null || true

ENV_FILE=/etc/toolbasecamp-api.env
DEPLOY_DIR=/opt/toolbasecamp-deploy
APP_DIR=/opt/toolbasecamp-api

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$DEPLOY_DIR/install-mysql.sh" ]]; then
    bash "$DEPLOY_DIR/install-mysql.sh" || {
      echo "WARNING: install-mysql.sh failed — guestbook/auth unavailable."
      exit 0
    }
  else
    echo "WARNING: $ENV_FILE missing — guestbook/auth need MySQL."
    exit 0
  fi
fi

if [[ ! -x "$APP_DIR/venv/bin/python" ]]; then
  echo "WARNING: $APP_DIR/venv not ready — skip ensure_tables."
  exit 0
fi

run_ensure_tables() {
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  cd "$APP_DIR"
  "$APP_DIR/venv/bin/python" -c "from main import ensure_tables; ensure_tables(); print('ensure_tables OK')"
}

if run_ensure_tables; then
  echo "API database ready."
  exit 0
fi

echo "WARNING: ensure_tables failed — check MySQL and $ENV_FILE"
exit 0
