#!/bin/bash
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
SITE_SRC="$DEPLOY/nginx-toolbasecamp-news.conf"
SITE="/etc/nginx/sites-available/toolbasecamp-news"
SNIPPET="$DEPLOY/news-portal-inject.snippet"
WEB_ROOT="/var/www/toolbasecamp-news"
NEWS_HOME="/opt/toolbasecamp-news"

mkdir -p "$WEB_ROOT"

if [[ ! -f "$WEB_ROOT/index.html" ]]; then
  if [[ -x "$NEWS_HOME/.venv/bin/python" ]]; then
    NEWS_WEB_ROOT="$WEB_ROOT" "$NEWS_HOME/.venv/bin/python" "$NEWS_HOME/build_news.py" --placeholder || true
  fi
  if [[ ! -f "$WEB_ROOT/index.html" && -f "$NEWS_HOME/build_news.py" ]]; then
    python3 - <<'PY' || true
import os, sys
sys.path.insert(0, "/opt/toolbasecamp-news")
os.environ["NEWS_WEB_ROOT"] = "/var/www/toolbasecamp-news"
os.chdir("/opt/toolbasecamp-news")
# Minimal placeholder without deps
from pathlib import Path
root = Path("/var/www/toolbasecamp-news")
root.mkdir(parents=True, exist_ok=True)
(root / "index.html").write_text(
    "<!DOCTYPE html><html><head><meta charset=utf-8><title>Tool Basecamp News</title></head>"
    "<body><h1>Tool Basecamp 资讯</h1><p>Initializing… run /opt/toolbasecamp-news/run_news.sh</p></body></html>",
    encoding="utf-8",
)
print("wrote minimal placeholder")
PY
  fi
fi

if [[ ! -f "$SITE_SRC" || ! -f "$SNIPPET" ]]; then
  echo "ERROR: missing $SITE_SRC or $SNIPPET"
  exit 1
fi

bash "$DEPLOY/expand-portal-certs.sh"

python3 << PY
from pathlib import Path
template = Path("$SITE_SRC").read_text(encoding="utf-8")
snippet = Path("$SNIPPET").read_text(encoding="utf-8").replace("\n", "").strip()
if "NEWS_HEAD_INJECT" not in template:
    raise SystemExit("ERROR: nginx template missing NEWS_HEAD_INJECT placeholder")
if "'" in snippet:
    raise SystemExit("ERROR: news inject snippet must not contain single quotes")
out = template.replace("NEWS_HEAD_INJECT", snippet)
Path("$SITE").write_text(out, encoding="utf-8")
print("OK: wrote nginx news site with inline portal bar")
PY

ln -sf "$SITE" /etc/nginx/sites-enabled/toolbasecamp-news

nginx -t
systemctl reload nginx

HTML="$(curl -sk "https://127.0.0.1/" -H 'Host: news.toolbasecamp.com' || true)"
if ! grep -q 'id="portal-home-bar"' <<< "$HTML"; then
  echo "WARNING: news HTML missing inline portal-home-bar (cert/DNS may still be pending)"
fi

CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ -H 'Host: news.toolbasecamp.com' || echo 000)"
echo "news.toolbasecamp.com HTTP $CODE"
[[ "$CODE" == "200" || "$CODE" == "503" ]] || exit 1
echo "OK: news.toolbasecamp.com nginx"
