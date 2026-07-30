#!/bin/bash
# Install news crawler deps + daily Linux cron (do NOT also schedule in 宝塔).
set -euo pipefail

NEWS_HOME="${NEWS_HOME:-/opt/toolbasecamp-news}"
WEB_ROOT="${NEWS_WEB_ROOT:-/var/www/toolbasecamp-news}"
DEPLOY="${DEPLOY:-/opt/toolbasecamp-deploy}"

mkdir -p "$NEWS_HOME" "$WEB_ROOT" /var/log

# Scripts are rsynced by CI to NEWS_HOME.
if [[ ! -f "$NEWS_HOME/build_news.py" ]]; then
  echo "ERROR: $NEWS_HOME/build_news.py missing — deploy must rsync scripts/news first."
  exit 1
fi

chmod +x "$NEWS_HOME/run_news.sh" 2>/dev/null || true

python3 -m venv "$NEWS_HOME/.venv"
"$NEWS_HOME/.venv/bin/pip" install -q -U pip
"$NEWS_HOME/.venv/bin/pip" install -q -r "$NEWS_HOME/requirements.txt"

# Placeholder homepage so nginx can serve something before first crawl
NEWS_WEB_ROOT="$WEB_ROOT" "$NEWS_HOME/.venv/bin/python" "$NEWS_HOME/build_news.py" --placeholder

CRON_LINE="30 7 * * * /opt/toolbasecamp-news/run_news.sh"
EXISTING="$(crontab -l 2>/dev/null || true)"
if ! grep -qF "/opt/toolbasecamp-news/run_news.sh" <<< "$EXISTING"; then
  printf '%s\n' "$EXISTING" "$CRON_LINE" | sed '/^$/d' | crontab -
  echo "Installed crontab: $CRON_LINE"
else
  echo "Crontab already has news job."
fi

echo "News install OK. Ensure DEEPSEEK_API_KEY is in /etc/toolbasecamp-api.env then run:"
echo "  sudo /opt/toolbasecamp-news/run_news.sh"
