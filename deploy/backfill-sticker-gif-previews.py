#!/usr/bin/env python3
"""
Backfill sticker animated grid previews (and optional full-GIF recompress).

Default: --preview-only (NEVER overwrite stored full GIFs — a bad recompress
previously destroyed colors with no backup).

  sudo /opt/toolbasecamp-api/venv/bin/python /opt/toolbasecamp-deploy/backfill-sticker-gif-previews.py
  sudo ... backfill-sticker-gif-previews.py --compress-full   # writes .gif.bak first
"""
from __future__ import annotations

import argparse
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
    STICKER_DIR,
    STICKER_MANIFEST,
    _is_gif_row,
    _prepare_sticker_bytes,
    _safe_sticker_path,
    _write_preview_gif,
    _write_thumbnail,
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--compress-full",
        action="store_true",
        help="Recompress full GIF in place (writes sibling .bak first). Default off.",
    )
    ap.add_argument(
        "--refresh-thumbs",
        action="store_true",
        help="Rewrite JPEG thumbs from current full file.",
    )
    args = ap.parse_args()
    preview_only = not args.compress_full

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
        is_gif = file_name.lower().endswith(".gif") or data[:4] == b"GIF8"
        is_anim = bool(is_gif and (_is_gif_row(row) or data[:4] == b"GIF8"))
        try:
            from stickers import _is_animated_gif_bytes

            is_anim = bool(is_gif and _is_animated_gif_bytes(data))
        except Exception:
            pass

        if is_gif:
            if args.compress_full:
                prepared, ctype, _ext = _prepare_sticker_bytes(data, ".gif")
                if prepared and len(prepared) < before:
                    bak = path.with_suffix(path.suffix + ".bak")
                    if not bak.is_file():
                        bak.write_bytes(data)
                    path.write_bytes(prepared)
                    data = prepared
                    row["contentType"] = ctype or "image/gif"
                    compressed += 1
                    changed += 1
                    print(f"  compress {sid}: {before} -> {len(prepared)} bytes (bak={bak.name})")

            if is_anim:
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
                    if row.get("previewFile"):
                        row["previewFile"] = ""
                        changed += 1
                    errors += 1
                    print(f"  preview FAIL {sid}")
            else:
                # Static GIF: no grid preview needed
                if row.get("previewFile"):
                    row["previewFile"] = ""
                    changed += 1
                print(f"  static skip preview {sid}")
        elif preview_only:
            pass

        if args.refresh_thumbs or args.compress_full:
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

    mode = "compress-full" if args.compress_full else "preview-only"
    print(
        f"done mode={mode} dir={STICKER_DIR} compressed={compressed} "
        f"previews={preview_ok} changed_rows={changed} skipped={skipped} errors={errors}"
    )
    return 0 if errors == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
