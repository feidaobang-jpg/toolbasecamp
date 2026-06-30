#!/bin/bash
# Manual deploy from Linux/macOS/Git Bash
# Usage:
#   export DO_HOST=134.209.221.228
#   export DO_USER=root
#   bash deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_DIR="$(cd "$SCRIPT_DIR/../public" && pwd)"
HOST="${DO_HOST:?Set DO_HOST}"
USER="${DO_USER:-root}"
REMOTE_PATH="${DO_REMOTE_PATH:-/var/www/toolbasecamp}"

echo "Deploying $PUBLIC_DIR -> ${USER}@${HOST}:${REMOTE_PATH}/"
rsync -avz --delete \
  -e "ssh -o StrictHostKeyChecking=accept-new" \
  "$PUBLIC_DIR/" \
  "${USER}@${HOST}:${REMOTE_PATH}/"

ssh "${USER}@${HOST}" "nginx -t && systemctl reload nginx"
echo "Done. Visit https://toolbasecamp.com"
