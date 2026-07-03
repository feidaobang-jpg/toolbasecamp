#!/bin/bash
# Stirling-PDF via Docker on 127.0.0.1:8080
set -euo pipefail

STIRLING_IMAGE="docker.stirlingpdf.com/stirlingtools/stirling-pdf"
STIRLING_PORT="8080"
CONTAINER="stirling-pdf"
DEPLOY="/opt/toolbasecamp-deploy"
CUSTOM_SETTINGS="$DEPLOY/stirling-custom_settings.yml"

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

seed_custom_settings() {
  if [[ ! -f "$CUSTOM_SETTINGS" ]]; then
    echo "WARNING: $CUSTOM_SETTINGS not found — using env vars only."
    return 0
  fi
  docker run --rm \
    -v stirling-data:/configs \
    -v "$CUSTOM_SETTINGS:/seed/custom_settings.yml:ro" \
    alpine:3.20 sh -c 'mkdir -p /configs/customConfigs && cp /seed/custom_settings.yml /configs/customConfigs/custom_settings.yml'
}

needs_recreate() {
  if ! docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    return 0
  fi
  local env
  env="$(docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null || true)"
  echo "$env" | grep -qx 'SECURITY_CSRFDISABLED=true' || return 0
  echo "$env" | grep -qx 'SYSTEM_ENABLEONBOARDING=false' || return 0
  echo "$env" | grep -qx 'SYSTEM_ENABLEDESKTOPINSTALLSLIDE=false' || return 0
  if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    return 0
  fi
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${STIRLING_PORT}/" || echo 000)"
  [[ "$CODE" == "200" ]] || return 0
  return 1
}

run_stirling() {
  docker rm -f "$CONTAINER" 2>/dev/null || true
  docker run -d --name "$CONTAINER" --restart unless-stopped \
    -p "127.0.0.1:${STIRLING_PORT}:8080" \
    -v stirling-data:/configs \
    -e DISABLE_ADDITIONAL_FEATURES=false \
    -e SECURITY_ENABLELOGIN=false \
    -e SECURITY_CSRFDISABLED=true \
    -e SYSTEM_ENABLEONBOARDING=false \
    -e SYSTEM_ENABLEDESKTOPINSTALLSLIDE=false \
    -e SYSTEM_GOOGLEVISIBILITY=false \
    -e SYSTEM_DEFAULTLOCALE=en-US \
    -e SYSTEM_MAXFILESIZE=100 \
    -e UI_APPNAME="PDF Toolkit" \
    -e UI_APPNAMENAVBAR="PDF Toolkit" \
    "$STIRLING_IMAGE"
}

wait_stirling() {
  for i in $(seq 1 24); do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${STIRLING_PORT}/" || echo 000)"
    if [[ "$CODE" == "200" ]]; then
      echo "Stirling-PDF ready (HTTP 200)."
      return 0
    fi
    echo "Waiting for Stirling-PDF... HTTP $CODE (attempt $i/24)"
    sleep 10
  done
  docker logs "$CONTAINER" --tail 40 || true
  return 1
}

install_docker
seed_custom_settings

if needs_recreate; then
  echo "Creating/updating Stirling-PDF container..."
  run_stirling
  wait_stirling
else
  echo "Stirling-PDF already configured — restarting to apply settings file."
  docker restart "$CONTAINER"
  wait_stirling
fi

seed_custom_settings
