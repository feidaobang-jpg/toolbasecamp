#!/bin/bash
# Expand Let's Encrypt cert for all Tool Basecamp portal subdomains
set -euo pipefail

CERT_DIR="/etc/letsencrypt/live/toolbasecamp.com"
CERT_EMAIL="${CERT_EMAIL:-admin@toolbasecamp.com}"

if ! command -v certbot >/dev/null 2>&1; then
  echo "WARNING: certbot not installed — skip cert expand."
  exit 0
fi

if [[ ! -f "$CERT_DIR/fullchain.pem" ]]; then
  echo "WARNING: no cert at $CERT_DIR — run certbot for toolbasecamp.com first."
  exit 0
fi

echo "Expanding certificate for portal subdomains..."
if certbot certonly --nginx \
  -d toolbasecamp.com -d www.toolbasecamp.com \
  -d dev.toolbasecamp.com -d pdf.toolbasecamp.com \
  -d chef.toolbasecamp.com -d hoppscotch.toolbasecamp.com -d translate.toolbasecamp.com \
  --expand --non-interactive --agree-tos -m "$CERT_EMAIL" \
  --keep-until-expiring; then
  nginx -t && systemctl reload nginx
  echo "Cert expanded and nginx reloaded."
else
  echo "WARNING: certbot expand failed — set new subdomains to DNS only (grey cloud) in Cloudflare, then re-run."
fi
