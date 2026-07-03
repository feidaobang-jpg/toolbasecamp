#!/bin/bash
# Enable pdf.toolbasecamp.com → Stirling-PDF (127.0.0.1:8080)
set -euo pipefail

SITE_SRC="/opt/toolbasecamp-deploy/nginx-toolbasecamp-pdf.conf"
SITE="/etc/nginx/sites-available/toolbasecamp-pdf"
CERT_DIR="/etc/letsencrypt/live/toolbasecamp.com"
CERT_EMAIL="${CERT_EMAIL:-admin@toolbasecamp.com}"

if [[ ! -f "$SITE_SRC" ]]; then
  echo "ERROR: $SITE_SRC not found"
  exit 1
fi

if command -v certbot >/dev/null 2>&1 && [[ -f "$CERT_DIR/fullchain.pem" ]]; then
  echo "Expanding cert for pdf.toolbasecamp.com..."
  certbot certonly --nginx \
    -d toolbasecamp.com -d www.toolbasecamp.com \
    -d dev.toolbasecamp.com -d pdf.toolbasecamp.com \
    --expand --non-interactive --agree-tos -m "$CERT_EMAIL" \
    --keep-until-expiring || {
      echo "WARNING: certbot expand failed — set Cloudflare SSL to Flexible temporarily."
    }
else
  echo "WARNING: cert not found at $CERT_DIR — HTTPS pdf vhost may fail until certbot runs."
fi

cp "$SITE_SRC" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/toolbasecamp-pdf

nginx -t
systemctl reload nginx

CODE="$(curl -s -o /tmp/tbc-pdf-body.html -w '%{http_code}' \
  http://127.0.0.1/ -H 'Host: pdf.toolbasecamp.com' || echo 000)"
echo "Local pdf vhost HTTP $CODE"
grep -i '<title' /tmp/tbc-pdf-body.html | head -1 || true

HTTPS_CODE="$(curl -sk -o /tmp/tbc-pdf-https.html -w '%{http_code}' \
  https://127.0.0.1/ -H 'Host: pdf.toolbasecamp.com' || echo 000)"
echo "Local pdf vhost HTTPS $HTTPS_CODE"

if [[ "$HTTPS_CODE" == "200" ]] && grep -qi 'stirling\|pdf' /tmp/tbc-pdf-https.html; then
  echo "OK: pdf.toolbasecamp.com → Stirling-PDF"
elif grep -q 'Tool Basecamp' /tmp/tbc-pdf-https.html 2>/dev/null; then
  echo "ERROR: pdf HTTPS serves main site — run certbot expand for pdf.toolbasecamp.com"
  exit 1
elif [[ "$CODE" == "200" ]]; then
  echo "OK: pdf HTTP works; verify HTTPS after certbot."
else
  echo "WARNING: pdf vhost check returned HTTP $CODE / HTTPS $HTTPS_CODE"
  exit 1
fi
