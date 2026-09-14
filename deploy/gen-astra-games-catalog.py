# -*- coding: utf-8 -*-
"""Parse awesome-gpt-6-astra README.zh-CN into public/js/astra-games-catalog.js"""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "js" / "astra-games-catalog.js"
README_URL = (
    "https://raw.githubusercontent.com/MartinDelophy/awesome-gpt-6-astra/main/README.zh-CN.md"
)
RAW = "https://raw.githubusercontent.com/MartinDelophy/awesome-gpt-6-astra/main/"
CATS = [
    ("动作与街机", "astraAction"),
    ("解谜与益智", "astraPuzzle"),
    ("策略与模拟", "astraStrategy"),
    ("RPG 与冒险", "astraRpg"),
    ("平台跳跃与竞速", "astraPlatform"),
    ("实验玩法与多人游戏", "astraExperimental"),
]


def main() -> None:
    text = urllib.request.urlopen(README_URL, timeout=60).read().decode("utf-8")
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

    missing = []
    for zh, _key in CATS:
        for it in sections.get(zh, []):
            if not it["thumb"]:
                missing.append(it["title"])
    if missing:
        print("WARN missing thumbs:", missing)

    lines = [
        "/** Auto-parsed from awesome-gpt-6-astra README.zh-CN (external play links). */",
        "(function (global) {",
        "  var groups = [",
    ]
    total = 0
    for zh, key in CATS:
        items = sections.get(zh, [])
        total += len(items)
        lines.append(f"    {{ titleKey: 'games.groups.{key}', items: [")
        for it in items:
            title = json.dumps(it["title"], ensure_ascii=False)
            play = json.dumps(it["url"], ensure_ascii=False)
            thumb = json.dumps(it["thumb"], ensure_ascii=False)
            lines.append(
                f"      {{ title: {title}, url: {play}, thumb: {thumb}, external: true }},"
            )
        lines.append("    ] },")
    lines += [
        "  ];",
        "  global.astraGamesCatalog = {",
        "    source: 'https://github.com/MartinDelophy/awesome-gpt-6-astra',",
        "    gallery: 'https://astragames.aigccreative.com/',",
        "    groups: groups",
        "  };",
        "})(typeof window !== 'undefined' ? window : globalThis);",
        "",
    ]
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {OUT} ({total} games, {OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
