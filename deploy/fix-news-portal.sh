#!/bin/bash
# Diagnose + fix news.toolbasecamp.com (Cloudflare 526 = origin cert missing news SAN)
set -euo pipefail

DEPLOY="${DEPLOY:-/opt/toolbasecamp-deploy}"
WEB_ROOT="/var/www/toolbasecamp-news"
NEWS_HOME="/opt/toolbasecamp-news"
CERT="/etc/letsencrypt/live/toolbasecamp.com/fullchain.pem"

echo "========== news.toolbasecamp.com fix (526) =========="

echo ""
echo "=== 1. Static / crawler ==="
if [[ ! -f "$NEWS_HOME/build_news.py" ]]; then
  echo "ERROR: $NEWS_HOME/build_news.py missing — wait for CI rsync of scripts/news"
  exit 1
fi
mkdir -p "$WEB_ROOT"
if [[ -x "$NEWS_HOME/.venv/bin/python" ]]; then
  echo "Regenerating HTML from DB (safe; will not wipe rows)..."
  NEWS_WEB_ROOT="$WEB_ROOT" "$NEWS_HOME/.venv/bin/python" "$NEWS_HOME/build_news.py" --regen-only \
    || NEWS_WEB_ROOT="$WEB_ROOT" "$NEWS_HOME/.venv/bin/python" "$NEWS_HOME/build_news.py" --placeholder || true
elif [[ ! -f "$WEB_ROOT/index.html" ]]; then
  echo "WARNING: no venv yet — run install-news-cron.sh first"
fi
if [[ -f "$WEB_ROOT/index.html" ]]; then
  echo "OK: $WEB_ROOT/index.html ($(wc -c < "$WEB_ROOT/index.html") bytes)"
else
  echo "WARNING: still no index.html"
fi

echo ""
echo "=== 2. TLS certificate SAN ==="
if [[ -f "$CERT" ]]; then
  openssl x509 -in "$CERT" -noout -text | grep -A1 'Subject Alternative Name' || true
  if openssl x509 -in "$CERT" -noout -text | grep -q 'news.toolbasecamp.com'; then
    echo "OK: cert already includes news.toolbasecamp.com"
  else
    echo "MISSING: news.toolbasecamp.com not on cert (this causes Cloudflare 526 Full Strict)."
    echo ""
    echo "Do this once:"
    echo "  1) Cloudflare DNS → news → grey cloud (DNS only) temporarily"
    echo "  2) Wait ~1 min for DNS"
    echo "  3) Re-run: sudo bash $DEPLOY/fix-news-portal.sh"
    echo "  4) Cloudflare → news → orange cloud again"
    echo ""
    echo "Expanding cert now (needs grey cloud or HTTP-01 reachable)..."
    bash "$DEPLOY/expand-portal-certs.sh" || true
    if ! openssl x509 -in "$CERT" -noout -text | grep -q 'news.toolbasecamp.com'; then
      echo "ERROR: cert still missing news — grey-cloud DNS first, then re-run this script."
      exit 1
    fi
    echo "OK: cert now includes news.toolbasecamp.com"
  fi
else
  echo "ERROR: no cert at $CERT"
  exit 1
fi

echo ""
echo "=== 3. nginx vhost ==="
bash "$DEPLOY/patch-nginx-news.sh"

echo ""
echo "=== 4. Local origin checks ==="
echo -n "HTTP :80  "
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/ -H 'Host: news.toolbasecamp.com' || true
echo -n "HTTPS :443 "
curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1/ -H 'Host: news.toolbasecamp.com' || true

echo ""
echo "If public URL still 526: hard-refresh after switching news back to orange cloud."
echo "First content crawl (optional): sudo /opt/toolbasecamp-news/run_news.sh"
