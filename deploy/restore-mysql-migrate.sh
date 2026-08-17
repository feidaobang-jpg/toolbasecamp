#!/usr/bin/env bash
# One-shot MySQL restore for CN migration (run on target VPS).
set -euo pipefail
DUMP="${1:-/tmp/tbc-migrate.sql.gz}"
ENV_FILE="${ENV_FILE:-/etc/toolbasecamp-api.env}"
if [[ ! -f "$DUMP" ]]; then
  echo "Missing dump: $DUMP" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a
echo "Restoring $DUMP into ${DB_NAME}..."
mysql -e "DROP DATABASE IF EXISTS ${DB_NAME}; CREATE DATABASE ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
gunzip -c "$DUMP" | mysql "${DB_NAME}"
mysql "${DB_NAME}" -N -e "SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS wallet_tx FROM wallet_transactions;"
echo "Restore OK."
