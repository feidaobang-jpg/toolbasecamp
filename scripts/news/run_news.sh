#!/bin/bash
# Daily news crawl + static site rebuild for news.toolbasecamp.com
set -euo pipefail

NEWS_HOME="${NEWS_HOME:-/opt/toolbasecamp-news}"
WEB_ROOT="${NEWS_WEB_ROOT:-/var/www/toolbasecamp-news}"
LOG="${NEWS_LOG:-/var/log/toolbasecamp-news.log}"
API_ENV="${API_ENV:-/etc/toolbasecamp-api.env}"
NEWS_ENV="${NEWS_ENV:-/etc/toolbasecamp-news.env}"
VENV="${NEWS_VENV:-$NEWS_HOME/.venv}"

mkdir -p "$WEB_ROOT" "$(dirname "$LOG")"

if [[ -f "$API_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$API_ENV"
  set +a
fi
if [[ -f "$NEWS_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$NEWS_ENV"
  set +a
fi

export NEWS_WEB_ROOT="$WEB_ROOT"
export NEWS_SITE_URL="${NEWS_SITE_URL:-https://news.zhengxiaohui.cn}"

cd "$NEWS_HOME"

if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r "$NEWS_HOME/requirements.txt"
fi

{
  echo "===== $(date -Is) start ====="
  "$VENV/bin/python" "$NEWS_HOME/build_news.py" "$@"
  echo "===== $(date -Is) done ====="
} >>"$LOG" 2>&1
