#!/usr/bin/env python3
"""Rewrite public/**/*.html CSS/JS ?v= cache busters without corrupting UTF-8."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path


def main() -> int:
    ver = (os.environ.get("VER") or (sys.argv[1] if len(sys.argv) > 1 else "")).strip()
    if not ver:
        print("usage: VER=abc1234 bust-html-cache.py", file=sys.stderr)
        return 2
    root = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("public")
    css = re.compile(r'(href="[^"]*\.css)(?:\?[^"]*)?"')
    js = re.compile(r'(src="[^"]*\.js)(?:\?[^"]*)?"')
    n = 0
    for path in root.rglob("*.html"):
        text = path.read_text(encoding="utf-8")
        text2 = css.sub(rf'\1?v={ver}"', text)
        text2 = js.sub(rf'\1?v={ver}"', text2)
        if text2 != text:
            path.write_text(text2, encoding="utf-8", newline="\n")
            n += 1
    sample = root / "html" / "ladder" / "cpu_rank.html"
    if sample.is_file():
        raw = sample.read_bytes()
        if b"</title>" not in raw:
            print("ERROR: cpu_rank.html missing </title>", file=sys.stderr)
            return 1
        if "\u684c\u9762".encode("utf-8") not in raw:
            print("ERROR: cpu_rank.html lost UTF-8 Chinese", file=sys.stderr)
            return 1
    print(f"cache-bust ok ver={ver} files={n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
