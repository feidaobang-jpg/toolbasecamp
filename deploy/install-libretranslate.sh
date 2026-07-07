#!/bin/bash
# LibreTranslate via Docker on 127.0.0.1:5000 (en + zh only to limit memory)
set -euo pipefail

IMAGE="libretranslate/libretranslate:latest"
CONTAINER="libretranslate"
PORT="5000"
MEM_LIMIT="${LT_MEMORY_LIMIT:-2g}"

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi
  echo "Installing Docker..."
  apt-get update -qq
  apt-get install -y ca-certificates curl gnupg >/dev/null 2>&1 || true
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME:-jammy}") stable" \
      > /etc/apt/sources.list.d/docker.list
  fi
  apt-get update -qq
  apt-get install -y docker-ce docker-ce-cli containerd.io >/dev/null 2>&1 \
    || apt-get install -y docker.io >/dev/null 2>&1
  systemctl enable docker
  systemctl start docker
}

needs_recreate() {
  if ! docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    return 0
  fi
  local env
  env="$(docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null || true)"
  echo "$env" | grep -q 'LT_LOAD_ONLY=en,zh' || return 0
  echo "$env" | grep -q 'LT_HIDE_API=true' || return 0
  if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    return 0
  fi
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/" || echo 000)"
  [[ "$CODE" == "200" ]] || return 0
  return 1
}

run_libretranslate() {
  docker rm -f "$CONTAINER" 2>/dev/null || true
  docker run -d --name "$CONTAINER" --restart unless-stopped \
    -p "127.0.0.1:${PORT}:5000" \
    --memory "$MEM_LIMIT" \
    -e LT_LOAD_ONLY=en,zh \
    -e LT_DISABLE_WEB_UI=false \
    -e LT_HIDE_API=true \
    -e LT_SUGGESTIONS=false \
    -e LT_REQ_LIMIT=30 \
    "$IMAGE"
}

wait_ready() {
  for i in $(seq 1 36); do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/" || echo 000)"
    if [[ "$CODE" == "200" ]]; then
      echo "LibreTranslate ready (HTTP 200)."
      return 0
    fi
    echo "Waiting for LibreTranslate... HTTP $CODE (attempt $i/36)"
    sleep 5
  done
  docker logs "$CONTAINER" --tail 40 || true
  return 1
}

patch_app_js() {
  if [[ -f /opt/toolbasecamp-deploy/build-libretranslate-app-patch.sh ]]; then
    bash /opt/toolbasecamp-deploy/build-libretranslate-app-patch.sh || true
  fi
}

install_docker

if needs_recreate; then
  echo "Creating/updating LibreTranslate container..."
  docker pull "$IMAGE" || true
  run_libretranslate
  wait_ready
  patch_app_js
else
  echo "LibreTranslate already configured — restarting."
  docker restart "$CONTAINER"
  wait_ready
  patch_app_js
fi

echo "LibreTranslate on http://127.0.0.1:${PORT} (languages: en, zh)"
