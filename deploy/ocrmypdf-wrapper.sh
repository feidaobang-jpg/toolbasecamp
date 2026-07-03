#!/bin/sh
# Wrap ocrmypdf: inject --image-dpi 300 for JPEG/PNG/TIFF (Stirling 2.14 omits it).
set -eu

REAL="/opt/venv/bin/ocrmypdf.real"
if [ ! -x "$REAL" ]; then
  REAL="/opt/venv/bin/ocrmypdf"
fi

for arg in "$@"; do
  if [ "$arg" = "--image-dpi" ]; then
    exec "$REAL" "$@"
  fi
done

for arg in "$@"; do
  if [ -f "$arg" ] && file -b "$arg" 2>/dev/null | grep -qiE 'image|JPEG|PNG|TIFF|WebP|bitmap'; then
    exec "$REAL" --image-dpi 300 "$@"
  fi
done

exec "$REAL" "$@"
