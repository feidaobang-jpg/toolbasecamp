#!/bin/bash
# One-time API setup on the server (run as root)
set -euo pipefail

APP_DIR="/opt/toolbasecamp-api"
REPO_DEPLOY="/tmp/toolbasecamp-deploy"

echo "[1/6] System packages..."
apt update
apt install -y python3 python3-pip python3-venv libreoffice-writer

echo "[2/6] App directory..."
mkdir -p "$APP_DIR"

if [[ -d "$REPO_DEPLOY/server" ]]; then
  rsync -a --delete "$REPO_DEPLOY/server/" "$APP_DIR/"
else
  echo "Note: sync server/ to $APP_DIR manually or via CI first."
fi

echo "[3/6] Python venv..."
python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/requirements.txt"

echo "[4/6] systemd service..."
if [[ -f "$REPO_DEPLOY/deploy/toolbasecamp-api.service" ]]; then
  cp "$REPO_DEPLOY/deploy/toolbasecamp-api.service" /etc/systemd/system/toolbasecamp-api.service
elif [[ -f /opt/toolbasecamp-api/../deploy/toolbasecamp-api.service ]]; then
  cp /opt/toolbasecamp-api/../deploy/toolbasecamp-api.service /etc/systemd/system/toolbasecamp-api.service 2>/dev/null || true
fi

if [[ ! -f /etc/systemd/system/toolbasecamp-api.service ]]; then
  cat > /etc/systemd/system/toolbasecamp-api.service << 'EOF'
[Unit]
Description=Tool Basecamp API (FastAPI)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/toolbasecamp-api
Environment=HOST=127.0.0.1
Environment=PORT=8001
ExecStart=/opt/toolbasecamp-api/venv/bin/python run.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
fi

systemctl daemon-reload
systemctl enable toolbasecamp-api
systemctl restart toolbasecamp-api

echo "[5/6] Nginx /api proxy..."
if [[ -f "$REPO_DEPLOY/deploy/patch-nginx-api.sh" ]]; then
  bash "$REPO_DEPLOY/deploy/patch-nginx-api.sh"
fi

echo "[6/6] Health check..."
sleep 2
curl -sf http://127.0.0.1:8001/health && echo ""
systemctl status toolbasecamp-api --no-pager | head -5
echo "API setup done."
