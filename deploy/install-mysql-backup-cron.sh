#!/usr/bin/env bash
# Install daily MySQL backup cron (03:15 server time).
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
CRON_FILE="/etc/cron.d/toolbasecamp-mysql-backup"
CRON_LINE="15 3 * * * root $DEPLOY/backup-mysql.sh >> /var/log/toolbasecamp-mysql-backup.log 2>&1"

chmod +x "$DEPLOY/backup-mysql.sh" 2>/dev/null || true

cat > "$CRON_FILE" << EOF
# Managed by toolbasecamp deploy — daily MySQL backup
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
${CRON_LINE}
EOF
chmod 644 "$CRON_FILE"
echo "Installed $CRON_FILE"

# Smoke: do not fail deploy if first backup fails (e.g. mysqldump missing briefly)
bash "$DEPLOY/backup-mysql.sh" || echo "WARNING: initial backup-mysql.sh failed — check log later"
