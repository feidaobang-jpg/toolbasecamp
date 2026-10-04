#!/usr/bin/env python3
"""Push pending sitemap URLs to Baidu ordinary inclusion API.

Behavior:
  - Reads sitemap, skips URLs already recorded in the state file.
  - Pushes until daily quota is exhausted (or no pending URLs).
  - When all current sitemap URLs are marked pushed → exit 0 (no API call).
  - New pages that appear in sitemap later are pushed on subsequent days.

Token from env (never commit):
  BAIDU_ZZ_SITE=https://www.zhengxiaohui.cn
  BAIDU_ZZ_TOKEN=...

Optional:
  BAIDU_SITEMAP=/var/www/toolbasecamp/sitemap.xml
  BAIDU_ZZ_STATE=/var/lib/toolbasecamp/baidu-pushed-urls.json
  BAIDU_ZZ_BATCH=10

On VPS (cron):
  set -a; source /etc/toolbasecamp-api.env; set +a
  /usr/bin/python3 /opt/toolbasecamp-deploy/baidu-push-urls.py
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SITEMAP = Path(os.environ.get("BAIDU_SITEMAP") or (ROOT / "public" / "sitemap.xml"))
SITE = (os.environ.get("BAIDU_ZZ_SITE") or "https://www.zhengxiaohui.cn").strip().rstrip("/")
TOKEN = (os.environ.get("BAIDU_ZZ_TOKEN") or "").strip()
BATCH = max(1, min(100, int(os.environ.get("BAIDU_ZZ_BATCH") or "10")))
LIMIT = max(0, int(os.environ.get("BAIDU_ZZ_LIMIT") or "0"))  # 0 = until quota/done
STATE_PATH = Path(
    os.environ.get("BAIDU_ZZ_STATE") or "/var/lib/toolbasecamp/baidu-pushed-urls.json"
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _canon_url(loc: str) -> str:
    u = (loc or "").strip()
    if not u:
        return ""
    u = re.sub(r"^https?://(www\.)?zhengxiaohui\.cn", SITE, u, flags=re.I)
    return u


def load_state(path: Path) -> dict:
    if not path.is_file():
        return {"pushed": {}, "updated_at": None}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"pushed": {}, "updated_at": None}
    pushed = data.get("pushed") or {}
    if not isinstance(pushed, dict):
        pushed = {str(u): "" for u in pushed} if isinstance(pushed, list) else {}
    return {"pushed": pushed, "updated_at": data.get("updated_at")}


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    state = dict(state)
    state["updated_at"] = _utc_now()
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def load_urls() -> list[str]:
    if not SITEMAP.is_file():
        alt = Path("/var/www/toolbasecamp/sitemap.xml")
        path = alt if alt.is_file() else SITEMAP
    else:
        path = SITEMAP
    if not path.is_file():
        raise SystemExit(f"sitemap not found: {path}")
    tree = ET.parse(path)
    root = tree.getroot()
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls: list[str] = []
    seen: set[str] = set()
    for loc in root.findall(".//sm:loc", ns):
        u = _canon_url(loc.text or "")
        if not u or u in seen:
            continue
        seen.add(u)
        urls.append(u)

    def rank(u: str) -> tuple:
        path = u.split("://", 1)[-1]
        if path.endswith("/index.html") or path.rstrip("/").endswith("zhengxiaohui.cn"):
            return (0, u)
        if any(x in path for x in ("/images.html", "/games.html", "/life.html", "/music.html")):
            return (1, u)
        if "/html/media/" in path:
            return (2, u)
        return (3, u)

    urls.sort(key=rank)
    return urls


def pending_urls(all_urls: list[str], pushed: dict) -> list[str]:
    pending = [u for u in all_urls if u not in pushed]
    if LIMIT:
        pending = pending[:LIMIT]
    return pending


def push_batch(batch: list[str]) -> dict:
    api = f"http://data.zz.baidu.com/urls?site={SITE}&token={TOKEN}"
    body = "\n".join(batch).encode("utf-8")
    req = urllib.request.Request(
        api,
        data=body,
        headers={"Content-Type": "text/plain"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        if exc.code == 400 and "over quota" in raw:
            return {"success": 0, "remain": 0, "error": "over quota", "raw": raw}
        print(f"HTTP {exc.code}: {raw}", file=sys.stderr)
        raise SystemExit(1) from exc
    return json.loads(raw)


def mark_pushed(state: dict, urls: list[str]) -> None:
    now = _utc_now()
    for u in urls:
        state["pushed"][u] = now


def run_status() -> int:
    state = load_state(STATE_PATH)
    urls = load_urls()
    pending = pending_urls(urls, state["pushed"])
    print(
        f"site={SITE} sitemap={len(urls)} pushed={len(state['pushed'])} "
        f"pending={len(pending)} state={STATE_PATH}"
    )
    if pending[:5]:
        print("next:")
        for u in pending[:5]:
            print(f"  {u}")
    return 0


def run_seed(n: int) -> int:
    """Mark top-N ranked sitemap URLs as already pushed (no API call)."""
    state = load_state(STATE_PATH)
    urls = load_urls()
    seed = urls[: max(0, n)]
    before = len(state["pushed"])
    mark_pushed(state, seed)
    save_state(STATE_PATH, state)
    print(f"seeded={len(seed)} pushed_total={len(state['pushed'])} (was {before})")
    return 0


def run_push(*, dry_run: bool) -> int:
    if not TOKEN and not dry_run:
        raise SystemExit("BAIDU_ZZ_TOKEN missing")
    state = load_state(STATE_PATH)
    urls = load_urls()
    pending = pending_urls(urls, state["pushed"])
    print(
        f"site={SITE} sitemap={len(urls)} pushed={len(state['pushed'])} "
        f"pending={len(pending)} batch={BATCH}"
    )
    if not pending:
        print("nothing pending — skip (will resume when sitemap gains new URLs)")
        return 0
    if dry_run:
        for u in pending[:BATCH]:
            print(f"  would push: {u}")
        if len(pending) > BATCH:
            print(f"  ... and {len(pending) - BATCH} more")
        return 0

    total_ok = 0
    batch_size = BATCH
    while pending:
        batch = pending[:batch_size]
        data = push_batch(batch)
        if data.get("error") == "over quota" and batch_size > 1:
            batch_size = max(1, batch_size // 2)
            print(f"over quota, shrink batch to {batch_size}")
            continue
        ok = int(data.get("success") or 0)
        remain = data.get("remain")
        # Baidu returns a count; assume accepted URLs are the prefix of the batch.
        if ok > 0:
            accepted = batch[:ok]
            mark_pushed(state, accepted)
            save_state(STATE_PATH, state)
            total_ok += ok
            pending = pending[ok:]
        print(
            f"batch: success={ok} remain={remain} "
            f"not_same={data.get('not_same_site')} not_valid={len(data.get('not_valid') or [])} "
            f"pending_left={len(pending)}"
        )
        if ok == 0 and data.get("error") == "over quota":
            print("quota exhausted, stop")
            break
        if remain is not None and int(remain) <= 0:
            print("quota exhausted, stop")
            break
        if ok == 0:
            print("no progress, stop")
            break
    left = len(pending_urls(urls, state["pushed"]))
    print(f"done pushed={total_ok} pending={left}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Baidu ordinary inclusion push (incremental)")
    parser.add_argument("--status", action="store_true", help="Show pending/pushed counts")
    parser.add_argument("--dry-run", action="store_true", help="List next batch without API call")
    parser.add_argument(
        "--seed-top",
        type=int,
        metavar="N",
        help="Mark top-N ranked URLs as already pushed (no API)",
    )
    args = parser.parse_args()
    if args.status:
        return run_status()
    if args.seed_top is not None:
        return run_seed(args.seed_top)
    return run_push(dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
