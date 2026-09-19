#!/usr/bin/env bash
# Install daily Baidu URL push cron (10:20 Asia/Shanghai ≈ 02:20 UTC if server is UTC).
# Uses /etc/cron.d; server local time — VPS is typically UTC, so 02:20 UTC ≈ 10:20 CST.
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
CRON_FILE="/etc/cron.d/toolbasecamp-baidu-push"
# 02:20 UTC ≈ 10:20 Beijing if host TZ is UTC
CRON_LINE="20 2 * * * root $DEPLOY/baidu-push-daily.sh >> /var/log/toolbasecamp-baidu-push.log 2>&1"

mkdir -p /var/lib/toolbasecamp
chmod 755 /var/lib/toolbasecamp
# State is written by root cron; keep dir root-owned.
touch /var/lib/toolbasecamp/baidu-pushed-urls.json 2>/dev/null || true
chmod 644 /var/lib/toolbasecamp/baidu-pushed-urls.json 2>/dev/null || true

chmod +x "$DEPLOY/baidu-push-daily.sh" "$DEPLOY/baidu-push-urls.py" 2>/dev/null || true

cat > "$CRON_FILE" << EOF
# Managed by toolbasecamp deploy — daily Baidu ordinary inclusion (incremental)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
${CRON_LINE}
EOF
chmod 644 "$CRON_FILE"
echo "Installed $CRON_FILE"

# Smoke: status only (no quota burn). Seed top-20 if state empty (prior manual pushes).
if [[ -f /etc/toolbasecamp-api.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/toolbasecamp-api.env
  set +a
  export BAIDU_SITEMAP="${BAIDU_SITEMAP:-/var/www/toolbasecamp/sitemap.xml}"
  export BAIDU_ZZ_STATE="${BAIDU_ZZ_STATE:-/var/lib/toolbasecamp/baidu-pushed-urls.json}"
  python3 "$DEPLOY/baidu-push-urls.py" --status || echo "WARNING: baidu-push status failed"
  # If never seeded, mark top 20 so we don't burn quota re-pushing hubs.
  pushed_n="$(python3 -c "import json,os; p=os.environ.get('BAIDU_ZZ_STATE','');
import pathlib
f=pathlib.Path(p);
print(len((json.loads(f.read_text()) if f.is_file() and f.stat().st_size else {'pushed':{}}).get('pushed') or {}))" 2>/dev/null || echo 0)"
  if [[ "${pushed_n:-0}" -eq 0 ]]; then
    python3 "$DEPLOY/baidu-push-urls.py" --seed-top 20 || echo "WARNING: seed failed"
    python3 "$DEPLOY/baidu-push-urls.py" --status || true
  fi
else
  echo "WARNING: /etc/toolbasecamp-api.env missing — cron installed but push will fail until token is set"
fi
