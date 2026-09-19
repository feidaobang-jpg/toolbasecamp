#!/usr/bin/env bash
set -u
cd -- "$(dirname -- "$(readlink -f -- "$0")")" || exit 1
exec 9>/run/lock/tbc-tunnel-watchdog.lock
flock -n 9 || exit 0
log() { printf '%s %s\n' "$(date -Is)" "$*"; }
failures=0
log 'Watchdog started; checking /ready instead of registration log age.'
while true; do
  if ! systemctl is-active --quiet docker; then
    systemctl start docker || { sleep 30; continue; }
  fi
  if [ "$(docker inspect -f '{{.State.Running}}' tbc-cloudflared 2>/dev/null)" != true ]; then
    log 'Starting stopped tunnel.'
    if docker container inspect tbc-cloudflared >/dev/null 2>&1; then
      docker start tbc-cloudflared
    else
      docker compose up -d cloudflared
    fi
    failures=0
    sleep 90
    continue
  fi
  ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' tbc-cloudflared)
  if [ -n "$ip" ] && curl --noproxy '*' -fsS --max-time 10 "http://${ip}:20241/ready" >/dev/null 2>&1; then
    [ "$failures" -eq 0 ] || log 'Tunnel recovered.'
    failures=0
  else
    failures=$((failures + 1))
    log "Tunnel readiness failed ($failures/3)."
    if [ "$failures" -ge 3 ]; then
      log 'Restarting tunnel after three consecutive readiness failures.'
      docker restart tbc-cloudflared
      failures=0
      sleep 90
    fi
  fi
  sleep 30
done
