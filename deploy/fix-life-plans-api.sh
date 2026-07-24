#!/bin/bash
# One-shot fix when /api/life-plans/* returns 404 (stale API process).
set -euo pipefail

APP_DIR=/opt/toolbasecamp-api

echo "=== Disk files ==="
ls -la "$APP_DIR/life_plans.py" "$APP_DIR/main.py" "$APP_DIR/DEPLOY_SHA" || true
echo "DEPLOY_SHA=$(cat "$APP_DIR/DEPLOY_SHA" 2>/dev/null || true)"
grep -n "life.plans\|life_plans\|/life-plans" "$APP_DIR/main.py" "$APP_DIR/life_plans.py" | head -40 || {
  echo "ERROR: life_plans wiring missing on disk — rsync server/ first"
  exit 1
}

echo "=== Clear bytecode ==="
find "$APP_DIR" -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true
find "$APP_DIR" -type f -name '*.pyc' -delete 2>/dev/null || true

echo "=== Verify import on disk ==="
(
  cd "$APP_DIR"
  "$APP_DIR/venv/bin/python" -B -c "
from main import app
paths=sorted(getattr(r,'path','') for r in app.routes)
print([p for p in paths if 'life-plan' in p])
assert '/life-plans/status' in paths
assert '/life-plans/generate' in paths
assert '/life-plans/drug-label' in paths
from life_plans import PLAN_KINDS, LIFE_PLANS_PROMPT_REV
need = {'day_trip','savings','interview','family_meal','travel_pack','office_lunch','fitness_week','job_apply_week'}
missing = sorted(need - set(PLAN_KINDS))
assert not missing, 'disk PLAN_KINDS missing: ' + str(missing)
gone = {'shopping','wishlist','moving'} & set(PLAN_KINDS)
assert not gone, 'disk still has removed kinds: ' + str(sorted(gone))
assert LIFE_PLANS_PROMPT_REV == 8, 'disk prompt_rev=%s' % LIFE_PLANS_PROMPT_REV
print('PLAN_KINDS', sorted(PLAN_KINDS), 'prompt_rev', LIFE_PLANS_PROMPT_REV)
"
)

echo "=== Nuclear restart (free :8001) ==="
systemctl stop toolbasecamp-api 2>/dev/null || true
sleep 1
for _ in 1 2 3 4 5; do
  fuser -k -9 8001/tcp 2>/dev/null || true
  pkill -9 -f '/opt/toolbasecamp-api/venv/bin/python' 2>/dev/null || true
  pkill -9 -f 'run.py' 2>/dev/null || true
  sleep 1
  if ! ss -lnt 2>/dev/null | grep -q ':8001'; then
    break
  fi
done
if ss -lnt 2>/dev/null | grep -q ':8001'; then
  echo "ERROR: cannot free port 8001"
  ss -lntp | grep 8001 || true
  exit 1
fi

if [[ -f /opt/toolbasecamp-deploy/toolbasecamp-api.service ]]; then
  cp /opt/toolbasecamp-deploy/toolbasecamp-api.service /etc/systemd/system/toolbasecamp-api.service
  systemctl daemon-reload
fi

systemctl reset-failed toolbasecamp-api 2>/dev/null || true
systemctl start toolbasecamp-api
sleep 3
systemctl is-active toolbasecamp-api

OK=0
for i in 1 2 3 4 5 6 7 8; do
  HEALTH="$(curl -sf http://127.0.0.1:8001/health || true)"
  echo "try $i: $HEALTH"
  if echo "$HEALTH" | grep -q '"life_plans_api":true' \
    && echo "$HEALTH" | grep -q '"life_plans_ready":true' \
    && echo "$HEALTH" | grep -q '"life_plans_day_trip":true' \
    && echo "$HEALTH" | grep -q '"life_plans_prompt_rev":8' \
    && echo "$HEALTH" | grep -q 'family_meal' \
    && ! echo "$HEALTH" | grep -q '"shopping"' \
    && ! echo "$HEALTH" | grep -q '"wishlist"'; then
    OK=1
    break
  fi
  sleep 2
done
if [[ "$OK" != "1" ]]; then
  echo "FAILED: health missing life_plans_ready / prompt_rev=8 in process memory"
  journalctl -u toolbasecamp-api -n 60 --no-pager || true
  exit 1
fi
curl -sf http://127.0.0.1:8001/openapi.json | grep -q '/life-plans/status' || {
  echo "FAILED: openapi missing /life-plans/status"
  exit 1
}
echo "OK: life-plans API is live on :8001 (prompt_rev=8)"
