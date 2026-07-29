#!/usr/bin/env python3
"""Rewrite public/**/*.html CSS/JS ?v= cache busters without touching non-ASCII bytes."""
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
    # Keep version ASCII-only for safe byte substitution.
    if not re.fullmatch(r"[0-9a-zA-Z._-]+", ver):
        print(f"ERROR: unsafe VER={ver!r}", file=sys.stderr)
        return 2
    root = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("public")
    ver_b = ver.encode("ascii")
    css = re.compile(rb'(href="[^"]*\.css)(?:\?[^"]*)?"')
    js = re.compile(rb'(src="[^"]*\.js)(?:\?[^"]*)?"')
    n = 0
    for path in root.rglob("*.html"):
        raw = path.read_bytes()
        out = css.sub(rb"\1?v=" + ver_b + b'"', raw)
        out = js.sub(rb"\1?v=" + ver_b + b'"', out)
        if out != raw:
            path.write_bytes(out)
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
