#!/usr/bin/env python3
"""Patch stored animated GIFs to NETSCAPE loop=0 (infinite)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for p in (ROOT / "server", Path("/opt/toolbasecamp-api"), ROOT):
    if (p / "stickers.py").is_file():
        sys.path.insert(0, str(p))
        break

from stickers import (  # noqa: E402
    STICKER_MANIFEST,
    _is_animated_gif_bytes,
    _normalize_gif_loop_infinite,
    _safe_sticker_path,
)


def main() -> int:
    raw = json.loads(STICKER_MANIFEST.read_text(encoding="utf-8"))
    items = raw.get("items") if isinstance(raw, dict) else raw
    changed = 0
    for row in items:
        file_name = str(row.get("file") or "").strip()
        if not file_name.lower().endswith(".gif"):
            continue
        try:
            path = _safe_sticker_path(file_name)
        except Exception:
            continue
        if not path.is_file():
            continue
        data = path.read_bytes()
        if not _is_animated_gif_bytes(data):
            continue
        fixed = _normalize_gif_loop_infinite(data)
        if fixed != data:
            path.write_bytes(fixed)
            changed += 1
            print("loop->inf", row.get("id"), row.get("source"))
    print(f"done changed={changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
