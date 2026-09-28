#!/usr/bin/env bash
# Docker Engine (no Desktop) inside WSL2 — run: wsl -d Ubuntu-24.04 bash install-docker-engine-wsl.sh
set -euo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run as your normal WSL user (script uses sudo)." >&2
  exit 1
fi

WSL_CONF=/etc/wsl.conf
if ! grep -q 'systemd=true' "$WSL_CONF" 2>/dev/null; then
  echo "[boot]" | sudo tee "$WSL_CONF" >/dev/null
  echo "systemd=true" | sudo tee -a "$WSL_CONF" >/dev/null
  echo "Wrote systemd=true to $WSL_CONF — exit WSL and run: wsl --shutdown"
  echo "Then re-open Ubuntu and run this script again."
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi

sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

echo "Docker Engine:"
docker version

COMPOSE_DIR="/mnt/d/project/toolbasecamp/deploy/home-nas"
if [[ -d "$COMPOSE_DIR" ]]; then
  echo "Compose project: $COMPOSE_DIR"
else
  echo "Warning: $COMPOSE_DIR not found (adjust path if D: is different)." >&2
fi

echo ""
echo "Next (from Windows PowerShell, after wsl --shutdown once if systemd was just enabled):"
echo "  .\\setup-docker-context-wsl.ps1"
