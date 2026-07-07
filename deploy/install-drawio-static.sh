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
WAR_URL="https://github.com/jgraph/drawio/releases/download/${DRAWIO_REF}/draw.war"

looks_like_drawio() {
  [[ -f "$DRAWIO_ROOT/index.html" ]] || return 1
  grep -qiE 'draw\.io|diagrams\.net|GraphEditor|mxgraph|geEditor' "$DRAWIO_ROOT/index.html" 2>/dev/null
}

looks_like_cyberchef() {
  [[ -f "$DRAWIO_ROOT/index.html" ]] || return 1
  grep -qi 'CyberChef' "$DRAWIO_ROOT/index.html" 2>/dev/null
}

needs_install() {
  if [[ ! -f "$DRAWIO_ROOT/index.html" ]]; then
    return 0
  fi
  if looks_like_cyberchef; then
    echo "WARNING: ${DRAWIO_ROOT} contains CyberChef files — will reinstall draw.io"
    return 0
  fi
  if ! looks_like_drawio; then
    echo "WARNING: ${DRAWIO_ROOT} is not draw.io — will reinstall"
    return 0
  fi
  if [[ ! -f "$DRAWIO_ROOT/.drawio-version" ]]; then
    return 0
  fi
  if [[ "$(tr -d '\r\n' < "$DRAWIO_ROOT/.drawio-version")" != "$DRAWIO_REF" ]]; then
    return 0
  fi
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

if looks_like_cyberchef || ! looks_like_drawio; then
  echo "ERROR: extracted draw.war does not look like draw.io"
  head -5 "$DRAWIO_ROOT/index.html" || true
  exit 1
fi

echo "$DRAWIO_REF" > "$DRAWIO_ROOT/.drawio-version"
chown -R www-data:www-data "$DRAWIO_ROOT"
chmod -R a+rX "$DRAWIO_ROOT"
find "$DRAWIO_ROOT" -type f -exec chmod a+r {} +

echo "OK: draw.io ${DRAWIO_REF} at ${DRAWIO_ROOT} ($(du -sh "$DRAWIO_ROOT" | cut -f1))"
