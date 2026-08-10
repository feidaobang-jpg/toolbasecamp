#!/usr/bin/env python3
"""Upload 3 sample tracks — shorthand for upload-traditional-music.py --limit 3 --upload."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
UPLOAD = REPO / "deploy" / "upload-traditional-music.py"


def main() -> int:
    cmd = [sys.executable, str(UPLOAD), "--limit", "3", "--upload", *sys.argv[1:]]
    return subprocess.call(cmd)


if __name__ == "__main__":
    raise SystemExit(main())
