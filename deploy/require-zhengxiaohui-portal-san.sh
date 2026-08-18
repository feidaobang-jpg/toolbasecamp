#!/bin/bash
# Exit 0 if zhengxiaohui.cn cert includes SAN $1; otherwise exit 2.
set -euo pipefail
name="${1:?san name required}"
cert="/etc/letsencrypt/live/zhengxiaohui.cn/fullchain.pem"
if [[ ! -f "$cert" ]]; then
  echo "SKIP: missing $cert"
  exit 2
fi
if openssl x509 -in "$cert" -noout -text 2>/dev/null | grep -q "$name"; then
  exit 0
fi
echo "SKIP: cert missing SAN $name"
exit 2
