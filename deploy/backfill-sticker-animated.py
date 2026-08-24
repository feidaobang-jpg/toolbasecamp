#!/usr/bin/env python3
"""Backfill manifest `animated` flags from actual GIF frame content."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for p in (ROOT / "server", Path("/opt/toolbasecamp-api"), ROOT):
    if (p / "stickers.py").is_file():
        sys.path.insert(0, str(p))
        break
else:
    sys.path.insert(0, str(ROOT / "server"))

from stickers import (  # noqa: E402
    STICKER_MANIFEST,
    _is_animated_gif_bytes,
    _is_gif_extension_row,
    _safe_sticker_path,
    _save_sticker_manifest,
)


def main() -> int:
    if not STICKER_MANIFEST.is_file():
        print(f"manifest missing: {STICKER_MANIFEST}")
        return 1
    raw = json.loads(STICKER_MANIFEST.read_text(encoding="utf-8"))
    items = raw.get("items") if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        print("invalid manifest")
        return 1

    changed = 0
    animated_n = 0
    static_gif_n = 0
    for row in items:
        if not _is_gif_extension_row(row):
            if row.get("animated"):
                row["animated"] = False
                changed += 1
            continue
        file_name = str(row.get("file") or "").strip()
        if not file_name:
            continue
        try:
            path = _safe_sticker_path(file_name)
            if not path.is_file():
                continue
            animated = _is_animated_gif_bytes(path.read_bytes())
        except Exception:
            continue
        if animated:
            animated_n += 1
        else:
            static_gif_n += 1
        if row.get("animated") != animated:
            row["animated"] = bool(animated)
            changed += 1

    if changed:
        _save_sticker_manifest(items)
    print(f"done: changed={changed} animated={animated_n} static_gif={static_gif_n} total={len(items)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
