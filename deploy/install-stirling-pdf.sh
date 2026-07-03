#!/bin/bash
# Stirling-PDF via Docker on 127.0.0.1:8080 (no login, English UI)
set -euo pipefail

STIRLING_IMAGE="docker.stirlingpdf.com/stirlingtools/stirling-pdf"
STIRLING_PORT="8080"
CONTAINER="stirling-pdf"

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

run_stirling() {
  docker rm -f "$CONTAINER" 2>/dev/null || true
  docker run -d --name "$CONTAINER" --restart unless-stopped \
    -p "127.0.0.1:${STIRLING_PORT}:8080" \
    -v stirling-data:/configs \
    -e SECURITY_ENABLELOGIN=false \
    -e DISABLE_ADDITIONAL_FEATURES=false \
    -e SYSTEM_DEFAULTLOCALE=en-US \
    "$STIRLING_IMAGE"
}

wait_stirling() {
  for i in $(seq 1 18); do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${STIRLING_PORT}/" || echo 000)"
    if [[ "$CODE" == "200" ]]; then
      echo "Stirling-PDF ready (HTTP 200)."
      return 0
    fi
    echo "Waiting for Stirling-PDF... HTTP $CODE (attempt $i/18)"
    sleep 10
  done
  docker logs "$CONTAINER" --tail 30 || true
  return 1
}

install_docker

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${STIRLING_PORT}/" || echo 000)"
  if [[ "$CODE" == "200" ]]; then
    echo "Stirling-PDF already running (HTTP 200)."
    exit 0
  fi
  echo "Stirling-PDF returned HTTP $CODE — recreating with login disabled..."
fi

run_stirling
wait_stirling
