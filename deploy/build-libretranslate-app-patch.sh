#!/bin/bash
# Bake LibreTranslate app.js with fixed swapLangs (served at /js/app.js)
set -euo pipefail

DEPLOY="/opt/toolbasecamp-deploy"
OUT="$DEPLOY/libretranslate-app.js"
SRC_URL="http://127.0.0.1:5000/js/app.js"

if ! curl -fsSL "$SRC_URL" -o "$OUT.tmp"; then
  echo "WARNING: cannot fetch $SRC_URL — is LibreTranslate running?"
  exit 0
fi

python3 << 'PY'
from pathlib import Path
import re

path = Path("/opt/toolbasecamp-deploy/libretranslate-app.js.tmp")
text = path.read_text(encoding="utf-8")

fixed = r'''swapLangs: function(e){
                this.closeSuggestTranslation(e);

                var src = this.sourceLang;
                if (src === "auto" && this.output) {
                    try {
                        var _tb = JSON.parse(this.output);
                        if (_tb.detectedLanguage && _tb.detectedLanguage.language) {
                            src = _tb.detectedLanguage.language;
                        }
                    } catch (err) {}
                }
                if (src && src.indexOf("zh") === 0) src = "zh";
                if (src && src.indexOf("en") === 0) src = "en";

                if (this.sourceLang === "auto" || !src || src === "auto") {
                    this.sourceLang = this.targetLang;
                    this.targetLang = this.targetLang === "zh" ? "en" : "zh";
                } else {
                    var tgtLang = this.langs.find(function(l){ return l.code === this.targetLang; }.bind(this));
                    if (!tgtLang || !tgtLang.targets || tgtLang.targets.indexOf(src) === -1) {
                        this.sourceLang = this.targetLang;
                        this.targetLang = src;
                    } else {
                        var t = src;
                        this.sourceLang = this.targetLang;
                        this.targetLang = t;
                    }
                    if (this.sourceLang === this.targetLang) {
                        this.targetLang = this.sourceLang === "zh" ? "en" : "zh";
                    }
                }

                if (this.sourceLang && this.sourceLang.indexOf("zh") === 0) this.sourceLang = "zh";
                if (this.targetLang && this.targetLang.indexOf("zh") === 0) this.targetLang = "zh";
                if (this.sourceLang && this.sourceLang.indexOf("en") === 0) this.sourceLang = "en";
                if (this.targetLang && this.targetLang.indexOf("en") === 0) this.targetLang = "en";

                this.detectedLangText = "";
                this.inputText = this.translatedText;
                this.translatedText = "";
                this.handleInput(e);
            }'''

pattern = r"swapLangs: function\(e\)\{[\s\S]*?\n            \},"
new_text, n = re.subn(pattern, fixed + ",", text, count=1)
if n != 1:
    raise SystemExit("swapLangs block not found in app.js")

Path("/opt/toolbasecamp-deploy/libretranslate-app.js").write_text(new_text, encoding="utf-8")
print("OK: patched libretranslate-app.js")
PY

rm -f "$OUT.tmp"
