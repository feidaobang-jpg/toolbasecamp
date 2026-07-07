#!/bin/bash
# Self-host draw.io static webapp from official draw.war (no Java/Docker, ~0 RAM)
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
DRAWIO_ROOT="/var/www/toolbasecamp/drawio"
REF_FILE="$DEPLOY/drawio.ref"

if [[ ! -f "$REF_FILE" ]]; then
  echo "ERROR: $REF_FILE not found"
  exit 1
fi

DRAWIO_REF="$(tr -d '\r\n' < "$REF_FILE")"
TAG="${DRAWIO_REF#v}"
WAR_URL="https://github.com/jgraph/drawio/releases/download/${DRAWIO_REF}/draw.war"

needs_install() {
  [[ ! -f "$DRAWIO_ROOT/index.html" ]] && return 0
  [[ ! -f "$DRAWIO_ROOT/.drawio-version" ]] && return 0
  [[ "$(tr -d '\r\n' < "$DRAWIO_ROOT/.drawio-version")" != "$DRAWIO_REF" ]] && return 0
  return 1
}

if ! needs_install; then
  echo "draw.io ${DRAWIO_REF} already installed at ${DRAWIO_ROOT}"
  exit 0
fi

echo "Installing draw.io ${DRAWIO_REF} → ${DRAWIO_ROOT}"

apt-get update -qq
apt-get install -y curl unzip ca-certificates >/dev/null 2>&1 || true

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo "Downloading ${WAR_URL}"
curl -fsSL -o "$TMP/draw.war" "$WAR_URL"

rm -rf "$DRAWIO_ROOT"
mkdir -p "$DRAWIO_ROOT"
unzip -q "$TMP/draw.war" -d "$DRAWIO_ROOT"

if [[ ! -f "$DRAWIO_ROOT/index.html" ]]; then
  echo "ERROR: index.html not found after extracting draw.war"
  find "$DRAWIO_ROOT" -maxdepth 2 -type f | head -20 || true
  exit 1
fi

echo "$DRAWIO_REF" > "$DRAWIO_ROOT/.drawio-version"
chown -R www-data:www-data "$DRAWIO_ROOT"
chmod -R a+rX "$DRAWIO_ROOT"
find "$DRAWIO_ROOT" -type f -exec chmod a+r {} +

echo "OK: draw.io ${DRAWIO_REF} at ${DRAWIO_ROOT} ($(du -sh "$DRAWIO_ROOT" | cut -f1))"
