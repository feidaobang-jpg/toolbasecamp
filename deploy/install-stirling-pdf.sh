#!/bin/bash
# Stirling-PDF via Docker on 127.0.0.1:8080
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
if [[ -f "$DEPLOY/pdf-on-nas.flag" ]]; then
  echo "PDF runs on home NAS (pdf-on-nas.flag) — skip Stirling on VPS."
  exit 0
fi

STIRLING_IMAGE="docker.stirlingpdf.com/stirlingtools/stirling-pdf"
STIRLING_PORT="8080"
CONTAINER="stirling-pdf"
CUSTOM_SETTINGS="$DEPLOY/stirling-custom_settings.yml"
TESSDIR="/opt/toolbasecamp-stirling/tessdata"

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
  echo "$env" | grep -q 'TESSERACT_LANGS=.*chi_sim' || return 0
  echo "$env" | grep -q 'JAVA_TOOL_OPTIONS=.*Xmx896m' || return 0
  if ! docker inspect "$CONTAINER" --format '{{.HostConfig.Memory}}' 2>/dev/null | grep -q '1342177280'; then
    return 0
  fi
  if ! docker inspect "$CONTAINER" --format '{{json .Mounts}}' 2>/dev/null | grep -q tessdata; then
    return 0
  fi
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
    --memory 1280m --memory-swap 1536m \
    -p "127.0.0.1:${STIRLING_PORT}:8080" \
    -v stirling-data:/configs \
    -v "${TESSDIR}:/usr/share/tessdata" \
    -e DISABLE_ADDITIONAL_FEATURES=false \
    -e SECURITY_ENABLELOGIN=false \
    -e SECURITY_CSRFDISABLED=true \
    -e SYSTEM_ENABLEONBOARDING=false \
    -e SYSTEM_ENABLEDESKTOPINSTALLSLIDE=false \
    -e SYSTEM_GOOGLEVISIBILITY=false \
    -e TESSERACT_LANGS=eng,chi_sim \
    -e SYSTEM_MAXFILESIZE=100 \
    -e JAVA_TOOL_OPTIONS="-Xms256m -Xmx896m" \
    -e UI_APPNAME="PDF Toolkit" \
    -e UI_APPNAMENAVBAR="PDF Toolkit" \
    "$STIRLING_IMAGE"
}

wait_stirling() {
  for i in $(seq 1 48); do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 3 --max-time 15 "http://127.0.0.1:${STIRLING_PORT}/" || echo 000)"
    if [[ "$CODE" == "200" ]]; then
      echo "Stirling-PDF ready (HTTP 200) after ~$((i * 5))s max."
      return 0
    fi
    if [[ "$i" -le 3 || $((i % 6)) -eq 0 ]]; then
      echo "Waiting for Stirling-PDF... HTTP $CODE (attempt $i/48, cold start may take 60–90s)"
    fi
    sleep 5
  done
  echo "ERROR: Stirling-PDF did not become ready — recent logs:"
  docker logs "$CONTAINER" --tail 50 || true
  docker inspect "$CONTAINER" --format 'State={{.State.Status}} OOM={{.State.OOMKilled}} Exit={{.State.ExitCode}}' || true
  return 1
}

install_docker

if [[ -f "$DEPLOY/install-stirling-tessdata.sh" ]]; then
  bash "$DEPLOY/install-stirling-tessdata.sh"
else
  mkdir -p "$TESSDIR"
fi

if [[ -f "$DEPLOY/patch-stirling-config.sh" ]]; then
  bash "$DEPLOY/patch-stirling-config.sh"
fi

seed_custom_settings

if needs_recreate; then
  echo "Creating/updating Stirling-PDF container..."
  run_stirling
  wait_stirling
else
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 3 --max-time 15 "http://127.0.0.1:${STIRLING_PORT}/" || echo 000)"
  if [[ "$CODE" == "200" ]]; then
    echo "Stirling-PDF already healthy (HTTP 200) — skip restart."
  else
    echo "Stirling-PDF not responding (HTTP $CODE) — starting..."
    docker start "$CONTAINER" 2>/dev/null || run_stirling
    wait_stirling
  fi
fi

seed_custom_settings

echo "OCR languages:"
docker exec "$CONTAINER" sh -c 'ls /usr/share/tessdata/*.traineddata 2>/dev/null | xargs -n1 basename' || true

if [[ -f "$DEPLOY/patch-stirling-ocr.sh" ]]; then
  bash "$DEPLOY/patch-stirling-ocr.sh" "$CONTAINER"
fi
