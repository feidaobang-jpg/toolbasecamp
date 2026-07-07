#!/usr/bin/env python3
"""Patch LibreTranslate app.js swapLangs for auto-detect + en/zh only."""
from __future__ import annotations

import re
import sys
from pathlib import Path

FIXED = r"""swapLangs: function(e){
                this.closeSuggestTranslation(e);

                var tgt = this.targetLang;
                var src = this.sourceLang;
                if (!tgt || tgt === "undefined") tgt = "zh";
                if (!src || src === "undefined") src = "en";
                if (tgt.indexOf("zh") === 0) tgt = "zh";
                else if (tgt.indexOf("en") === 0) tgt = "en";
                else tgt = "zh";
                if (src === "auto" && this.output) {
                    try {
                        var _tb = JSON.parse(this.output);
                        if (_tb.detectedLanguage && _tb.detectedLanguage.language) {
                            src = _tb.detectedLanguage.language;
                        }
                    } catch (err) {}
                }
                if (src && src.indexOf("zh") === 0) src = "zh";
                else if (src && src.indexOf("en") === 0) src = "en";
                else if (src !== "auto") src = "en";
                if (src === "auto" || !src) src = tgt === "zh" ? "en" : "zh";

                this.sourceLang = tgt;
                this.targetLang = src === tgt ? (tgt === "zh" ? "en" : "zh") : src;
                if (!this.sourceLang || this.sourceLang === "undefined") this.sourceLang = "en";
                if (!this.targetLang || this.targetLang === "undefined") this.targetLang = "zh";
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
