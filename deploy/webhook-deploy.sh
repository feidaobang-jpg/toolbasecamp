#!/bin/bash
# Pull from Gitee and deploy Tool Basecamp (triggered by webhook or manual).
set -euo pipefail

LOG="${DEPLOY_LOG:-/var/log/toolbasecamp-deploy.log}"
mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1

echo "=== deploy started $(date -Iseconds) ==="

if [[ -f /etc/toolbasecamp-api.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/toolbasecamp-api.env
  set +a
fi

REPO_PATH="${GITEE_REPO_PATH:-/opt/composite}"
BRANCH="${GITEE_DEPLOY_BRANCH:-master}"
SRC="${REPO_PATH}/web-tool-global"
DEPLOY_KEY="${GITEE_DEPLOY_KEY:-/root/.ssh/gitee_deploy}"

if [[ ! -d "$REPO_PATH/.git" ]]; then
  echo "ERROR: Git repo not found at $REPO_PATH. Run setup-gitee-webhook.sh first."
  exit 1
fi

if [[ ! -d "$SRC" ]]; then
  echo "ERROR: Missing $SRC in repository."
  exit 1
fi

export GIT_SSH_COMMAND="ssh -i ${DEPLOY_KEY} -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes"

cd "$REPO_PATH"
git fetch origin "$BRANCH"
git reset --hard "origin/${BRANCH}"

apt-get install -y python3 python3-venv python3-pip libreoffice-writer git rsync >/dev/null 2>&1 || true

echo "Sync static site..."
rsync -av --delete "${SRC}/public/" /var/www/toolbasecamp/

echo "Sync API..."
rsync -av --delete --exclude venv "${SRC}/server/" /opt/toolbasecamp-api/

echo "Sync deploy scripts..."
rsync -av "${SRC}/deploy/" /opt/toolbasecamp-deploy/
chmod +x /opt/toolbasecamp-deploy/*.sh

APP_DIR=/opt/toolbasecamp-api
mkdir -p "$APP_DIR"
if [[ ! -d "$APP_DIR/venv" ]]; then
  python3 -m venv "$APP_DIR/venv"
fi
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"

if [[ ! -f /etc/systemd/system/toolbasecamp-api.service ]]; then
  cp /opt/toolbasecamp-deploy/toolbasecamp-api.service /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable toolbasecamp-api
fi

bash /opt/toolbasecamp-deploy/patch-nginx-api.sh
systemctl restart toolbasecamp-api
nginx -t && systemctl reload nginx
curl -sf http://127.0.0.1:8001/health

echo "=== deploy finished $(date -Iseconds) ==="
