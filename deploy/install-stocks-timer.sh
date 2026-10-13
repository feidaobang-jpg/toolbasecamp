#!/usr/bin/env bash
# Install server scheduling. Missed windows are never backfilled.
set -euo pipefail
# 2026-10-13 用户决定暂停股票模拟：代码和数据保留，定时器停用。改回 0 即随下次部署恢复。
PAUSED=1
DEPLOY=/opt/toolbasecamp-deploy
APP=/opt/toolbasecamp-api
test -f "$APP/stocks_job.py"
install -m 644 "$DEPLOY/toolbasecamp-stocks.service" /etc/systemd/system/
install -m 644 "$DEPLOY/toolbasecamp-stocks.timer" /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/toolbasecamp-stocks.service /etc/systemd/system/toolbasecamp-stocks.timer
systemctl daemon-reload
bash "$DEPLOY/run-stock-job.sh" --init
if [[ "$PAUSED" == "1" ]]; then
  systemctl disable --now toolbasecamp-stocks.timer
  echo "stocks timer paused"
  exit 0
fi
systemctl enable --now toolbasecamp-stocks.timer
systemctl is-active toolbasecamp-stocks.timer
systemctl list-timers toolbasecamp-stocks.timer --no-pager
