#!/bin/bash
# Cron: curl Stirling every 5 min so first mobile visit is not a cold JVM start
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
CRON_LINE="*/5 * * * * root $DEPLOY/warm-stirling-pdf.sh >> /var/log/stirling-warmup.log 2>&1"
CRON_FILE="/etc/cron.d/toolbasecamp-stirling-warmup"

if [[ ! -x "$DEPLOY/warm-stirling-pdf.sh" ]]; then
  chmod +x "$DEPLOY/warm-stirling-pdf.sh"
fi

if [[ -f "$CRON_FILE" ]] && grep -qF 'warm-stirling-pdf.sh' "$CRON_FILE"; then
  echo "Stirling warmup cron already installed."
else
  echo "$CRON_LINE" > "$CRON_FILE"
  chmod 644 "$CRON_FILE"
  echo "Installed $CRON_FILE"
fi

bash "$DEPLOY/warm-stirling-pdf.sh" || true
