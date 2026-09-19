#!/usr/bin/env python3
"""Regenerate animated sticker previews only (clamp long frame delays)."""
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
    _safe_sticker_path,
    _save_sticker_manifest,
    _write_preview_gif,
)


def main() -> int:
    raw = json.loads(STICKER_MANIFEST.read_text(encoding="utf-8"))
    items = raw.get("items") if isinstance(raw, dict) else raw
    ok = 0
    cleared = 0
    for row in items:
        sid = str(row.get("id") or "").strip()
        file_name = str(row.get("file") or "").strip()
        if not sid or not file_name:
            continue
        try:
            path = _safe_sticker_path(file_name)
        except Exception:
            continue
        if not path.is_file():
            continue
        data = path.read_bytes()
        if not _is_animated_gif_bytes(data):
            if row.get("previewFile"):
                row["previewFile"] = ""
                cleared += 1
            continue
        name = _write_preview_gif(sid, data)
        if name:
            row["previewFile"] = name
            ok += 1
            print(f"ok {sid} {row.get('source')} -> {name}")
        else:
            row["previewFile"] = ""
            print(f"fail {sid}")
    _save_sticker_manifest(items)
    print(f"done previews={ok} cleared_static={cleared}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
