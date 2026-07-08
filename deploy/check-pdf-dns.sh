#!/bin/bash
# Diagnose pdf.toolbasecamp.com DNS — grey cloud blocks many CN/mobile networks
set -euo pipefail

HOST="pdf.toolbasecamp.com"
REF="dev.toolbasecamp.com"

echo "========== PDF DNS check =========="

PDF_IPS="$(dig +short A "$HOST" 2>/dev/null | tr '\n' ' ' || true)"
DEV_IPS="$(dig +short A "$REF" 2>/dev/null | tr '\n' ' ' || true)"

echo "$HOST A: ${PDF_IPS:-"(none)"}"
echo "$REF A:  ${DEV_IPS:-"(none)"}"

is_cf_ip() {
  local ip="$1"
  [[ "$ip" =~ ^104\.(1[6-9]|2[0-9]|3[0-1])\..* ]] && return 0
  [[ "$ip" =~ ^172\.6[4-9]\..* ]] && return 0
  [[ "$ip" =~ ^172\.7[0-1]\..* ]] && return 0
  return 1
}

PDF_CF=0
PDF_DIRECT=0
for ip in $PDF_IPS; do
  if is_cf_ip "$ip"; then PDF_CF=1; else PDF_DIRECT=1; fi
done

if [[ "$PDF_DIRECT" -eq 1 && "$PDF_CF" -eq 0 ]]; then
  echo ""
  echo "PROBLEM: pdf resolves to origin IP (grey cloud / DNS only)."
  echo "  Many mobile networks in China cannot reach the US VPS directly → page never loads."
  echo ""
  echo "FIX (Cloudflare DNS):"
  echo "  1. DNS → pdf A record → click cloud icon until ORANGE (Proxied)"
  echo "  2. SSL/TLS → Full (same as dev/main)"
  echo "  3. Purge cache for pdf.toolbasecamp.com"
  echo ""
  echo "Note: orange cloud may return HTTP 524 on OCR jobs >100s — split large files if needed."
  exit 1
fi

if [[ "$PDF_CF" -eq 1 ]]; then
  echo ""
  echo "OK: pdf is proxied through Cloudflare (orange cloud)."
fi

CODE="$(curl -sk --connect-timeout 10 --max-time 60 -o /dev/null -w '%{http_code}' "https://${HOST}/" || echo 000)"
echo "Public HTTPS: $CODE"
[[ "$CODE" == "200" ]] || exit 1
