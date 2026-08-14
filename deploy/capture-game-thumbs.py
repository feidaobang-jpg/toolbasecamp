#!/usr/bin/env python3
"""Capture game HTML screenshots for games hub thumbnails (UTF-8 safe)."""
from __future__ import annotations

import argparse
import http.server
import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:
    raise SystemExit("Pillow required: pip install Pillow") from exc

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
GAME_DIR = PUBLIC / "html" / "game"
OUT_DIR = PUBLIC / "assets" / "game" / "thumbs"
THUMB_W, THUMB_H = 512, 512
JPEG_QUALITY = 85
META_PATH = OUT_DIR / "meta.json"

EDGE_CANDIDATES = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    Path("/usr/bin/google-chrome"),
    Path("/usr/bin/chromium"),
    Path("/usr/bin/chromium-browser"),
]


def find_browser() -> Path:
    for p in EDGE_CANDIDATES:
        if p.is_file():
            return p
    raise SystemExit("No headless browser found (Edge/Chrome).")


def pick_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def start_server(port: int) -> subprocess.Popen:
    return subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=str(PUBLIC),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def wait_server(port: int, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.4):
                return
        except OSError:
            time.sleep(0.15)
    raise RuntimeError(f"HTTP server on {port} did not start")


def capture_png(browser: Path, url: str, dest: Path, budget_ms: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".png")
    if tmp.exists():
        tmp.unlink()
    cmd = [
        str(browser),
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--window-size=960,540",
        f"--virtual-time-budget={budget_ms}",
        f"--screenshot={tmp}",
        url,
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not tmp.is_file() or tmp.stat().st_size < 5000:
        raise RuntimeError(f"Screenshot too small or missing: {tmp}")


def to_thumb(src_png: Path, dest_jpg: Path) -> None:
    with Image.open(src_png) as im:
        im = im.convert("RGB")
        w, h = im.size
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        im = im.crop((left, top, left + side, top + side))
        im = im.resize((THUMB_W, THUMB_H), Image.Resampling.LANCZOS)
        dest_jpg.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest_jpg, "JPEG", quality=JPEG_QUALITY, optimize=True)
    src_png.unlink(missing_ok=True)


def game_slugs() -> list[str]:
    return sorted(p.stem for p in GAME_DIR.glob("*.html"))


def write_meta(mode: str, ok: int, fail: int) -> None:
    import json
    from datetime import datetime, timezone

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    prev = 1
    if META_PATH.is_file():
        try:
            prev = int(json.loads(META_PATH.read_text(encoding="utf-8")).get("v") or 1)
        except Exception:
            prev = 1
    payload = {
        "v": prev + 1 if ok else prev,
        "mode": mode,
        "captured": ok,
        "failed": fail,
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
    }
    META_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture game hub thumbnails")
    parser.add_argument(
        "--menu",
        action="store_true",
        help="capture main menu (default: in-game after hubThumb=1 auto-start)",
    )
    parser.add_argument("--budget", type=int, default=0, help="virtual-time-budget ms (0=auto)")
    parser.add_argument("--only", nargs="*", help="slug names without .html")
    args = parser.parse_args()

    mode = "menu" if args.menu else "play"
    budget = args.budget or (5000 if mode == "menu" else 10000)

    slugs = args.only if args.only else game_slugs()
    if not slugs:
        print("No game HTML files found.", file=sys.stderr)
        return 1

    browser = find_browser()
    port = pick_port()
    server = start_server(port)
    try:
        wait_server(port)
        base = f"http://127.0.0.1:{port}/html/game"
        ok, fail = 0, 0
        for slug in slugs:
            html = GAME_DIR / f"{slug}.html"
            if not html.is_file():
                print(f"skip missing {slug}")
                fail += 1
                continue
            url = f"{base}/{slug}.html"
            if mode == "play":
                url += "?thumb=1"
            out = OUT_DIR / f"{slug}.jpg"
            try:
                print(f"capture {slug} ({mode}) …")
                capture_png(browser, url, out, budget)
                to_thumb(out.with_suffix(".png"), out)
                print(f"  -> {out.relative_to(ROOT)} ({out.stat().st_size} bytes)")
                ok += 1
            except Exception as exc:
                print(f"  FAIL {slug}: {exc}", file=sys.stderr)
                fail += 1
        write_meta(mode, ok, fail)
        print(f"done: {ok} ok, {fail} failed ({mode})")
        return 0 if fail == 0 else 1
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    raise SystemExit(main())
