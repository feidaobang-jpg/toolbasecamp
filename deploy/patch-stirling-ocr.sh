#!/bin/bash
# Install ocrmypdf wrapper into Stirling container (fixes JPEG/PNG OCR 500).
set -euo pipefail

CONTAINER="${1:-stirling-pdf}"
WRAPPER_SRC="/opt/toolbasecamp-deploy/ocrmypdf-wrapper.sh"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "ERROR: container $CONTAINER not running"
  exit 1
fi

if [[ ! -f "$WRAPPER_SRC" ]]; then
  echo "ERROR: $WRAPPER_SRC not found"
  exit 1
fi

docker exec "$CONTAINER" sh -c '
  set -eu
  if [ -x /opt/venv/bin/ocrmypdf ] && [ ! -x /opt/venv/bin/ocrmypdf.real ]; then
    mv /opt/venv/bin/ocrmypdf /opt/venv/bin/ocrmypdf.real
  fi
'

docker cp "$WRAPPER_SRC" "${CONTAINER}:/opt/venv/bin/ocrmypdf"
docker exec "$CONTAINER" chmod +x /opt/venv/bin/ocrmypdf /opt/venv/bin/ocrmypdf.real 2>/dev/null || true

echo "ocrmypdf wrapper installed."
docker exec "$CONTAINER" sh -c 'file /opt/venv/bin/ocrmypdf /opt/venv/bin/ocrmypdf.real 2>/dev/null | head -2'
