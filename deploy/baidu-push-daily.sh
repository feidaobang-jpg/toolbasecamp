#!/usr/bin/env bash
# Daily Baidu ordinary-inclusion push (incremental). Sourced by cron.
set -euo pipefail

ENV_FILE="/etc/toolbasecamp-api.env"
SCRIPT="/opt/toolbasecamp-deploy/baidu-push-urls.py"
SITEMAP_DEFAULT="/var/www/toolbasecamp/sitemap.xml"
STATE_DEFAULT="/var/lib/toolbasecamp/baidu-pushed-urls.json"
LOG_TAG="baidu-push"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "$(date -u '+%Y-%m-%d %H:%M:%S') [$LOG_TAG] missing $ENV_FILE" >&2
  exit 1
fi
if [[ ! -f "$SCRIPT" ]]; then
  echo "$(date -u '+%Y-%m-%d %H:%M:%S') [$LOG_TAG] missing $SCRIPT" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export BAIDU_SITEMAP="${BAIDU_SITEMAP:-$SITEMAP_DEFAULT}"
export BAIDU_ZZ_STATE="${BAIDU_ZZ_STATE:-$STATE_DEFAULT}"
export BAIDU_ZZ_BATCH="${BAIDU_ZZ_BATCH:-10}"

echo "$(date -u '+%Y-%m-%d %H:%M:%S') [$LOG_TAG] start"
python3 "$SCRIPT"
echo "$(date -u '+%Y-%m-%d %H:%M:%S') [$LOG_TAG] end"
