#!/usr/bin/env python3
"""Patch LibreTranslate app.js swapLangs for auto-detect + en/zh only."""
from __future__ import annotations

import re
import sys
from pathlib import Path

FIXED = r"""swapLangs: function(e){
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
            }"""

PATTERN = re.compile(r"swapLangs: function\(e\)\{[\s\S]*?\n            \},")


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: patch_libretranslate_app.py INPUT.js OUTPUT.js", file=sys.stderr)
        return 1

    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    text = src.read_text(encoding="utf-8")

    new_text, n = PATTERN.subn(FIXED + ",", text, count=1)
    if n != 1:
        print("ERROR: swapLangs block not found in app.js", file=sys.stderr)
        return 1

    dst.write_text(new_text, encoding="utf-8")
    print(f"OK: patched {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
