#!/bin/bash
# Run on server via Web Console — bootstrap before first deploy
set -euo pipefail

echo "=== Tool Basecamp bootstrap ==="
apt update
apt install -y nginx python3 python3-pip python3-venv git rsync ufw \
  libreoffice-writer certbot python3-certbot-nginx

mkdir -p /var/www/toolbasecamp /opt/toolbasecamp-api /opt/toolbasecamp-deploy

if [[ ! -f /etc/nginx/sites-enabled/toolbasecamp ]]; then
  cat > /etc/nginx/sites-available/toolbasecamp << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name toolbasecamp.com www.toolbasecamp.com;
    root /var/www/toolbasecamp;
    index index.html;
    include snippets/toolbasecamp-api.conf;
    location / { try_files $uri $uri/ =404; }
}
EOF
  ln -sf /etc/nginx/sites-available/toolbasecamp /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
fi

ufw allow OpenSSH 2>/dev/null || true
ufw allow 'Nginx Full' 2>/dev/null || true
ufw --force enable 2>/dev/null || true

nginx -t && systemctl enable nginx && systemctl reload nginx

echo "Bootstrap done. Run setup-gitee-webhook.sh, then push to Gitee to deploy."
