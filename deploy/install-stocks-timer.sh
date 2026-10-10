#!/usr/bin/env bash
# Install server scheduling. Missed windows are never backfilled.
set -euo pipefail
DEPLOY=/opt/toolbasecamp-deploy
APP=/opt/toolbasecamp-api
test -f "$APP/stocks_job.py"
install -m 644 "$DEPLOY/toolbasecamp-stocks.service" /etc/systemd/system/
install -m 644 "$DEPLOY/toolbasecamp-stocks.timer" /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/toolbasecamp-stocks.service /etc/systemd/system/toolbasecamp-stocks.timer
systemctl daemon-reload
bash "$DEPLOY/run-stock-job.sh" --init
systemctl enable --now toolbasecamp-stocks.timer
systemctl is-active toolbasecamp-stocks.timer
systemctl list-timers toolbasecamp-stocks.timer --no-pager
