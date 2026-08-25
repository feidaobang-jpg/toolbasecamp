#!/usr/bin/env python3
"""Push sitemap URLs to Baidu ordinary inclusion API.

Requires env (never commit the token):
  BAIDU_ZZ_SITE=https://www.zhengxiaohui.cn
  BAIDU_ZZ_TOKEN=...

Usage:
  BAIDU_ZZ_TOKEN=xxx python deploy/baidu-push-sitemap.py
  BAIDU_ZZ_TOKEN=xxx python deploy/baidu-push-sitemap.py --limit 10
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITEMAP_CANDIDATES = [
    ROOT / "public" / "sitemap.xml",
    Path("/var/www/toolbasecamp/sitemap.xml"),
    Path("/var/www/html/sitemap.xml"),
]
DEFAULT_SITE = "https://www.zhengxiaohui.cn"


def find_sitemap() -> Path:
    for p in SITEMAP_CANDIDATES:
        if p.is_file():
            return p
    raise FileNotFoundError("sitemap.xml not found in " + ", ".join(str(p) for p in SITEMAP_CANDIDATES))


def load_urls(site: str) -> list[str]:
    text = find_sitemap().read_text(encoding="utf-8")
    locs = re.findall(r"<loc>(.*?)</loc>", text)
    out: list[str] = []
    seen: set[str] = set()
    host = re.sub(r"^https?://", "", site.rstrip("/"))
    for raw in locs:
        u = raw.strip()
        if "zhengxiaohui.cn" not in u:
            continue
        u = re.sub(r"^https?://(www\.)?zhengxiaohui\.cn", f"https://{host}", u)
        if u not in seen:
            seen.add(u)
            out.append(u)
    # Home / hubs first
    def rank(u: str) -> tuple:
        for i, key in enumerate(
            (
                "/index.html",
                "/images.html",
                "/games.html",
                "/life.html",
                "/music.html",
                "/about.html",
            )
        ):
            if key in u:
                return (0, i, u)
        return (1, 0, u)

    return sorted(out, key=rank)


def push(site: str, token: str, urls: list[str]) -> dict:
    api = f"http://data.zz.baidu.com/urls?site={site}&token={token}"
    body = "\n".join(urls).encode("utf-8")
    req = urllib.request.Request(
        api,
        data=body,
        headers={"Content-Type": "text/plain"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        print(raw, file=sys.stderr)
        raise SystemExit(e.code) from e
    print(raw)
    return {}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=20, help="Max URLs this run")
    parser.add_argument("--offset", type=int, default=0)
    args = parser.parse_args()
    site = (os.environ.get("BAIDU_ZZ_SITE") or DEFAULT_SITE).strip()
    token = (os.environ.get("BAIDU_ZZ_TOKEN") or "").strip()
    if not token:
        print("BAIDU_ZZ_TOKEN missing", file=sys.stderr)
        return 2
    urls = load_urls(site)
    batch = urls[args.offset : args.offset + max(1, args.limit)]
    if not batch:
        print("no urls")
        return 0
    print(f"pushing {len(batch)} / {len(urls)} site={site}")
    push(site, token, batch)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
