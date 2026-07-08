#!/bin/bash
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
SITE_SRC="$DEPLOY/nginx-toolbasecamp-chef.conf"
SITE="/etc/nginx/sites-available/toolbasecamp-chef"
SNIPPET="$DEPLOY/chef-portal-inject.snippet"
WEB_ROOT="/var/www/toolbasecamp-chef"

if [[ ! -f "$WEB_ROOT/index.html" ]]; then
  echo "ERROR: $WEB_ROOT/index.html missing — run install-cyberchef-release.sh first."
  echo "  sudo bash /opt/toolbasecamp-deploy/install-cyberchef-release.sh"
  ls -la "$WEB_ROOT" 2>/dev/null || true
  exit 1
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
if "CHEF_HEAD_INJECT" not in template:
    raise SystemExit("ERROR: nginx template missing CHEF_HEAD_INJECT placeholder")
if "'" in snippet:
    raise SystemExit("ERROR: chef inject snippet must not contain single quotes")
out = template.replace("CHEF_HEAD_INJECT", snippet)
Path("$SITE").write_text(out, encoding="utf-8")
print("OK: wrote nginx chef site with inline portal bar")
PY

ln -sf "$SITE" /etc/nginx/sites-enabled/toolbasecamp-chef

nginx -t
systemctl reload nginx

HTML="$(curl -sk "https://127.0.0.1/" -H 'Host: chef.toolbasecamp.com' || true)"
if ! grep -q 'id="portal-home-bar"' <<< "$HTML"; then
  echo "ERROR: chef HTML missing inline portal-home-bar injection"
  exit 1
fi
if grep -q 'portal-home-bar.js' <<< "$HTML"; then
  echo "ERROR: chef still references external portal-home-bar.js"
  exit 1
fi
echo "OK: chef inline portal bar"

CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ -H 'Host: chef.toolbasecamp.com' || echo 000)"
echo "chef.toolbasecamp.com HTTP $CODE"
[[ "$CODE" == "200" ]] || exit 1
echo "OK: chef.toolbasecamp.com"
