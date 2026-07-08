#!/bin/bash
# Enable pdf.toolbasecamp.com → Stirling-PDF (127.0.0.1:8080)
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
SITE_SRC="$DEPLOY/nginx-toolbasecamp-pdf.conf"
SITE="/etc/nginx/sites-available/toolbasecamp-pdf"
SNIPPET="$DEPLOY/pdf-portal-inject.snippet"

if [[ ! -f "$SITE_SRC" || ! -f "$SNIPPET" ]]; then
  echo "ERROR: missing $SITE_SRC or $SNIPPET"
  exit 1
fi

bash "$DEPLOY/expand-portal-certs.sh"

python3 << PY
from pathlib import Path
template = Path("$SITE_SRC").read_text(encoding="utf-8")
snippet = Path("$SNIPPET").read_text(encoding="utf-8").replace("\n", "").strip()
if "PDF_HEAD_INJECT" not in template:
    raise SystemExit("ERROR: nginx template missing PDF_HEAD_INJECT placeholder")
if "'" in snippet:
    raise SystemExit("ERROR: pdf inject snippet must not contain single quotes")
out = template.replace("PDF_HEAD_INJECT", snippet)
Path("$SITE").write_text(out, encoding="utf-8")
print("OK: wrote nginx pdf site with inline portal inject")
PY

ln -sf "$SITE" /etc/nginx/sites-enabled/toolbasecamp-pdf

if docker ps --format '{{.Names}}' | grep -qx 'stirling-pdf'; then
  bash "$DEPLOY/warm-stirling-pdf.sh" || {
    echo "WARNING: Stirling not ready — pdf may 502 until JVM finishes starting"
  }
fi

nginx -t
systemctl reload nginx

CODE="$(curl -s -o /tmp/tbc-pdf-body.html -w '%{http_code}' \
  http://127.0.0.1/ -H 'Host: pdf.toolbasecamp.com' || echo 000)"
echo "Local pdf vhost HTTP $CODE"
grep -i '<title' /tmp/tbc-pdf-body.html | head -1 || true

HTTPS_CODE="$(curl -sk -o /tmp/tbc-pdf-https.html -w '%{http_code}' \
  https://127.0.0.1/ -H 'Host: pdf.toolbasecamp.com' || echo 000)"
echo "Local pdf vhost HTTPS $HTTPS_CODE"

if grep -q 'portal-home-bar.css' /tmp/tbc-pdf-https.html 2>/dev/null; then
  echo "ERROR: pdf still uses external portal-home-bar.css — inline inject failed"
  exit 1
fi
if ! grep -q 'portal-home-bar' /tmp/tbc-pdf-https.html 2>/dev/null; then
  echo "WARNING: pdf HTML missing portal-home-bar inline"
fi

if [[ "$HTTPS_CODE" == "200" ]] && grep -qi 'stirling\|pdf' /tmp/tbc-pdf-https.html; then
  echo "OK: pdf.toolbasecamp.com → Stirling-PDF"
elif grep -q 'Tool Basecamp — Productivity Tools Hub\|Productivity Tools Hub' /tmp/tbc-pdf-https.html 2>/dev/null; then
  echo "ERROR: pdf HTTPS serves main site — run: bash /opt/toolbasecamp-deploy/fix-pdf-portal.sh"
  exit 1
elif grep -q 'Tool Basecamp' /tmp/tbc-pdf-https.html 2>/dev/null; then
  echo "ERROR: pdf HTTPS serves main site — run certbot expand for pdf.toolbasecamp.com"
  exit 1
elif [[ "$CODE" == "200" ]]; then
  echo "OK: pdf HTTP works; verify HTTPS after certbot."
else
  echo "WARNING: pdf vhost check returned HTTP $CODE / HTTPS $HTTPS_CODE"
  exit 1
fi
