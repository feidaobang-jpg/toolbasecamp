#!/bin/bash
# Diagnose TianAPI reachability from the API host (run on VPS).
set -euo pipefail

echo "== life status =="
curl -sS -m 5 http://127.0.0.1:8001/life/status || true
echo ""

echo "== direct TianAPI (msdl) =="
KEY="$(grep -E '^TIANAPI_KEY=' /etc/toolbasecamp-api.env 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)"
if [[ -z "${KEY}" ]]; then
  echo "TIANAPI_KEY missing in /etc/toolbasecamp-api.env"
else
  curl -sS -m 8 -w "\nhttp:%{http_code} time:%{time_total}\n" \
    "https://apis.tianapi.com/msdl/index?key=${KEY}" || echo "curl failed"
fi

echo "== via local API =="
curl -sS -m 12 -w "\nhttp:%{http_code} time:%{time_total}\n" \
  http://127.0.0.1:8001/life/tian/msdl || echo "local api failed"
