"""Scrape all Notebookcheck lists into server/data/nbcheck and public/data/nbcheck."""

from __future__ import annotations

import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "server"))

os.environ.setdefault("TOOLBASECAMP_WEB_ROOT", os.path.join(ROOT, "public"))

from nbcheck import KNOWN_IDS, refresh_list  # noqa: E402


def main() -> int:
    ids = sys.argv[1:] or list(KNOWN_IDS)
    failed = 0
    for lid in ids:
        try:
            out = refresh_list(lid)
            print(
                f"OK {lid}: kept={out.get('kept')} count={out.get('count')} "
                f"path={out.get('path')} public={out.get('public_path')}"
            )
        except Exception as exc:
            failed += 1
            print(f"FAIL {lid}: {exc}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
