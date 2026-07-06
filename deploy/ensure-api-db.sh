#!/bin/bash
# Ensure MySQL is running and guestbook/auth tables exist (idempotent)
set -euo pipefail

systemctl start mysql 2>/dev/null || systemctl start mariadb 2>/dev/null || true

ENV_FILE=/etc/toolbasecamp-api.env
if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f /opt/toolbasecamp-deploy/install-mysql.sh ]]; then
    bash /opt/toolbasecamp-deploy/install-mysql.sh
  else
    echo "WARNING: $ENV_FILE missing — guestbook/auth need MySQL."
    exit 0
  fi
fi

APP_DIR=/opt/toolbasecamp-api
if [[ ! -x "$APP_DIR/venv/bin/python" ]]; then
  echo "WARNING: $APP_DIR/venv not ready — skip ensure_tables."
  exit 0
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$APP_DIR"
"$APP_DIR/venv/bin/python" -c "from main import ensure_tables; ensure_tables(); print('ensure_tables OK')"
