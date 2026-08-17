#!/usr/bin/env python3
"""Generate missing public image thumbnails ({id}_thumb.jpg) from full files."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))

from image_tools import (  # noqa: E402
    PUBLIC_IMAGE_DIR,
    _ensure_public_images_schema,
    _public_image_path,
    _public_thumb_path,
    _write_public_thumbnail,
    _conn,
)


def main() -> int:
    print(f"public image dir: {PUBLIC_IMAGE_DIR}")
    if not PUBLIC_IMAGE_DIR.is_dir():
        print("directory missing", file=sys.stderr)
        return 1

    created = 0
    skipped = 0
    missing = 0

    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_public_images_schema(cur)
            cur.execute(
                """
                SELECT id, file_name
                FROM public_images
                WHERE is_public=1
                ORDER BY created_at DESC
                """
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()

    for row in rows:
        iid = str(row.get("id") or "")
        file_name = str(row.get("file_name") or "")
        if not iid or not file_name:
            continue
        try:
            full_path = _public_image_path(file_name)
        except Exception:
            missing += 1
            print(f"skip invalid name: {iid}")
            continue
        if not full_path.is_file():
            missing += 1
            print(f"missing full file: {iid} ({file_name})")
            continue
        thumb_path = _public_thumb_path(iid)
        if thumb_path.is_file():
            skipped += 1
            continue
        if _write_public_thumbnail(iid, full_path.read_bytes()):
            created += 1
            print(f"created: {thumb_path.name} ({thumb_path.stat().st_size} bytes)")
        else:
            missing += 1
            print(f"failed: {iid}")

    print(f"done: created={created} skipped={skipped} missing/failed={missing}")
    return 0 if missing == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
