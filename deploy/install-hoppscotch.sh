#!/bin/bash
# Hoppscotch Community Edition via Docker Compose (postgres + AIO)
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
COMPOSE="$DEPLOY/hoppscotch-compose.yml"
ENV_FILE="$DEPLOY/hoppscotch.env"
REF_FILE="$DEPLOY/hoppscotch.ref"
DOMAIN="hoppscotch.toolbasecamp.com"
BASE_URL="https://${DOMAIN}"

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
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1 \
    || apt-get install -y docker.io docker-compose-v2 >/dev/null 2>&1
  systemctl enable docker
  systemctl start docker
}

gen_secret() {
  openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | xxd -p | head -c 32
}

ensure_env() {
  if [[ -f "$ENV_FILE" ]]; then
    return 0
  fi
  echo "Creating $ENV_FILE..."
  local db_pass enc_key
  db_pass="$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)"
  enc_key="$(gen_secret)"
  cat > "$ENV_FILE" <<EOF
DATABASE_URL=postgresql://postgres:${db_pass}@hoppscotch-db:5432/hoppscotch?connect_timeout=300
DATA_ENCRYPTION_KEY=${enc_key}
WHITELISTED_ORIGINS=${BASE_URL},app://hoppscotch
TRUST_PROXY=true
VITE_BASE_URL=${BASE_URL}
VITE_SHORTCODE_BASE_URL=${BASE_URL}
VITE_ADMIN_URL=${BASE_URL}/admin
VITE_BACKEND_GQL_URL=${BASE_URL}/graphql
VITE_BACKEND_WS_URL=wss://${DOMAIN}/graphql
VITE_BACKEND_API_URL=${BASE_URL}/v1
ENABLE_SUBPATH_BASED_ACCESS=false
EOF
  chmod 600 "$ENV_FILE"
  export HOPPSCOTCH_DB_PASSWORD="$db_pass"
  echo "HOPPSCOTCH_DB_PASSWORD=${db_pass}" > "$DEPLOY/hoppscotch-db.secret"
  chmod 600 "$DEPLOY/hoppscotch-db.secret"
  printf 'HOPPSCOTCH_DB_PASSWORD=%s\n' "$db_pass" > "$DEPLOY/hoppscotch-compose.env"
  chmod 600 "$DEPLOY/hoppscotch-compose.env"
}

load_db_password() {
  if [[ -f "$DEPLOY/hoppscotch-db.secret" ]]; then
    # shellcheck disable=SC1090
    source "$DEPLOY/hoppscotch-db.secret"
  elif [[ -f "$ENV_FILE" ]]; then
    local url
    url="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)"
    HOPPSCOTCH_DB_PASSWORD="$(printf '%s' "$url" | sed -n 's|.*postgres:\([^@]*\)@.*|\1|p')"
  else
    echo "ERROR: cannot determine HOPPSCOTCH_DB_PASSWORD"
    exit 1
  fi
  export HOPPSCOTCH_DB_PASSWORD
  printf 'HOPPSCOTCH_DB_PASSWORD=%s\n' "$HOPPSCOTCH_DB_PASSWORD" > "$DEPLOY/hoppscotch-compose.env"
  chmod 600 "$DEPLOY/hoppscotch-compose.env"
}

run_migrations() {
  local tag db_id network
  tag="$(tr -d '\r\n' < "$REF_FILE" 2>/dev/null || echo '2026.6.0')"
  echo "Running Hoppscotch DB migrations (image ${tag})..."
  cd "$DEPLOY"
  db_id="$(docker compose -f "$COMPOSE" ps -q hoppscotch-db)"
  network="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$db_id")"
  docker run --rm --network "$network" \
    --env-file "$ENV_FILE" \
    --entrypoint sh \
    "hoppscotch/hoppscotch:${tag}" \
    -c 'pnpm exec prisma migrate deploy'
}

wait_hoppscotch() {
  for i in $(seq 1 30); do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || echo 000)"
    if [[ "$CODE" == "200" ]]; then
      echo "Hoppscotch ready (HTTP 200 on :3000)."
      return 0
    fi
    echo "Waiting for Hoppscotch... HTTP $CODE (attempt $i/30)"
    sleep 5
  done
  docker compose -f "$COMPOSE" logs --tail 40 hoppscotch || true
  return 1
}

install_docker

if [[ ! -f "$COMPOSE" ]]; then
  echo "ERROR: $COMPOSE not found"
  exit 1
fi

ensure_env
load_db_password

export HOPPSCOTCH_IMAGE_TAG="$(tr -d '\r\n' < "$REF_FILE" 2>/dev/null || echo '2026.6.0')"

cd "$DEPLOY"
docker compose -f "$COMPOSE" pull hoppscotch hoppscotch-db || true
docker compose -f "$COMPOSE" up -d hoppscotch-db

for i in $(seq 1 24); do
  if docker compose -f "$COMPOSE" exec -T hoppscotch-db pg_isready -U postgres -d hoppscotch >/dev/null 2>&1; then
    break
  fi
  sleep 2
  [[ "$i" -eq 24 ]] && { echo "ERROR: postgres not ready"; exit 1; }
done

run_migrations
docker compose -f "$COMPOSE" up -d hoppscotch
wait_hoppscotch

echo "Hoppscotch installed at ${BASE_URL}"
