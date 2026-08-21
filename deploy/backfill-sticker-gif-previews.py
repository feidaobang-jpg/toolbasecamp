#!/usr/bin/env python3
"""
Backfill sticker GIF compression + animated grid previews.

- Shrink stored GIF originals (max edge 360, adaptive palette)
- Write {id}_preview.gif for grid playback
- Refresh JPEG thumbs
- Update manifest.json previewFile

Run on VPS:
  sudo python3 ~/backfill-sticker-gif-previews.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))

from stickers import (  # noqa: E402
    STICKER_DIR,
    STICKER_MANIFEST,
    _is_gif_row,
    _prepare_sticker_bytes,
    _safe_sticker_path,
    _write_preview_gif,
    _write_thumbnail,
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
    preview_ok = 0
    compressed = 0
    skipped = 0
    errors = 0

    for row in items:
        sid = str(row.get("id") or "").strip()
        file_name = str(row.get("file") or "").strip()
        if not sid or not file_name:
            skipped += 1
            continue
        try:
            path = _safe_sticker_path(file_name)
        except Exception:
            skipped += 1
            continue
        if not path.is_file():
            skipped += 1
            continue

        data = path.read_bytes()
        before = len(data)
        is_gif = _is_gif_row(row) or file_name.lower().endswith(".gif") or data[:4] == b"GIF8"

        if is_gif:
            prepared, ctype, ext = _prepare_sticker_bytes(data, ".gif")
            if prepared and len(prepared) < before:
                # Keep same filename when still .gif
                if ext == ".gif" or file_name.lower().endswith(".gif"):
                    path.write_bytes(prepared)
                    data = prepared
                    row["contentType"] = ctype or "image/gif"
                    compressed += 1
                    changed += 1
                    print(f"  compress {sid}: {before} -> {len(prepared)} bytes")
                else:
                    # rare: format changed — keep original file name bytes only if gif
                    path.write_bytes(prepared)
                    data = prepared
                    row["contentType"] = "image/gif"
                    compressed += 1
                    changed += 1

            preview_name = _write_preview_gif(sid, data)
            if preview_name:
                if row.get("previewFile") != preview_name:
                    row["previewFile"] = preview_name
                    changed += 1
                preview_ok += 1
                ppath = STICKER_DIR / preview_name
                psz = ppath.stat().st_size if ppath.is_file() else 0
                print(f"  preview {sid}: {psz} bytes")
            else:
                errors += 1
                print(f"  preview FAIL {sid}")
        else:
            # Still image: refresh thumb only
            pass

        thumb = _write_thumbnail(sid, data)
        if thumb and row.get("thumbFile") != thumb:
            row["thumbFile"] = thumb
            changed += 1

    if changed:
        if isinstance(raw, dict):
            raw["items"] = items
            payload = raw
        else:
            payload = {"version": 1, "items": items}
        STICKER_MANIFEST.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    print(
        f"done dir={STICKER_DIR} compressed={compressed} "
        f"previews={preview_ok} changed_rows={changed} skipped={skipped} errors={errors}"
    )
    return 0 if errors == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
