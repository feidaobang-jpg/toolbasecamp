#!/usr/bin/env python3
"""Backfill missing traditional-music artists via DeepSeek. Run on VPS:

  cd /opt/toolbasecamp-api && sudo -u ubuntu bash -c 'set -a; source /etc/toolbasecamp-api.env; set +a; ./venv/bin/python deploy/backfill-traditional-artists.py'
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Flat deploy layout on VPS: /opt/toolbasecamp-api/*.py
for candidate in (ROOT / "server", ROOT, Path("/opt/toolbasecamp-api")):
    if (candidate / "recipe_ai.py").is_file():
        sys.path.insert(0, str(candidate))
        break
else:
    sys.path.insert(0, str(ROOT / "server"))

MANIFEST = Path(
    os.environ.get("TRADITIONAL_MUSIC_DIR") or "/var/lib/toolbasecamp/traditional-music"
) / "manifest.json"


async def main() -> None:
    from recipe_ai import DEEPSEEK_API_KEY, _call_deepseek

    if not DEEPSEEK_API_KEY:
        raise SystemExit("DEEPSEEK_API_KEY missing")
    if not MANIFEST.is_file():
        raise SystemExit(f"manifest missing: {MANIFEST}")

    raw = json.loads(MANIFEST.read_text(encoding="utf-8"))
    items = raw.get("items", raw) if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        raise SystemExit("bad manifest")

    updated = 0
    for row in items:
        artist = str(row.get("artist") or "").strip()
        title = str(row.get("title") or "").strip()
        if artist or not title:
            continue
        try:
            result = await _call_deepseek(
                [
                    {
                        "role": "system",
                        "content": (
                            "你是华语流行音乐资料助手。用户给出歌名时，只输出该曲最常见原唱歌手名"
                            "（可含组合名），不要书名号、不要解释、不要多行。"
                            "若不确定，只输出一个空行。"
                        ),
                    },
                    {"role": "user", "content": f"歌名：{title}\n歌手名："},
                ],
                use_json_mode=False,
                max_tokens=40,
                temperature=0.1,
                timeout=30.0,
            )
            text = (result or "").strip().splitlines()[0].strip() if (result or "").strip() else ""
            text = re.sub(r"^[《\"'【\[]+|[》\"'】\]]+$", "", text).strip()
            if not text or text == title or len(text) > 40:
                print(f"skip {row.get('id')} {title}")
                continue
            row["artist"] = text[:80]
            updated += 1
            print(f"ok {row.get('id')} {title} -> {row['artist']}")
        except Exception as exc:
            print(f"fail {row.get('id')} {title}: {exc}")
        await asyncio.sleep(0.35)

    if isinstance(raw, dict):
        raw["items"] = items
        MANIFEST.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        MANIFEST.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"updated {updated}")


if __name__ == "__main__":
    asyncio.run(main())
