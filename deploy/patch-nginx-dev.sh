#!/bin/bash
# Enable dev.toolbasecamp.com (next-tools SPA) on HTTP + HTTPS
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
SITE_SRC="$DEPLOY/nginx-toolbasecamp-dev.conf"
SITE="/etc/nginx/sites-available/toolbasecamp-dev"
SNIPPET="$DEPLOY/dev-portal-inject.snippet"
WEB_ROOT="/var/www/toolbasecamp-dev"
MAIN_SITE="/etc/nginx/sites-enabled/toolbasecamp"
MARKER_BEGIN="# BEGIN toolbasecamp-dev"
MARKER_END="# END toolbasecamp-dev"

mkdir -p "$WEB_ROOT"

if [[ ! -f "$SITE_SRC" || ! -f "$SNIPPET" ]]; then
  echo "ERROR: missing $SITE_SRC or $SNIPPET"
  exit 1
fi

rm -f /etc/nginx/conf.d/00-toolbasecamp-dev.conf
if [[ -f "$MAIN_SITE" ]]; then
  sed -i "/${MARKER_BEGIN}/,/${MARKER_END}/d" "$MAIN_SITE"
fi

bash "$DEPLOY/expand-portal-certs.sh"

python3 << PY
from pathlib import Path
template = Path("$SITE_SRC").read_text(encoding="utf-8")
snippet = Path("$SNIPPET").read_text(encoding="utf-8").replace("\n", "").strip()
if "DEV_HEAD_INJECT" not in template:
    raise SystemExit("ERROR: nginx template missing DEV_HEAD_INJECT placeholder")
if "'" in snippet:
    raise SystemExit("ERROR: dev inject snippet must not contain single quotes")
out = template.replace("DEV_HEAD_INJECT", snippet)
Path("$SITE").write_text(out, encoding="utf-8")
print("OK: wrote nginx dev site with inline portal bar")
PY

ln -sf "$SITE" /etc/nginx/sites-enabled/toolbasecamp-dev

nginx -t
systemctl reload nginx

HTML="$(curl -sk "https://127.0.0.1/" -H 'Host: dev.toolbasecamp.com' || true)"
if ! grep -q 'id="portal-home-bar"' <<< "$HTML" && ! grep -q 'portal-has-home-bar' <<< "$HTML"; then
  echo "WARNING: dev HTML missing inline portal bar styles"
fi
if grep -q 'portal-home-bar.js' <<< "$HTML"; then
  echo "ERROR: dev still references external portal-home-bar.js"
  exit 1
fi
echo "OK: dev inline portal bar"

if [[ ! -f "$WEB_ROOT/index.html" ]]; then
  echo "ERROR: $WEB_ROOT/index.html missing"
  exit 1
fi

ASSET="$(grep -oP '/assets/index-[^.]+\.css' <<< "$HTML" | head -1 || true)"
if [[ -n "$ASSET" ]]; then
  CODE="$(curl -sk -o /dev/null -w '%{http_code}' "https://127.0.0.1${ASSET}" -H 'Host: dev.toolbasecamp.com' || echo 000)"
  echo "dev asset ${ASSET} HTTPS $CODE"
  [[ "$CODE" == "200" ]] || exit 1
fi

HTTPS_BODY="$(curl -sk https://127.0.0.1/ -H 'Host: dev.toolbasecamp.com' || true)"
if echo "$HTTPS_BODY" | grep -q 'Tool Basecamp — Productivity Tools Hub'; then
  echo "ERROR: HTTPS still serves main site — check certbot and nginx 443 vhost."
  exit 1
fi

if echo "$HTTPS_BODY" | grep -qi 'next tools'; then
  echo "OK: dev.toolbasecamp.com serves next-tools on HTTP and HTTPS."
else
  echo "WARNING: HTTPS test did not return next-tools (cert or nginx issue)."
fi
