#!/usr/bin/env python3
"""Patch LibreTranslate app.js: swapLangs + guard translate requests."""
from __future__ import annotations

import re
import sys
from pathlib import Path

SWAP_FIXED = r"""swapLangs: function(e){
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

LANG_GUARD = r"""if (!self.targetLang || self.targetLang === "undefined") self.targetLang = "zh";
                    if (!self.sourceLang || self.sourceLang === "undefined") self.sourceLang = "auto";
                    if (self.sourceLang !== "auto") {
                        if (self.sourceLang.indexOf("zh") === 0) self.sourceLang = "zh";
                        else if (self.sourceLang.indexOf("en") === 0) self.sourceLang = "en";
                        else self.sourceLang = "en";
                    }
                    if (self.targetLang.indexOf("zh") === 0) self.targetLang = "zh";
                    else if (self.targetLang.indexOf("en") === 0) self.targetLang = "en";
                    else self.targetLang = "zh";
                    if (self.sourceLang !== "auto" && self.sourceLang === self.targetLang) {
                        self.targetLang = self.sourceLang === "zh" ? "en" : "zh";
                    }
                    """

SWAP_PATTERN = re.compile(r"swapLangs: function\(e\)\{[\s\S]*?\n            \},")
APPEND_PATTERN = re.compile(
    r"(var data = new FormData\(\);\s*\n\s*)data\.append\(\"q\", self\.inputText\);"
)


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: patch_libretranslate_app.py INPUT.js OUTPUT.js", file=sys.stderr)
        return 1

    text = Path(sys.argv[1]).read_text(encoding="utf-8")

    text, n_swap = SWAP_PATTERN.subn(SWAP_FIXED + ",", text, count=1)
    if n_swap != 1:
        print("ERROR: swapLangs block not found", file=sys.stderr)
        return 1

    text, n_guard = APPEND_PATTERN.subn(r"\1" + LANG_GUARD + r'data.append("q", self.inputText);', text, count=1)
    if n_guard != 1:
        print("ERROR: handleInput FormData block not found", file=sys.stderr)
        return 1

    Path(sys.argv[2]).write_text(text, encoding="utf-8")
    print(f"OK: patched {sys.argv[2]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
