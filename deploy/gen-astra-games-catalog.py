# -*- coding: utf-8 -*-
"""Parse awesome-gpt-6-astra README.zh-CN into public/js/astra-games-catalog.js

Usage:
  python deploy/gen-astra-games-catalog.py
  python deploy/gen-astra-games-catalog.py --bump-html
  python deploy/gen-astra-games-catalog.py --check   # exit 1 if would change
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "js" / "astra-games-catalog.js"
GAMES_HTML = ROOT / "public" / "games.html"
README_URL = (
    "https://raw.githubusercontent.com/MartinDelophy/awesome-gpt-6-astra/main/README.zh-CN.md"
)
RAW = "https://raw.githubusercontent.com/MartinDelophy/awesome-gpt-6-astra/main/"
# Ordered known sections → locale titleKey
CATS = [
    ("动作与街机", "astraAction"),
    ("解谜与益智", "astraPuzzle"),
    ("策略与模拟", "astraStrategy"),
    ("RPG 与冒险", "astraRpg"),
    ("平台跳跃与竞速", "astraPlatform"),
    ("实验玩法与多人游戏", "astraExperimental"),
]
CAT_KEYS = {zh: key for zh, key in CATS}


def fetch_readme() -> str:
    req = urllib.request.Request(
        README_URL,
        headers={"User-Agent": "toolbasecamp-astra-sync/1.0"},
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read().decode("utf-8")


def parse_sections(text: str) -> dict[str, list[dict]]:
    sections: dict[str, list[dict]] = {}
    cur: str | None = None
    for line in text.splitlines():
        m = re.match(r"^### (.+)$", line.strip())
        if m:
            cur = m.group(1).strip()
            sections[cur] = []
            continue
        if cur is None:
            continue
        gm = re.match(r"^- \*\*\[(.+?)\]\((https?://[^)]+)\)\*\*", line)
        if gm:
            sections[cur].append(
                {
                    "title": gm.group(1).strip(),
                    "url": gm.group(2).strip(),
                    "thumb": "",
                }
            )
            continue
        if not sections.get(cur):
            continue
        if ("预览" in line or line.lstrip().startswith("- 截图")) and not sections[cur][-1][
            "thumb"
        ]:
            im = re.search(r"!\[.*?\]\(([^)]+)\)", line)
            if im:
                src = im.group(1).strip()
                sections[cur][-1]["thumb"] = (
                    src if src.startswith("http") else RAW + src.lstrip("./")
                )
    return sections


def build_js(sections: dict[str, list[dict]], generated_at: str) -> tuple[str, int]:
    lines = [
        "/** Auto-parsed from awesome-gpt-6-astra README.zh-CN (external play links). */",
        f"/** generated_at: {generated_at} */",
        "(function (global) {",
        "  var groups = [",
    ]
    total = 0
    seen = set()

    def emit_group(title_key: str | None, title: str | None, items: list[dict]) -> None:
        nonlocal total
        if not items:
            return
        total += len(items)
        if title_key:
            lines.append(f"    {{ titleKey: 'games.groups.{title_key}', items: [")
        else:
            t = json.dumps(title or "Astra", ensure_ascii=False)
            lines.append(f"    {{ title: {t}, items: [")
        for it in items:
            title_s = json.dumps(it["title"], ensure_ascii=False)
            play = json.dumps(it["url"], ensure_ascii=False)
            thumb = json.dumps(it["thumb"], ensure_ascii=False)
            lines.append(
                f"      {{ title: {title_s}, url: {play}, thumb: {thumb}, external: true }},"
            )
        lines.append("    ] },")

    for zh, key in CATS:
        seen.add(zh)
        emit_group(key, None, sections.get(zh, []))

    for zh, items in sections.items():
        if zh in seen or not items:
            continue
        print(f"WARN unknown section (kept as titled group): {zh} ({len(items)})", file=sys.stderr)
        emit_group(None, f"Astra · {zh}", items)

    lines += [
        "  ];",
        "  global.astraGamesCatalog = {",
        "    source: 'https://github.com/MartinDelophy/awesome-gpt-6-astra',",
        "    gallery: 'https://astragames.aigccreative.com/',",
        f"    generatedAt: {json.dumps(generated_at)},",
        f"    count: {total},",
        "    groups: groups",
        "  };",
        "})(typeof window !== 'undefined' ? window : globalThis);",
        "",
    ]
    return "\n".join(lines), total


def content_fingerprint(js: str) -> str:
    """Ignore generated_at line so daily re-runs without game changes stay quiet."""
    filtered = "\n".join(
        ln
        for ln in js.splitlines()
        if not ln.startswith("/** generated_at:")
        and "generatedAt:" not in ln
    )
    return hashlib.sha1(filtered.encode("utf-8")).hexdigest()[:10]


def bump_games_html(ver: str) -> bool:
    if not GAMES_HTML.is_file():
        print("WARN games.html missing, skip bump", file=sys.stderr)
        return False
    text = GAMES_HTML.read_text(encoding="utf-8")
    new_text, n = re.subn(
        r"(astra-games-catalog\.js\?v=)[^\s\"']+",
        rf"\g<1>{ver}",
        text,
        count=1,
    )
    if n == 0:
        print("WARN could not find astra-games-catalog.js?v= in games.html", file=sys.stderr)
        return False
    if new_text == text:
        return False
    GAMES_HTML.write_text(new_text, encoding="utf-8")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--bump-html",
        action="store_true",
        help="Bump public/games.html cache param when catalog changes",
    )
    ap.add_argument(
        "--check",
        action="store_true",
        help="Exit 1 if catalog would change; do not write",
    )
    ap.add_argument(
        "--force-timestamp",
        action="store_true",
        help="Rewrite even if game list unchanged (updates generated_at)",
    )
    args = ap.parse_args()

    text = fetch_readme()
    sections = parse_sections(text)
    missing = []
    for items in sections.values():
        for it in items:
            if not it["thumb"]:
                missing.append(it["title"])
    if missing:
        print(f"WARN missing thumbs ({len(missing)}): {missing[:8]}...", file=sys.stderr)

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    js, total = build_js(sections, generated_at)
    new_fp = content_fingerprint(js)

    old = OUT.read_text(encoding="utf-8") if OUT.is_file() else ""
    old_fp = content_fingerprint(old) if old else ""
    changed = new_fp != old_fp

    if args.check:
        if changed:
            print(f"CHANGED would write {total} games (fp {old_fp} -> {new_fp})")
            return 1
        print(f"UNCHANGED {total} games (fp {new_fp})")
        return 0

    if not changed and not args.force_timestamp:
        print(f"UNCHANGED {total} games (fp {new_fp})")
        print("changed=0")
        return 0

    OUT.write_text(js, encoding="utf-8")
    bumped = False
    if args.bump_html:
        bumped = bump_games_html(new_fp)
    print(f"wrote {OUT} ({total} games, fp {new_fp}, bump_html={bumped})")
    print("changed=1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
