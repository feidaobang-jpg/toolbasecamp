#!/bin/bash
# One-time MySQL setup for Tool Basecamp (run as root)
set -euo pipefail

DB_NAME="${DB_NAME:-toolbasecamp}"
DB_USER="${DB_USER:-toolbasecamp}"
DB_PASSWORD="${DB_PASSWORD:-toolbasecamp}"

echo "[1/3] Installing MySQL..."
apt update
apt install -y mysql-server

echo "[2/3] Creating database and user..."
mysql -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';"
mysql -e "GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

echo "[3/3] Writing /etc/toolbasecamp-api.env (edit JWT_SECRET before production)..."
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
cat > /etc/toolbasecamp-api.env << EOF
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
JWT_SECRET=${JWT_SECRET}
ADMIN_EMAIL=admin@toolbasecamp.com
EOF
chmod 600 /etc/toolbasecamp-api.env

echo "MySQL setup done. Review /etc/toolbasecamp-api.env and restart toolbasecamp-api."
