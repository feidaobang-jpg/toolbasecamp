#!/bin/bash
# Fix Stirling UI locale: empty defaultLocale = browser auto-detect (like next-tools)
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
CUSTOM="$DEPLOY/stirling-custom_settings.yml"

docker run --rm \
  -v stirling-data:/configs \
  -v "$CUSTOM:/seed/custom_settings.yml:ro" \
  alpine:3.20 sh -c '
    mkdir -p /configs/customConfigs
    cp /seed/custom_settings.yml /configs/customConfigs/custom_settings.yml
    for f in /configs/settings.yml /configs/customConfigs/custom_settings.yml; do
      if [ -f "$f" ]; then
        sed -i \
          "s/^  defaultLocale:.*/  defaultLocale: \"\"/g" \
          "$f" 2>/dev/null || true
        sed -i \
          "s/defaultLocale: .en-US.*/defaultLocale: \"\"/g" \
          "$f" 2>/dev/null || true
        sed -i \
          "s/defaultLocale: .en-GB.*/defaultLocale: \"\"/g" \
          "$f" 2>/dev/null || true
      fi
    done
    echo "=== defaultLocale in configs ==="
    grep -r defaultLocale /configs/settings.yml /configs/customConfigs/ 2>/dev/null || true
  '

echo "Stirling locale patched (browser auto-detect enabled)."
