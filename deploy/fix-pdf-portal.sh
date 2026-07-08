#!/bin/bash
# One-shot fix: pdf.toolbasecamp.com → Stirling-PDF (nginx + cert + docker)
set -euo pipefail

echo "========== pdf.toolbasecamp.com fix =========="

DEPLOY="/opt/toolbasecamp-deploy"
CERT_EMAIL="${CERT_EMAIL:-admin@toolbasecamp.com}"
CERT_DIR="/etc/letsencrypt/live/toolbasecamp.com"

# 1) Stirling Docker (no login)
if [[ -f "$DEPLOY/install-stirling-pdf.sh" ]]; then
  bash "$DEPLOY/install-stirling-pdf.sh"
else
  echo "Installing Stirling manually..."
  if ! command -v docker >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y docker.io
    systemctl enable docker && systemctl start docker
  fi
  docker rm -f stirling-pdf 2>/dev/null || true
  bash /opt/toolbasecamp-deploy/install-stirling-tessdata.sh 2>/dev/null || mkdir -p /opt/toolbasecamp-stirling/tessdata
  docker run -d --name stirling-pdf --restart unless-stopped \
    --memory 1280m --memory-swap 1536m \
    -p 127.0.0.1:8080:8080 \
    -v stirling-data:/configs \
    -v /opt/toolbasecamp-stirling/tessdata:/usr/share/tessdata \
    -e DISABLE_ADDITIONAL_FEATURES=false \
    -e SECURITY_ENABLELOGIN=false \
    -e SECURITY_CSRFDISABLED=true \
    -e SYSTEM_ENABLEONBOARDING=false \
    -e SYSTEM_ENABLEDESKTOPINSTALLSLIDE=false \
    -e SYSTEM_GOOGLEVISIBILITY=false \
    -e TESSERACT_LANGS=eng,chi_sim \
    -e SYSTEM_MAXFILESIZE=100 \
    -e JAVA_TOOL_OPTIONS="-Xms256m -Xmx896m" \
    -e UI_APPNAME="PDF Toolkit" \
    -e UI_APPNAMENAVBAR="PDF Toolkit" \
    docker.stirlingpdf.com/stirlingtools/stirling-pdf
  for i in $(seq 1 12); do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ || echo 000)"
    [[ "$CODE" == "200" ]] && break
    sleep 10
  done
fi

echo ""
echo "[2] nginx pdf vhost"
bash "$DEPLOY/patch-nginx-pdf.sh"

echo ""
echo "[3] Expand SSL cert (fixes Cloudflare 526)"
if command -v certbot >/dev/null 2>&1; then
  certbot certonly --nginx \
    -d toolbasecamp.com -d www.toolbasecamp.com \
    -d dev.toolbasecamp.com -d pdf.toolbasecamp.com \
    --expand --non-interactive --agree-tos -m "$CERT_EMAIL" \
    --keep-until-expiring || {
      echo "certbot failed — try: Cloudflare SSL/TLS -> Flexible (temporary)"
      exit 1
    }
  nginx -t && systemctl reload nginx
else
  echo "ERROR: certbot not installed. apt install certbot python3-certbot-nginx"
  exit 1
fi

echo ""
echo "[4] Verify"
echo -n "Stirling direct: "
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:8080/
echo -n "pdf HTTPS local: "
curl -sk https://127.0.0.1/ -H 'Host: pdf.toolbasecamp.com' | grep -oP '(?<=<title>)[^<]+' | head -1 || echo "(no title)"

BODY="$(curl -sk https://127.0.0.1/ -H 'Host: pdf.toolbasecamp.com' || true)"
if echo "$BODY" | grep -q 'Tool Basecamp'; then
  echo "ERROR: pdf vhost still serves main site."
  exit 1
fi

if echo "$BODY" | grep -qi 'stirling\|pdf'; then
  echo ""
  echo "SUCCESS. Cloudflare: set pdf to ORANGE cloud (Proxied), purge cache, then open on phone."
  echo "  (Grey cloud / DNS only → direct US IP; many CN mobile networks cannot connect.)"
else
  echo "WARNING: check output above."
fi

echo ""
echo "Warming Stirling (mobile first load)..."
if [[ -f "$DEPLOY/install-stirling-warmup-cron.sh" ]]; then
  bash "$DEPLOY/install-stirling-warmup-cron.sh"
else
  bash "$DEPLOY/warm-stirling-pdf.sh" 2>/dev/null || true
fi
