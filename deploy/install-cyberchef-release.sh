#!/bin/bash
# Install CyberChef static build from official GitHub release zip (no Node build on server)
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
WEB_ROOT="/var/www/toolbasecamp-chef"
REF_FILE="$DEPLOY/cyberchef.ref"

if [[ ! -f "$REF_FILE" ]]; then
  echo "ERROR: $REF_FILE not found"
  exit 1
fi

CHEF_REF="$(tr -d '\r\n' < "$REF_FILE")"
echo "Installing CyberChef release ${CHEF_REF} → ${WEB_ROOT}"

apt-get update -qq
apt-get install -y curl unzip ca-certificates >/dev/null 2>&1 || true

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

API_URL="https://api.github.com/repos/gchq/CyberChef/releases/tags/${CHEF_REF}"
ASSET_URL="$(curl -fsSL -H 'User-Agent: toolbasecamp-deploy' "$API_URL" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    assets = data.get('assets') or []
    print(assets[0]['browser_download_url'] if assets else '')
except Exception:
    print('')
" || true)"

if [[ -z "$ASSET_URL" ]]; then
  echo "GitHub API lookup failed — trying release redirect..."
  ZIP_NAME="$(curl -fsSL -H 'User-Agent: toolbasecamp-deploy' \
    "https://github.com/gchq/CyberChef/releases/tag/${CHEF_REF}" \
    | grep -oE "CyberChef_[a-f0-9]+\.zip" | head -1 || true)"
  if [[ -n "$ZIP_NAME" ]]; then
    ASSET_URL="https://github.com/gchq/CyberChef/releases/download/${CHEF_REF}/${ZIP_NAME}"
  fi
fi

if [[ -z "$ASSET_URL" ]]; then
  echo "ERROR: no release zip for tag ${CHEF_REF}"
  exit 1
fi

echo "Downloading ${ASSET_URL}"
curl -fsSL -o "$TMP/cyberchef.zip" "$ASSET_URL"
unzip -q "$TMP/cyberchef.zip" -d "$TMP/extract"

INDEX="$(find "$TMP/extract" -type f -name index.html | head -1)"
if [[ -z "$INDEX" || ! -f "$INDEX" ]]; then
  echo "ERROR: index.html not found inside release zip"
  find "$TMP/extract" -maxdepth 3 -type f | head -20 || true
  exit 1
fi

SRC="$(dirname "$INDEX")"
mkdir -p "$WEB_ROOT"
find "$WEB_ROOT" -mindepth 1 -maxdepth 1 ! -name 'portal-home-bar.css' ! -name 'portal-home-bar.js' \
  -exec rm -rf {} + 2>/dev/null || true
cp -a "$SRC"/. "$WEB_ROOT/"
chown -R www-data:www-data "$WEB_ROOT"
chmod -R a+rX "$WEB_ROOT"
find "$WEB_ROOT" -type f -exec chmod a+r {} +

if [[ -f "$DEPLOY/chef-portal-SOURCE.txt" ]]; then
  cp "$DEPLOY/chef-portal-SOURCE.txt" "$WEB_ROOT/SOURCE.txt"
fi

bash "$DEPLOY/install-portal-home-bar-static.sh" "$WEB_ROOT"

echo "OK: $(wc -c < "$WEB_ROOT/index.html") bytes index.html in ${WEB_ROOT}"
