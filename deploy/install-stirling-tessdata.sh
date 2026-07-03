#!/bin/bash
# Download Tesseract OCR language packs for Stirling-PDF
set -euo pipefail

TESSDIR="/opt/toolbasecamp-stirling/tessdata"
BASE="https://github.com/tesseract-ocr/tessdata_fast/raw/main"

mkdir -p "$TESSDIR"

download_lang() {
  local lang="$1"
  local dest="$TESSDIR/${lang}.traineddata"
  if [[ -f "$dest" && -s "$dest" ]]; then
    echo "OK: $lang already present"
    return 0
  fi
  echo "Downloading $lang.traineddata..."
  curl -fsSL "${BASE}/${lang}.traineddata" -o "$dest"
}

# eng required; chi_sim for Simplified Chinese OCR
download_lang eng
download_lang chi_sim

echo "=== tessdata ==="
ls -lh "$TESSDIR"/*.traineddata
