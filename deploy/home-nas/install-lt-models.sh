#!/usr/bin/env bash
set -euo pipefail

MODELS=/mnt/d/project/toolbasecamp/deploy/home-nas/lt-models
VOL=home-nas_lt-local

docker volume create "$VOL" >/dev/null

docker run --rm \
  --entrypoint sh \
  -v "${VOL}:/data" \
  -v "${MODELS}:/models:ro" \
  --user root \
  nginx:1.27-alpine \
  -lc '
    set -e
    apk add --no-cache unzip >/dev/null
    mkdir -p /data/share/argos-translate/packages
    for f in /models/*.argosmodel; do
      echo "Unpacking $f"
      unzip -o "$f" -d /data/share/argos-translate/packages
    done
    chown -R 1032:1032 /data
    ls -la /data/share/argos-translate/packages
  '

echo "OK: models unpacked into volume $VOL"
