#!/bin/bash
# Bake LibreTranslate app.js with fixed swapLangs (served at /js/app.js)
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
OUT="$DEPLOY/libretranslate-app.js"
TMP="$DEPLOY/libretranslate-app.js.tmp"
PATCH="$DEPLOY/patch_libretranslate_app.py"
SRC_URL="http://127.0.0.1:5000/js/app.js"

if [[ ! -f "$PATCH" ]]; then
  echo "ERROR: $PATCH not found"
  exit 1
fi

if ! curl -fsSL "$SRC_URL" -o "$TMP"; then
  echo "WARNING: cannot fetch $SRC_URL — is LibreTranslate running?"
  exit 0
fi

python3 "$PATCH" "$TMP" "$OUT"
rm -f "$TMP"

if ! grep -q 'detectedLanguage' "$OUT"; then
  echo "ERROR: patched app.js verification failed"
  exit 1
fi

echo "Verified: swapLangs patch present in $OUT"
