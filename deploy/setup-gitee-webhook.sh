#!/bin/bash
# One-time: clone Gitee repo on server and configure webhook deploy env.
# Run as root on the DigitalOcean droplet.
set -euo pipefail

REPO_URL="${GITEE_REPO_URL:-git@gitee.com:zhengxiaohui/composite.git}"
REPO_PATH="${GITEE_REPO_PATH:-/opt/composite}"
BRANCH="${GITEE_DEPLOY_BRANCH:-master}"
DEPLOY_KEY="${GITEE_DEPLOY_KEY:-/root/.ssh/gitee_deploy}"
ENV_FILE="/etc/toolbasecamp-api.env"

echo "[1/5] Installing git..."
apt-get update
apt-get install -y git rsync

echo "[2/5] Deploy key for Gitee (read-only)..."
mkdir -p /root/.ssh
chmod 700 /root/.ssh
if [[ ! -f "$DEPLOY_KEY" ]]; then
  ssh-keygen -t ed25519 -f "$DEPLOY_KEY" -N "" -C "toolbasecamp-server-deploy"
fi
chmod 600 "$DEPLOY_KEY"
echo ""
echo "---------- Add this PUBLIC key to Gitee ----------"
echo "Repo → 管理 → 部署公钥 → 添加公钥"
cat "${DEPLOY_KEY}.pub"
echo "---------------------------------------------------"
echo ""
read -r -p "Press Enter after the deploy key is added on Gitee..."

echo "[3/5] Clone or update repository at ${REPO_PATH}..."
export GIT_SSH_COMMAND="ssh -i ${DEPLOY_KEY} -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes"
if [[ -d "$REPO_PATH/.git" ]]; then
  cd "$REPO_PATH"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git reset --hard "origin/${BRANCH}"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO_PATH"
fi

echo "[4/5] Writing webhook env to ${ENV_FILE}..."
WEBHOOK_SECRET="${GITEE_WEBHOOK_SECRET:-$(openssl rand -hex 24)}"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

upsert_env() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >>"$ENV_FILE"
  fi
}

upsert_env "GITEE_WEBHOOK_SECRET" "$WEBHOOK_SECRET"
upsert_env "GITEE_REPO_PATH" "$REPO_PATH"
upsert_env "GITEE_DEPLOY_BRANCH" "$BRANCH"
upsert_env "GITEE_DEPLOY_KEY" "$DEPLOY_KEY"
upsert_env "DEPLOY_SCRIPT" "/opt/toolbasecamp-deploy/webhook-deploy.sh"

mkdir -p /opt/toolbasecamp-deploy /var/www/toolbasecamp /opt/toolbasecamp-api
if [[ -f "${REPO_PATH}/web-tool-global/deploy/webhook-deploy.sh" ]]; then
  cp "${REPO_PATH}/web-tool-global/deploy/webhook-deploy.sh" /opt/toolbasecamp-deploy/
  chmod +x /opt/toolbasecamp-deploy/webhook-deploy.sh
fi

echo "[5/5] First deploy..."
bash /opt/toolbasecamp-deploy/webhook-deploy.sh || true
systemctl restart toolbasecamp-api 2>/dev/null || true

echo ""
echo "========== Gitee Webhook setup =========="
echo "URL:      https://toolbasecamp.com/api/webhook/gitee"
echo "Password: ${WEBHOOK_SECRET}"
echo "(Gitee sends this as header X-Gitee-Token)"
echo ""
echo "Gitee → composite 仓库 → 管理 → WebHooks → 添加"
echo "  - URL:  https://toolbasecamp.com/api/webhook/gitee"
echo "  - 密码: 填上面的 Password"
echo "  - 事件: 勾选 Push"
echo "========================================="
echo "Deploy log: /var/log/toolbasecamp-deploy.log"
