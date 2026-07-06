#!/bin/bash
# Copy portal-home-bar assets into a static portal web root
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
WEB_ROOT="${1:-}"

if [[ -z "$WEB_ROOT" ]]; then
  echo "Usage: $0 /var/www/toolbasecamp-PORTAL"
  exit 1
fi

for f in portal-home-bar.css portal-home-bar.js; do
  if [[ ! -f "$DEPLOY/$f" ]]; then
    echo "ERROR: $DEPLOY/$f not found"
    exit 1
  fi
done

mkdir -p "$WEB_ROOT"
cp "$DEPLOY/portal-home-bar.css" "$WEB_ROOT/portal-home-bar.css"
cp "$DEPLOY/portal-home-bar.js" "$WEB_ROOT/portal-home-bar.js"
echo "Portal home bar assets copied to $WEB_ROOT"
