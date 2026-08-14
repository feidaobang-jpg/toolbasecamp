#!/usr/bin/env python3
"""Insert thumb-preview.js into game HTML files (UTF-8 safe)."""
from pathlib import Path

TAG = '<script src="../../js/game/thumb-preview.js"></script>'
ROOT = Path(__file__).resolve().parents[1]
GAME_DIR = ROOT / "public" / "html" / "game"
SKIP = {"tank_battle.html"}

for f in sorted(GAME_DIR.glob("*.html")):
    if f.name in SKIP:
        continue
    text = f.read_text(encoding="utf-8")
    if "thumb-preview.js" in text:
        print("skip", f.name)
        continue
    if "</body>" not in text:
        print("no body", f.name)
        continue
    f.write_text(text.replace("</body>", TAG + "\n</body>", 1), encoding="utf-8")
    print("patched", f.name)
