#!/bin/bash
# Keep Stirling-PDF JVM warm (cold start can take 60–120s on 4GB VPS → mobile timeout)
set -euo pipefail

PORT="${STIRLING_PORT:-8080}"
URL="http://127.0.0.1:${PORT}/"

if ! docker ps --format '{{.Names}}' | grep -qx 'stirling-pdf'; then
  echo "stirling-pdf not running"
  exit 1
fi

CODE="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 120 "$URL" || echo 000)"
echo "warmup stirling-pdf HTTP $CODE"
[[ "$CODE" == "200" ]]
