#!/bin/bash
# Patch LibreTranslate app.js swapLangs (auto-detect + undefined tgtLang)
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
SRC_URL="http://127.0.0.1:5000/js/app.js"
OUT="$DEPLOY/libretranslate-app.js"
TMP="$(mktemp)"

curl -fsSL "$SRC_URL" -o "$TMP"

python3 << 'PY' "$TMP" "$OUT"
import sys
from pathlib import Path

src = Path(sys.argv[1]).read_text(encoding="utf-8")
old_find = "var tgtLang = this.langs.find(l => l.code === this.targetLang);"
old_if = "if (tgtLang.targets.indexOf(this.sourceLang) === -1) return; // Not supported"

new_find = """var tgtLang = this.langs.find(l => l.code === this.targetLang);
                if (!tgtLang || !tgtLang.targets) return;"""

new_if = """if (this.sourceLang === "auto") {
                    try {
                        var _tb = JSON.parse(this.output);
                        if (_tb && _tb.detectedLanguage) this.sourceLang = _tb.detectedLanguage.language;
                    } catch (_e) {}
                }
                if (this.sourceLang === "auto") {
                    this.sourceLang = this.targetLang;
                    this.targetLang = this.targetLang === "zh" ? "en" : "zh";
                    this.detectedLangText = "";
                    this.inputText = this.translatedText;
                    this.translatedText = "";
                    this.handleInput(e);
                    return;
                }
                if (tgtLang.targets.indexOf(this.sourceLang) === -1) return; // Not supported"""

if old_find not in src:
    print("ERROR: swapLangs find line not found in app.js — LibreTranslate version changed?")
    sys.exit(1)
if old_if not in src:
    print("ERROR: swapLangs guard line not found in app.js")
    sys.exit(1)

src = src.replace(old_find, new_find, 1).replace(old_if, new_if, 1)
Path(sys.argv[2]).write_text(src, encoding="utf-8")
print("OK: patched app.js ->", sys.argv[2])
PY

rm -f "$TMP"
chmod 644 "$OUT"
