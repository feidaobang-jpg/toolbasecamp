"""One-shot: scrape Notebookcheck mobile GPU list into server/data/nbcheck/nb_gpu.json."""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

URL = "https://www.notebookcheck.net/Mobile-Graphics-Cards-Benchmark-List.844.0.html"
OUT = os.path.join(os.path.dirname(__file__), "..", "server", "data", "nbcheck", "nb_gpu.json")


def parse_num(s: str):
    if not s:
        return None
    m = re.search(r"([\d.]+)", s.replace(",", ""))
    return float(m.group(1)) if m else None


def brand_of(model: str) -> str:
    low = model.lower()
    if "nvidia" in low or "geforce" in low or re.search(r"\brtx\b", low) or "quadro" in low:
        return "NVIDIA"
    if "amd" in low or "radeon" in low:
        return "AMD"
    if "intel" in low or re.search(r"\barc\b", low):
        return "Intel"
    return "Other"


def is_consumer_mobile(model: str) -> bool:
    low = model.lower()
    if any(x in low for x in ("rtx pro", "quadro", "radeon pro", "rtx a", "tesla", "apple")):
        if "geforce" not in low and "radeon rx" not in low:
            return False
    if "generation laptop" in low and "geforce" not in low:
        return False
    if re.search(r"\bm[1-5]\b", low):
        return False
    if any(x in low for x in ("laptop", "mobile", "max-q")):
        return True
    if re.search(r"radeon\s+rx\s+\d+[ms]\b", low):
        return True
    if re.search(r"arc\s+a\d+", low):
        return True
    return False


def main() -> int:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
    }
    resp = requests.get(URL, headers=headers, timeout=60)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table", class_="sortable")
    if not table:
        print("no table", file=sys.stderr)
        return 1

    items = []
    for tr in table.find_all("tr"):
        model_td = tr.find("td", class_="fullname")
        if not model_td:
            continue
        model = model_td.get_text(" ", strip=True)
        if not is_consumer_mobile(model):
            continue
        perf_td = tr.find("td", class_="bv_perfrating")
        perf = parse_num(perf_td.get_text(" ", strip=True) if perf_td else "")
        if perf is None or perf <= 0:
            continue
        time_spy = None
        after = False
        for v in tr.find_all("td", class_="value"):
            cls = " ".join(v.get("class") or [])
            if "bv_perfrating" in cls:
                after = True
                continue
            if after:
                time_spy = parse_num(v.get_text(" ", strip=True))
        pos_td = tr.find("td", class_="poslabel")
        pos_raw = pos_td.get_text(strip=True) if pos_td else ""
        pos = int(re.sub(r"\D", "", pos_raw) or 0) or None
        arch_td = tr.find("td", class_="sorttable_codename")
        items.append(
            {
                "pos": pos,
                "model": model,
                "brand": brand_of(model),
                "architecture": arch_td.get_text(strip=True) if arch_td else "",
                "perf_rating": perf,
                "time_spy": time_spy,
            }
        )

    items.sort(key=lambda x: (-x["perf_rating"], x["model"]))
    top = items[0]["perf_rating"] if items else 1.0
    for i, it in enumerate(items, 1):
        it["rank"] = i
        it["pct"] = round(100.0 * it["perf_rating"] / top, 1) if top else 0

    payload = {
        "id": "nb_gpu",
        "title": "笔记本显卡跑分榜",
        "source": "Notebookcheck",
        "source_url": URL,
        "credit": "Data from Notebookcheck. For reference only; laptop TGP varies by chassis.",
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(items),
        "items": items[:100],
    }
    out = os.path.abspath(OUT)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print("wrote", out, "total", len(items), "kept", len(payload["items"]))
    for it in payload["items"][:12]:
        print(f"{it['rank']:2d} {it['brand']:6s} {it['perf_rating']:5.1f}  {it['model']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
