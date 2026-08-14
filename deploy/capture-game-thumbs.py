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
    if not tmp.is_file() or tmp.stat().st_size < 3500:
        raise RuntimeError(f"Screenshot too small or missing: {tmp}")


def content_bbox(im: Image.Image, threshold: int = 22) -> tuple[int, int, int, int]:
    """Trim letterbox/pillarbox before square crop."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    min_x, min_y = w, h
    max_x, max_y = 0, 0
    found = False
    thr = threshold * 3
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r + g + b > thr:
                found = True
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    if not found:
        return 0, 0, w, h
    pad = 6
    return (
        max(0, min_x - pad),
        max(0, min_y - pad),
        min(w, max_x + 1 + pad),
        min(h, max_y + 1 + pad),
    )


def trim_dark_edges(im: Image.Image, threshold: int = 20) -> Image.Image:
    """Remove letterbox/pillarbox bands so square thumbs fill the frame."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    thr = threshold * 3

    def row_avg(y: int) -> float:
        return sum(px[x, y][0] + px[x, y][1] + px[x, y][2] for x in range(w)) / w

    def col_avg(x: int) -> float:
        return sum(px[x, y][0] + px[x, y][1] + px[x, y][2] for y in range(h)) / h

    top, bottom, left, right = 0, h, 0, w
    while top < bottom - 8 and row_avg(top) < thr:
        top += 1
    while bottom > top + 8 and row_avg(bottom - 1) < thr:
        bottom -= 1
    while left < right - 8 and col_avg(left) < thr:
        left += 1
    while right > left + 8 and col_avg(right - 1) < thr:
        right -= 1
    if bottom <= top + 8 or right <= left + 8:
        return im
    return rgb.crop((left, top, right, bottom))


def crop_dense_core(im: Image.Image, min_density: float = 0.10, threshold: int = 20) -> Image.Image:
    """Keep rows/cols with gameplay signal; variance helps portrait starfields."""
    import statistics

    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    thr = threshold * 3

    col_vals = [[px[x, y][0] + px[x, y][1] + px[x, y][2] for y in range(h)] for x in range(w)]
    row_vals = [[px[x, y][0] + px[x, y][1] + px[x, y][2] for x in range(w)] for y in range(h)]

    col_density = [sum(1 for v in col if v > thr) / h for col in col_vals]
    row_density = [sum(1 for v in row if v > thr) / w for row in row_vals]
    col_var = [statistics.pstdev(col) if len(col) > 1 else 0.0 for col in col_vals]
    row_var = [statistics.pstdev(row) if len(row) > 1 else 0.0 for row in row_vals]

    max_col_var = max(col_var) if col_var else 0.0
    max_row_var = max(row_var) if row_var else 0.0

    if max_col_var > 12:
        var_thr = max_col_var * 0.32
        active_x = [i for i, v in enumerate(col_var) if v >= var_thr]
    else:
        active_x = [i for i, d in enumerate(col_density) if d >= min_density]

    if max_row_var > 12:
        var_thr = max_row_var * 0.32
        active_y = [i for i, v in enumerate(row_var) if v >= var_thr]
    else:
        active_y = [i for i, d in enumerate(row_density) if d >= min_density]

    if not active_x or not active_y:
        return im
    left, right = active_x[0], active_x[-1]
    top, bottom = active_y[0], active_y[-1]
    pad = 4
    return rgb.crop((
        max(0, left - pad),
        max(0, top - pad),
        min(w, right + 1 + pad),
        min(h, bottom + 1 + pad),
    ))


DOM_BOARD_SLUGS = frozenset({"gomoku", "puzzle", "klotski"})


def square_crop(im: Image.Image, slug: str | None = None) -> Image.Image:
    box = content_bbox(im)
    im = im.crop(box)
    im = trim_dark_edges(im)
    im = crop_dense_core(im)
    w, h = im.size
    if slug in DOM_BOARD_SLUGS and h > int(w * 1.08):
        top = int(h * 0.18)
        im = im.crop((0, top, w, h))
        im = trim_dark_edges(im)
        im = crop_dense_core(im)
        w, h = im.size
    side = min(w, h)
    left = max(0, (w - side) // 2)
    top = max(0, (h - side) // 2)
    im = im.crop((left, top, left + side, top + side))
    return im


def to_thumb(src_png: Path, dest_jpg: Path, slug: str | None = None) -> None:
    with Image.open(src_png) as im:
        im = im.convert("RGB")
        im = square_crop(im, slug)
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
    budget = args.budget or (5000 if mode == "menu" else 14000)

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
                to_thumb(out.with_suffix(".png"), out, slug)
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
