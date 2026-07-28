#!/usr/bin/env bash
# Install API health check cron (every 5 minutes).
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
CRON_FILE="/etc/cron.d/toolbasecamp-api-health"
CRON_LINE="*/5 * * * * root $DEPLOY/check-api-health.sh >> /var/log/toolbasecamp-api-health.log 2>&1"

chmod +x "$DEPLOY/check-api-health.sh" "$DEPLOY/notify-alert.sh" 2>/dev/null || true

cat > "$CRON_FILE" << EOF
# Managed by toolbasecamp deploy — API/MySQL health every 5 min
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
${CRON_LINE}
EOF
chmod 644 "$CRON_FILE"
echo "Installed $CRON_FILE"

bash "$DEPLOY/check-api-health.sh" || echo "WARNING: initial health check failed — will keep alerting until recovered"
