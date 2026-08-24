#!/usr/bin/env python3
"""OCR generic sticker titles (e.g. "(47).gif") from image text.

On VPS:
  set -a; source /etc/toolbasecamp-api.env; set +a
  sudo -E /opt/toolbasecamp-api/venv/bin/python deploy/backfill-sticker-titles-ocr.py
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

from stickers import (  # noqa: E402
    STICKER_MANIFEST,
    _is_generic_sticker_title,
    _ocr_sticker_title,
    _safe_sticker_path,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill sticker titles via OCR")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without saving")
    parser.add_argument("--limit", type=int, default=0, help="Max items to process (0 = all)")
    args = parser.parse_args()

    raw = json.loads(STICKER_MANIFEST.read_text(encoding="utf-8"))
    items = raw.get("items") if isinstance(raw, dict) else raw
    changed = 0
    processed = 0
    for row in items:
        title = str(row.get("title") or "").strip()
        if not _is_generic_sticker_title(title):
            continue
        file_name = str(row.get("file") or "").strip()
        if not file_name:
            continue
        try:
            path = _safe_sticker_path(file_name)
        except Exception:
            continue
        if not path.is_file():
            continue
        processed += 1
        if args.limit and processed > args.limit:
            break
        data = path.read_bytes()
        ocr_title = _ocr_sticker_title(data)
        if not ocr_title or ocr_title == title:
            print("skip", row.get("id"), row.get("source"), "->", repr(ocr_title))
            continue
        print("rename", row.get("id"), repr(title), "->", repr(ocr_title))
        if not args.dry_run:
            row["title"] = ocr_title
            changed += 1

    if not args.dry_run and changed:
        if isinstance(raw, dict):
            raw["items"] = items
            STICKER_MANIFEST.write_text(
                json.dumps(raw, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        else:
            STICKER_MANIFEST.write_text(
                json.dumps(items, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
    print(f"done processed={processed} changed={changed} dry_run={args.dry_run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
