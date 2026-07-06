#!/bin/bash
# Inject portal-home-bar assets into dev static portal (same pattern as pdf sub_filter)
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
DEV_ROOT="/var/www/toolbasecamp-dev"

for f in portal-home-bar.css portal-home-bar.js; do
  if [[ ! -f "$DEPLOY/$f" ]]; then
    echo "ERROR: $DEPLOY/$f not found"
    exit 1
  fi
done

mkdir -p "$DEV_ROOT"
cp "$DEPLOY/portal-home-bar.css" "$DEV_ROOT/portal-home-bar.css"
cp "$DEPLOY/portal-home-bar.js" "$DEV_ROOT/portal-home-bar.js"
echo "Portal home bar assets copied to $DEV_ROOT"
