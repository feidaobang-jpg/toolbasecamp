#!/usr/bin/env python3
"""Generate missing public image thumbnails ({id}_thumb.jpg) from full files."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = Path(os.environ.get("TOOLBASECAMP_API_ROOT", str(ROOT / "server")))
if (API_ROOT / "image_tools.py").is_file():
    sys.path.insert(0, str(API_ROOT))
elif (ROOT / "server" / "image_tools.py").is_file():
    sys.path.insert(0, str(ROOT / "server"))
else:
    sys.path.insert(0, "/opt/toolbasecamp-api")

from image_tools import (  # noqa: E402
    PUBLIC_IMAGE_DIR,
    _public_thumb_path,
    _write_public_thumbnail,
)

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}


def main() -> int:
    print(f"public image dir: {PUBLIC_IMAGE_DIR}")
    if not PUBLIC_IMAGE_DIR.is_dir():
        print("directory missing", file=sys.stderr)
        return 1

    created = 0
    skipped = 0
    failed = 0

    for full_path in sorted(PUBLIC_IMAGE_DIR.iterdir()):
        if not full_path.is_file():
            continue
        if full_path.name.endswith("_thumb.jpg"):
            continue
        if full_path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        iid = full_path.stem
        if len(iid) < 16 or not iid.isalnum():
            continue
        thumb_path = _public_thumb_path(iid)
        if thumb_path.is_file():
            skipped += 1
            continue
        if _write_public_thumbnail(iid, full_path.read_bytes()):
            created += 1
            print(f"created: {thumb_path.name} ({thumb_path.stat().st_size} bytes)")
        else:
            failed += 1
            print(f"failed: {iid}")

    print(f"done: created={created} skipped={skipped} failed={failed}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
