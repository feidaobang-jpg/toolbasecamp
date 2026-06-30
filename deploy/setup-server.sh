#!/bin/bash
# One-time server setup for toolbasecamp.com (run as root on DigitalOcean)
# Usage: bash setup-server.sh

set -euo pipefail

WEB_ROOT="/var/www/toolbasecamp"
NGINX_SITE="/etc/nginx/sites-available/toolbasecamp"

echo "[1/5] Install packages..."
apt update
apt install -y nginx git rsync ufw

echo "[2/5] Web root..."
mkdir -p "$WEB_ROOT"
chown -R www-data:www-data "$WEB_ROOT"

echo "[3/5] Nginx site..."
cat > "$NGINX_SITE" << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name toolbasecamp.com www.toolbasecamp.com;

    root /var/www/toolbasecamp;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    gzip on;
    gzip_types text/css application/javascript text/html;
}
EOF

ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/toolbasecamp
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl reload nginx

echo "[4/5] Firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "[5/5] Deploy user directory for git/rsync..."
mkdir -p /root/.ssh
chmod 700 /root/.ssh

echo ""
echo "Done. Next:"
echo "  1) Deploy files to $WEB_ROOT (manual rsync or GitHub Actions)"
echo "  2) Cloudflare DNS A -> this server IP (proxied orange cloud)"
echo "  3) Optional HTTPS: certbot --nginx -d toolbasecamp.com -d www.toolbasecamp.com"
