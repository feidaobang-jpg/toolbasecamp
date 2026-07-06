#!/bin/bash
# Ensure MySQL is running and guestbook/auth tables exist (idempotent, non-fatal)
set -uo pipefail

systemctl start mysql 2>/dev/null || systemctl start mariadb 2>/dev/null || true

ENV_FILE=/etc/toolbasecamp-api.env
DEPLOY_DIR=/opt/toolbasecamp-deploy
APP_DIR=/opt/toolbasecamp-api

DB_NAME="${DB_NAME:-toolbasecamp}"
DB_USER="${DB_USER:-toolbasecamp}"
DB_PASSWORD="${DB_PASSWORD:-toolbasecamp}"

repair_mysql_grants() {
  if ! command -v mysql >/dev/null 2>&1; then
    echo "mysql client not installed"
    return 1
  fi
  mysql -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" || return 1
  mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';" || return 1
  mysql -e "GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';" || return 1
  mysql -e "FLUSH PRIVILEGES;" || return 1
  return 0
}

write_default_env() {
  JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
  cat > "$ENV_FILE" << EOF
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
JWT_SECRET=${JWT_SECRET}
ADMIN_EMAIL=admin@toolbasecamp.com
EOF
  chmod 600 "$ENV_FILE"
}

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$DEPLOY_DIR/install-mysql.sh" ]]; then
    bash "$DEPLOY_DIR/install-mysql.sh" || {
      echo "WARNING: install-mysql.sh failed — trying local repair..."
      repair_mysql_grants || true
      write_default_env
    }
  else
    repair_mysql_grants || true
    write_default_env
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

echo "ensure_tables failed — repairing MySQL grants and retrying..."
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
DB_NAME="${DB_NAME:-toolbasecamp}"
DB_USER="${DB_USER:-toolbasecamp}"
DB_PASSWORD="${DB_PASSWORD:-toolbasecamp}"

repair_mysql_grants || true

if run_ensure_tables; then
  echo "API database ready after repair."
  exit 0
fi

echo "WARNING: MySQL still unavailable — guestbook/auth disabled until DB is fixed."
exit 0
