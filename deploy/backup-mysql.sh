#!/usr/bin/env bash
# Daily MySQL dump for toolbasecamp. Credentials from /etc/toolbasecamp-api.env.
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/toolbasecamp-api.env}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/toolbasecamp-deploy}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/toolbasecamp/mysql}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"
HOST="$(hostname -f 2>/dev/null || hostname || echo vps)"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-toolbasecamp}"
DB_PASSWORD="${DB_PASSWORD:-toolbasecamp}"
DB_NAME="${DB_NAME:-toolbasecamp}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

CNF="$(mktemp)"
trap 'rm -f "$CNF"' EXIT
cat > "$CNF" << EOF
[client]
host=${DB_HOST}
port=${DB_PORT}
user=${DB_USER}
password=${DB_PASSWORD}
EOF
chmod 600 "$CNF"

OUT="${BACKUP_DIR}/${DB_NAME}-${STAMP}.sql.gz"
echo "[$(date -Is)] backup start -> $OUT"

if ! mysqldump --defaults-extra-file="$CNF" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  --default-character-set=utf8mb4 \
  "$DB_NAME" | gzip -c > "$OUT"; then
  rm -f "$OUT"
  MSG="[toolbasecamp] MySQL backup FAILED on ${HOST} db=${DB_NAME}"
  echo "$MSG" >&2
  if [[ -x "$DEPLOY_DIR/notify-alert.sh" ]]; then
    bash "$DEPLOY_DIR/notify-alert.sh" "$MSG" || true
  fi
  exit 1
fi

SIZE="$(du -h "$OUT" | awk '{print $1}')"
echo "[$(date -Is)] backup ok size=${SIZE}"

find "$BACKUP_DIR" -type f -name "${DB_NAME}-*.sql.gz" -mtime +"${RETAIN_DAYS}" -delete || true
echo "[$(date -Is)] rotated backups older than ${RETAIN_DAYS}d"
