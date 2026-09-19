#!/usr/bin/env bash
set -euo pipefail
OUT=/mnt/d/project/toolbasecamp/deploy/home-nas/lt-models
mkdir -p "$OUT"
cd "$OUT"
aria2c -x 16 -s 16 -k 1M -c --file-allocation=none \
  -o translate-zh_en-1_9.argosmodel \
  https://data.argosopentech.com/argospm/v1/translate-zh_en-1_9.argosmodel
aria2c -x 16 -s 16 -k 1M -c --file-allocation=none \
  -o translate-en_zh-1_9.argosmodel \
  https://data.argosopentech.com/argospm/v1/translate-en_zh-1_9.argosmodel
ls -lh "$OUT"
