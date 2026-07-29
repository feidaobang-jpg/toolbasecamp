"""Notebookcheck benchmark rankings (admin refresh + public JSON)."""

from __future__ import annotations

import json
import os
import re
import threading
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

import requests
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

router = APIRouter(prefix="/nbcheck", tags=["nbcheck"])
security = HTTPBearer(auto_error=False)

_get_current_user: Optional[Callable[..., Any]] = None
_require_admin: Optional[Callable[[dict], None]] = None

_REFRESH_LOCK = threading.Lock()
_REFRESH_STATE: Dict[str, Any] = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "last_error": None,
    "current_id": None,
}

KEEP_TOP = 100

# Official Notebookcheck benchmark-list pages (filter query where needed).
LISTS: Dict[str, Dict[str, Any]] = {
    "cpu": {
        "title": "桌面处理器跑分榜",
        "kind": "cpu",
        "url": (
            "https://www.notebookcheck.net/Mobile-Processors-Benchmark-List.2436.0.html"
            "?deskornote=1&cpu_fullname=1&showBars=1"
        ),
        "credit": "Data from Notebookcheck mobile/desktop processor list (desktop filter). For reference only.",
        "filters": ["intel", "amd", "apple"],
    },
    "gpu": {
        "title": "桌面显卡跑分榜",
        "kind": "gpu",
        "url": (
            "https://www.notebookcheck.net/Mobile-Graphics-Cards-Benchmark-List.844.0.html"
            "?deskornote=1&gpu_fullname=1&showBars=1"
        ),
        "credit": "Data from Notebookcheck graphics list (desktop filter). For reference only.",
        "filters": ["nvidia", "amd", "intel"],
    },
    "soc": {
        "title": "手机 SoC 跑分榜",
        "kind": "soc",
        "url": (
            "https://www.notebookcheck.net/Smartphone-Processors-Benchmark-List.149513.0.html"
            "?cpu_fullname=1&showBars=1&perfrating=1"
        ),
        "credit": (
            "Data from Notebookcheck smartphone/tablet SoC list. "
            "Ranked by Geekbench 5.5 Multi-Core when available. For reference only."
        ),
        "filters": ["qualcomm", "mediatek", "apple", "samsung", "google", "hisilicon"],
        "score_label": "Geekbench 5.5 Multi",
    },
    "nb_cpu": {
        "title": "笔记本处理器跑分榜",
        "kind": "nb_cpu",
        "url": (
            "https://www.notebookcheck.net/Mobile-Processors-Benchmark-List.2436.0.html"
            "?deskornote=2&cpu_fullname=1&showBars=1"
        ),
        "credit": "Data from Notebookcheck mobile processors list (notebook filter). For reference only.",
        "filters": ["intel", "amd", "apple", "qualcomm"],
    },
    "nb_gpu": {
        "title": "笔记本显卡跑分榜",
        "kind": "nb_gpu",
        "url": "https://www.notebookcheck.net/Mobile-Graphics-Cards-Benchmark-List.844.0.html",
        "credit": "Data from Notebookcheck. For reference only; laptop TGP varies by chassis.",
        "filters": ["nvidia", "amd", "intel"],
    },
}

KNOWN_IDS = tuple(LISTS.keys())


def wire(get_current_user: Callable[..., Any], require_admin: Callable[[dict], None]) -> None:
    global _get_current_user, _require_admin
    _get_current_user = get_current_user
    _require_admin = require_admin


def _admin_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if _get_current_user is None or _require_admin is None:
        raise HTTPException(status_code=503, detail="Nbcheck admin unavailable")
    user = _get_current_user(creds)
    _require_admin(user)
    return user


def _data_dir() -> str:
    env = (os.environ.get("NBCHECK_DATA_DIR") or "").strip()
    if env:
        return env
    return os.path.join(os.path.dirname(__file__), "data", "nbcheck")


def _json_path(list_id: str) -> str:
    return os.path.join(_data_dir(), f"{list_id}.json")


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_num(s: str) -> Optional[float]:
    if not s:
        return None
    # Strip ~ estimates and <sup> confidence text already flattened by get_text
    m = re.search(r"([\d.]+)", s.replace(",", "").replace("~", ""))
    return float(m.group(1)) if m else None


def _brand_of(model: str, kind: str) -> str:
    low = model.lower()
    if kind in ("gpu", "nb_gpu"):
        if "nvidia" in low or "geforce" in low or re.search(r"\brtx\b", low) or "quadro" in low:
            return "NVIDIA"
        if "amd" in low or "radeon" in low:
            return "AMD"
        if "intel" in low or re.search(r"\barc\b", low):
            return "Intel"
        return "Other"
    if kind == "soc":
        if "apple" in low or re.search(r"\ba1[0-9]\b", low) or re.search(r"\bm[1-5]\b", low):
            return "Apple"
        if "qualcomm" in low or "snapdragon" in low:
            return "Qualcomm"
        if "mediatek" in low or "dimensity" in low or "helio" in low:
            return "MediaTek"
        if "samsung" in low or "exynos" in low:
            return "Samsung"
        if "google" in low or "tensor" in low:
            return "Google"
        if "hisilicon" in low or "kirin" in low or "huawei" in low:
            return "HiSilicon"
        if "unisoc" in low or "spreadtrum" in low:
            return "UNISOC"
        if "xiaomi" in low or "xring" in low:
            return "Xiaomi"
        return "Other"
    # cpu / nb_cpu
    if "intel" in low or "core ultra" in low or re.search(r"\bcore\s+i[3579]\b", low):
        return "Intel"
    if "amd" in low or "ryzen" in low or "threadripper" in low or "epyc" in low or "athlon" in low:
        return "AMD"
    if "apple" in low or re.search(r"\bm[1-5]\b", low):
        return "Apple"
    if "qualcomm" in low or "snapdragon" in low:
        return "Qualcomm"
    return "Other"


def _is_consumer_mobile_gpu(model: str) -> bool:
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


def _is_consumer_desktop_gpu(model: str) -> bool:
    low = model.lower()
    if any(x in low for x in ("quadro", "rtx pro", "radeon pro", "tesla", "firepro", "rtx a")):
        return False
    if "laptop" in low or "mobile" in low or "max-q" in low:
        return False
    if "geforce" in low or "radeon rx" in low or re.search(r"\barc\s+[ab]?\d+", low):
        return True
    if re.search(r"\brtx\s+\d+", low) or re.search(r"\bgtx\s+\d+", low):
        return True
    return False


def _is_phone_soc(model: str) -> bool:
    low = model.lower()
    # Apple M-series dominate the smartphone list but are Mac/iPad class — skip for 手机 SoC.
    if re.search(r"\bapple\s+m[1-5]\b", low) or re.search(r"^m[1-5]\b", low):
        return False
    return True


def _row_model(tr) -> str:
    model_td = tr.find("td", class_="fullname")
    if model_td:
        return model_td.get_text(" ", strip=True)
    tds = tr.find_all("td")
    if len(tds) >= 2:
        return tds[1].get_text(" ", strip=True)
    return ""


def _time_spy_after_perf(tr) -> Optional[float]:
    time_spy = None
    after = False
    for v in tr.find_all("td", class_="value"):
        cls = " ".join(v.get("class") or [])
        if "bv_perfrating" in cls:
            after = True
            continue
        if after:
            time_spy = _parse_num(v.get_text(" ", strip=True))
            break
    return time_spy


def _soc_geekbench_multi(tr) -> Optional[float]:
    """Geekbench 5.5 Multi only (bv_717 second value).

    Do not fall back to bv_440 (Geekbench 4.4): scales are incompatible and
    would rank sparse modern rows with ~30k GB4/GB6-like numbers above peers.
    """
    vals_717: List[float] = []
    for td in tr.find_all("td", class_="bv_717"):
        n = _parse_num(td.get_text(" ", strip=True))
        if n is not None and n > 0:
            vals_717.append(n)
    if len(vals_717) >= 2:
        return vals_717[1]
    if len(vals_717) == 1:
        return vals_717[0]
    return None


def _cb_r23_multi(tr) -> Optional[float]:
    vals: List[float] = []
    for td in tr.find_all("td", class_="bv_768"):
        n = _parse_num(td.get_text(" ", strip=True))
        if n is not None and n > 0:
            vals.append(n)
    if len(vals) >= 2:
        return vals[1]
    if len(vals) == 1:
        return vals[0]
    return None


def _include_row(model: str, kind: str) -> bool:
    if not model:
        return False
    if kind == "nb_gpu":
        return _is_consumer_mobile_gpu(model)
    if kind == "gpu":
        return _is_consumer_desktop_gpu(model)
    if kind == "soc":
        return _is_phone_soc(model)
    if kind in ("cpu", "nb_cpu"):
        low = model.lower()
        if "epyc" in low or re.search(r"\bxeon\b", low):
            return False
        return True
    return True


def _score_for_row(tr, kind: str) -> Optional[float]:
    if kind == "soc":
        return _soc_geekbench_multi(tr)
    perf_td = tr.find("td", class_="bv_perfrating")
    return _parse_num(perf_td.get_text(" ", strip=True) if perf_td else "")


def _header_indices(table) -> Dict[str, int]:
    """Map normalized header labels -> column index (first header-like row)."""
    out: Dict[str, int] = {}
    for tr in table.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if len(cells) < 4:
            continue
        texts = [c.get_text(" ", strip=True) for c in cells]
        joined = " ".join(texts).lower()
        if "model" not in joined and "pos" not in joined:
            continue
        if not any("tdp" in t.lower() or "perf" in t.lower() for t in texts):
            # Still accept a Model header row without TDP (GPU tables).
            if "model" not in joined:
                continue
        for i, t in enumerate(texts):
            key = re.sub(r"\s+", " ", t).strip().lower()
            if key and key not in out:
                out[key] = i
        if out:
            break
    return out


def _cell_at(tr, idx: Optional[int]) -> str:
    if idx is None or idx < 0:
        return ""
    tds = tr.find_all("td")
    if idx >= len(tds):
        return ""
    return tds[idx].get_text(" ", strip=True)


def _tdp_from_row(tr, headers: Dict[str, int]) -> Optional[float]:
    """Base TDP (Watt) when the list exposes it — mainly CPU tables."""
    for key in ("tdp watt", "tdp", "tdp (watt)"):
        if key in headers:
            n = _parse_num(_cell_at(tr, headers[key]))
            if n is not None and n > 0:
                return n
    return None


def _scrape_list(list_id: str) -> Dict[str, Any]:
    meta = LISTS.get(list_id)
    if not meta:
        raise ValueError(f"Unknown list: {list_id}")
    kind = str(meta["kind"])
    url = str(meta["url"])
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }
    resp = requests.get(url, headers=headers, timeout=120)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table", class_="sortable")
    if not table:
        raise RuntimeError(f"Notebookcheck table not found for {list_id}")

    col_map = _header_indices(table)
    items: List[Dict[str, Any]] = []
    for tr in table.find_all("tr"):
        if not tr.find("td", class_="poslabel"):
            continue
        model = _row_model(tr)
        if not _include_row(model, kind):
            continue
        perf = _score_for_row(tr, kind)
        if perf is None or perf <= 0:
            continue
        arch_td = tr.find("td", class_="sorttable_codename")
        pos_td = tr.find("td", class_="poslabel")
        pos_raw = pos_td.get_text(strip=True) if pos_td else ""
        pos = int(re.sub(r"\D", "", pos_raw) or 0) or None
        item: Dict[str, Any] = {
            "pos": pos,
            "model": model,
            "brand": _brand_of(model, kind),
            "architecture": arch_td.get_text(strip=True) if arch_td else "",
            "perf_rating": perf,
        }
        if kind in ("gpu", "nb_gpu"):
            item["time_spy"] = _time_spy_after_perf(tr)
        if kind in ("cpu", "nb_cpu"):
            item["cb_r23"] = _cb_r23_multi(tr)
            tdp = _tdp_from_row(tr, col_map)
            if tdp is not None:
                item["tdp"] = tdp
        if kind == "soc":
            item["score_label"] = meta.get("score_label") or "Geekbench 5.5 Multi"
        items.append(item)

    if not items:
        raise RuntimeError(f"No items parsed for {list_id}")

    items.sort(key=lambda x: (-float(x["perf_rating"]), x["model"]))
    top = float(items[0]["perf_rating"])
    for i, it in enumerate(items, 1):
        it["rank"] = i
        it["pct"] = round(100.0 * float(it["perf_rating"]) / top, 1) if top else 0

    return {
        "id": list_id,
        "title": meta["title"],
        "source": "Notebookcheck",
        "source_url": url.split("?")[0],
        "credit": meta["credit"],
        "score_label": meta.get("score_label"),
        "filters": meta.get("filters") or [],
        "updated_at": _utc_now(),
        "count": len(items),
        "items": items[:KEEP_TOP],
    }


def _load_json(list_id: str) -> Optional[Dict[str, Any]]:
    path = _json_path(list_id)
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save_json(payload: Dict[str, Any]) -> str:
    path = _json_path(str(payload.get("id") or "unknown"))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return path


def _web_root() -> Optional[str]:
    env = (os.environ.get("TOOLBASECAMP_WEB_ROOT") or "").strip()
    if env and os.path.isdir(env):
        return env
    local = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public"))
    if os.path.isdir(os.path.join(local, "html", "ladder")):
        return local
    prod = "/var/www/toolbasecamp"
    if os.path.isdir(os.path.join(prod, "html", "ladder")):
        return prod
    return None


def _save_public_copy(payload: Dict[str, Any]) -> Optional[str]:
    root = _web_root()
    if not root:
        return None
    out_dir = os.path.join(root, "data", "nbcheck")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{payload.get('id') or 'unknown'}.json")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return path


def refresh_list(list_id: str) -> Dict[str, Any]:
    if list_id not in LISTS:
        raise HTTPException(status_code=404, detail=f"Unknown list: {list_id}")
    payload = _scrape_list(list_id)
    path = _save_json(payload)
    public_path = _save_public_copy(payload)
    return {
        "ok": True,
        "id": list_id,
        "count": payload.get("count"),
        "kept": len(payload.get("items") or []),
        "updated_at": payload.get("updated_at"),
        "path": path,
        "public_path": public_path,
    }


def refresh_lists(list_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    ids = list(list_ids) if list_ids else list(KNOWN_IDS)
    for lid in ids:
        if lid not in LISTS:
            raise HTTPException(status_code=404, detail=f"Unknown list: {lid}")
    if not _REFRESH_LOCK.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Refresh already running")
    _REFRESH_STATE["running"] = True
    _REFRESH_STATE["started_at"] = _utc_now()
    _REFRESH_STATE["last_error"] = None
    results: List[Dict[str, Any]] = []
    try:
        for lid in ids:
            _REFRESH_STATE["current_id"] = lid
            results.append(refresh_list(lid))
        return {
            "ok": True,
            "refreshed": [r.get("id") for r in results],
            "results": results,
        }
    except HTTPException:
        raise
    except Exception as exc:
        _REFRESH_STATE["last_error"] = str(exc)
        raise HTTPException(status_code=502, detail=f"Notebookcheck scrape failed: {exc}") from exc
    finally:
        _REFRESH_STATE["running"] = False
        _REFRESH_STATE["finished_at"] = _utc_now()
        _REFRESH_STATE["current_id"] = None
        _REFRESH_LOCK.release()


# Back-compat alias used by older scripts
def refresh_nb_gpu() -> Dict[str, Any]:
    return refresh_lists(["nb_gpu"])


class RefreshBody(BaseModel):
    id: Optional[str] = Field(default=None, description="List id, or 'all'/omit for every list")


@router.get("/status")
def nbcheck_status(_admin: dict = Depends(_admin_user)):
    lists_out = []
    for lid, meta in LISTS.items():
        data = _load_json(lid)
        lists_out.append(
            {
                "id": lid,
                "title": meta["title"],
                "source": "Notebookcheck",
                "source_url": str(meta["url"]).split("?")[0],
                "updated_at": (data or {}).get("updated_at"),
                "count": (data or {}).get("count"),
                "kept": len((data or {}).get("items") or []),
                "has_data": bool(data and data.get("items")),
            }
        )
    return {
        "running": bool(_REFRESH_STATE.get("running")),
        "started_at": _REFRESH_STATE.get("started_at"),
        "finished_at": _REFRESH_STATE.get("finished_at"),
        "last_error": _REFRESH_STATE.get("last_error"),
        "current_id": _REFRESH_STATE.get("current_id"),
        "lists": lists_out,
    }


@router.post("/refresh")
def nbcheck_refresh(body: RefreshBody = RefreshBody(), _admin: dict = Depends(_admin_user)):
    _ = _admin
    raw = (body.id or "all").strip().lower()
    if raw in ("", "all", "*"):
        return refresh_lists(None)
    return refresh_lists([raw])


@router.get("/{list_id}")
def nbcheck_list(list_id: str):
    if list_id not in LISTS:
        raise HTTPException(status_code=404, detail="Unknown list")
    data = _load_json(list_id)
    if not data:
        raise HTTPException(status_code=404, detail="No cached data — admin refresh required")
    return data
