#!/usr/bin/env python3
"""Push sitemap URLs to Baidu ordinary inclusion API.

Token from env (never commit):
  BAIDU_ZZ_SITE=https://www.zhengxiaohui.cn
  BAIDU_ZZ_TOKEN=...

On VPS:
  set -a; source /etc/toolbasecamp-api.env; set +a
  /opt/toolbasecamp-api/venv/bin/python /path/to/baidu-push-urls.py
"""
from __future__ import annotations

import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SITEMAP = Path(os.environ.get("BAIDU_SITEMAP") or (ROOT / "public" / "sitemap.xml"))
# Prefer verified site host from env.
SITE = (os.environ.get("BAIDU_ZZ_SITE") or "https://www.zhengxiaohui.cn").strip().rstrip("/")
TOKEN = (os.environ.get("BAIDU_ZZ_TOKEN") or "").strip()
BATCH = max(1, min(100, int(os.environ.get("BAIDU_ZZ_BATCH") or "50")))
LIMIT = max(0, int(os.environ.get("BAIDU_ZZ_LIMIT") or "0"))  # 0 = all (capped by remain)


def _canon_url(loc: str) -> str:
    u = (loc or "").strip()
    if not u:
        return ""
    # Match verified site host (www vs apex).
    u = re.sub(r"^https?://(www\.)?zhengxiaohui\.cn", SITE, u, flags=re.I)
    return u


def load_urls() -> list[str]:
    if not SITEMAP.is_file():
        # On VPS static site
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
    # Prefer hub pages first
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
    if LIMIT:
        urls = urls[:LIMIT]
    return urls


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
        # Batch larger than remain → 400 over quota; caller may shrink.
        if exc.code == 400 and "over quota" in raw:
            return {"success": 0, "remain": 0, "error": "over quota", "raw": raw}
        print(f"HTTP {exc.code}: {raw}", file=sys.stderr)
        raise SystemExit(1) from exc
    import json

    return json.loads(raw)


def main() -> int:
    if not TOKEN:
        raise SystemExit("BAIDU_ZZ_TOKEN missing")
    urls = load_urls()
    if not urls:
        raise SystemExit("no urls")
    print(f"site={SITE} urls={len(urls)} batch={BATCH}")
    total_ok = 0
    i = 0
    batch_size = BATCH
    while i < len(urls):
        batch = urls[i : i + batch_size]
        data = push_batch(batch)
        if data.get("error") == "over quota" and batch_size > 1:
            batch_size = max(1, batch_size // 2)
            print(f"over quota, shrink batch to {batch_size}")
            continue
        ok = int(data.get("success") or 0)
        remain = data.get("remain")
        total_ok += ok
        print(
            f"batch: success={ok} remain={remain} "
            f"not_same={data.get('not_same_site')} not_valid={len(data.get('not_valid') or [])}"
        )
        i += len(batch)
        if remain is not None and int(remain) <= 0:
            print("quota exhausted, stop")
            break
        if ok == 0 and data.get("error") == "over quota":
            print("quota exhausted, stop")
            break
    print(f"done pushed={total_ok}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
