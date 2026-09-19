#!/usr/bin/env python3
"""Re-apply GIF loop + min/max frame delay clamps on stored stickers.

On VPS:
  set -a; source /etc/toolbasecamp-api.env; set +a
  sudo -E /opt/toolbasecamp-api/venv/bin/python deploy/fix-sticker-gif-frame-delays.py
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
    _finalize_gif_bytes,
    _is_animated_gif_bytes,
    _safe_sticker_path,
    _write_preview_gif,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Fix GIF frame delays (esp. delay=0)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    raw = json.loads(STICKER_MANIFEST.read_text(encoding="utf-8"))
    items = raw.get("items") if isinstance(raw, dict) else raw
    changed = 0
    preview_n = 0
    processed = 0
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
        processed += 1
        if args.limit and processed > args.limit:
            break
        fixed = _finalize_gif_bytes(data)
        if fixed == data:
            continue
        print("fix", row.get("id"), file_name, len(data), "->", len(fixed))
        if args.dry_run:
            changed += 1
            continue
        path.write_bytes(fixed)
        changed += 1
        try:
            prev = _write_preview_gif(str(row.get("id") or ""), fixed)
            if prev:
                row["previewFile"] = prev
                preview_n += 1
        except Exception as exc:
            print("preview fail", row.get("id"), exc)

    if not args.dry_run and preview_n and isinstance(raw, dict):
        raw["items"] = items
        STICKER_MANIFEST.write_text(
            json.dumps(raw, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    print(f"done processed={processed} changed={changed} preview={preview_n} dry_run={args.dry_run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
