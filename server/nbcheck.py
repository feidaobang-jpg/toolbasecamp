"""Hardware benchmark rankings (PassMark CPU/GPU + Notebookcheck SoC)."""

from __future__ import annotations

import json
import os
import re
import threading
import time
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

KEEP_TOP = 300
PASSMARK_MIN_SAMPLES = 2
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
_PASSMARK_ENDPOINTS = {
    "cpu": {
        "mega": "https://www.cpubenchmark.net/CPU_mega_page.html",
        "data": "https://www.cpubenchmark.net/data/",
        "score_key": "cpumark",
    },
    "gpu": {
        "mega": "https://www.videocardbenchmark.net/GPU_mega_page.html",
        "data": "https://www.videocardbenchmark.net/data/",
        "score_key": "g3d",
    },
}
_passmark_rows_cache: Dict[str, List[Dict[str, Any]]] = {}

# PassMark mega lists for PC ladders; Notebookcheck remains for phone SoC.
LISTS: Dict[str, Dict[str, Any]] = {
    "cpu": {
        "title": "桌面处理器跑分榜",
        "kind": "cpu",
        "provider": "passmark",
        "passmark_kind": "cpu",
        "url": "https://www.cpubenchmark.net/CPU_mega_page.html",
        "credit": "Data from PassMark CPU Mark (user submissions). For reference only.",
        "score_label": "PassMark CPU Mark",
        "filters": ["intel", "amd", "apple"],
    },
    "gpu": {
        "title": "桌面显卡跑分榜",
        "kind": "gpu",
        "provider": "passmark",
        "passmark_kind": "gpu",
        "url": "https://www.videocardbenchmark.net/GPU_mega_page.html",
        "credit": "Data from PassMark G3D Mark (user submissions). For reference only.",
        "score_label": "PassMark G3D Mark",
        "filters": ["nvidia", "amd", "intel"],
    },
    "soc": {
        "title": "手机 SoC 跑分榜",
        "kind": "soc",
        "provider": "notebookcheck",
        "url": (
            "https://www.notebookcheck.net/Smartphone-Processors-Benchmark-List.149513.0.html"
            "?cpu_average=1&showBars=1&perfrating=1"
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
        "provider": "passmark",
        "passmark_kind": "cpu",
        "url": "https://www.cpubenchmark.net/CPU_mega_page.html",
        "credit": "Data from PassMark CPU Mark laptop category (user submissions). For reference only.",
        "score_label": "PassMark CPU Mark",
        "filters": ["intel", "amd", "apple", "qualcomm"],
    },
    "nb_gpu": {
        "title": "笔记本显卡跑分榜",
        "kind": "nb_gpu",
        "provider": "passmark",
        "passmark_kind": "gpu",
        "url": "https://www.videocardbenchmark.net/GPU_mega_page.html",
        "credit": (
            "Data from PassMark G3D Mark mobile category (user submissions). "
            "For reference only; laptop TGP varies by chassis."
        ),
        "score_label": "PassMark G3D Mark",
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


def _source_label(meta: Dict[str, Any]) -> str:
    provider = str(meta.get("provider") or "notebookcheck").lower()
    if provider == "passmark":
        return "PassMark"
    return "Notebookcheck"


def _clear_passmark_cache() -> None:
    _passmark_rows_cache.clear()


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


def _is_workstation_gpu_name(model: str) -> bool:
    low = model.lower()
    return any(x in low for x in ("quadro", "rtx pro", "radeon pro", "tesla", "firepro", "rtx a"))


def _include_row(model: str, kind: str, *, passmark_cat: str = "") -> bool:
    if not model:
        return False
    cat = (passmark_cat or "").lower()
    if kind == "nb_gpu":
        # PassMark Mobile category already separates laptop SKUs (name may omit "Laptop").
        if "mobile" in cat:
            return not _is_workstation_gpu_name(model)
        return _is_consumer_mobile_gpu(model)
    if kind == "gpu":
        if "desktop" in cat:
            low = model.lower()
            if "laptop" in low or "mobile" in low or "max-q" in low:
                return False
            return not _is_workstation_gpu_name(model)
        return _is_consumer_desktop_gpu(model)
    if kind == "soc":
        return _is_phone_soc(model)
    if kind in ("cpu", "nb_cpu"):
        low = model.lower()
        if "epyc" in low or re.search(r"\bxeon\b", low):
            return False
        return True
    return True


def _passmark_cat_ok(list_id: str, cat: str, model: str) -> bool:
    c = (cat or "").lower()
    if list_id == "cpu":
        return "desktop" in c
    if list_id == "nb_cpu":
        return "laptop" in c
    if list_id == "gpu":
        if "desktop" in c:
            return True
        if "workstation" in c or "mobile" in c:
            return False
        # Unknown category: keep consumer desktop names only.
        return _is_consumer_desktop_gpu(model)
    if list_id == "nb_gpu":
        # Prefer explicit Mobile; skip Unknown to avoid desktop SKUs leaking in.
        return "mobile" in c and "workstation" not in c
    return False


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


def _score_for_row(tr, kind: str) -> Optional[float]:
    if kind == "soc":
        return _soc_geekbench_multi(tr)
    perf_td = tr.find("td", class_="bv_perfrating")
    return _parse_num(perf_td.get_text(" ", strip=True) if perf_td else "")


def _perf_confidence(tr) -> Optional[float]:
    """Notebookcheck appends sample confidence like '~72.7 23%' on Perf. Rating."""
    perf_td = tr.find("td", class_="bv_perfrating")
    if not perf_td:
        return None
    text = perf_td.get_text(" ", strip=True)
    m = re.search(r"(\d+)\s*%", text)
    return float(m.group(1)) if m else None


def _is_low_confidence_perf(tr) -> bool:
    """Drop sparse estimates that can outrank solid measurements (e.g. M4 8-Core @ 23%)."""
    conf = _perf_confidence(tr)
    if conf is not None and conf < 40:
        return True
    pos_td = tr.find("td", class_="poslabel")
    pos_raw = pos_td.get_text(" ", strip=True) if pos_td else ""
    # Asterisk = estimated position; require at least moderate confidence if known.
    if "*" in pos_raw and (conf is None or conf < 50):
        return True
    return False


def _fetch_passmark_rows(pm_kind: str) -> List[Dict[str, Any]]:
    cached = _passmark_rows_cache.get(pm_kind)
    if cached is not None:
        return cached
    ep = _PASSMARK_ENDPOINTS.get(pm_kind)
    if not ep:
        raise ValueError(f"Unknown PassMark kind: {pm_kind}")
    session = requests.Session()
    session.headers.update({"User-Agent": _UA, "Accept-Language": "en-US,en;q=0.9"})
    mega = str(ep["mega"])
    data_url = str(ep["data"])
    r1 = session.get(mega, timeout=120)
    r1.raise_for_status()
    r2 = session.get(
        data_url,
        params={"_": int(time.time() * 1000)},
        headers={
            "X-Requested-With": "XMLHttpRequest",
            "Referer": mega,
            "Accept": "application/json, text/javascript, */*; q=0.01",
        },
        timeout=120,
    )
    r2.raise_for_status()
    payload = r2.json()
    rows = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(rows, list) or not rows:
        raise RuntimeError(f"PassMark data empty for {pm_kind}")
    typed = [r for r in rows if isinstance(r, dict)]
    _passmark_rows_cache[pm_kind] = typed
    return typed


def _finalize_items(list_id: str, meta: Dict[str, Any], items: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not items:
        raise RuntimeError(f"No items parsed for {list_id}")
    items.sort(key=lambda x: (-float(x["perf_rating"]), x["model"]))
    top = float(items[0]["perf_rating"])
    for i, it in enumerate(items, 1):
        it["rank"] = i
        it["pct"] = round(100.0 * float(it["perf_rating"]) / top, 1) if top else 0
    url = str(meta["url"])
    return {
        "id": list_id,
        "title": meta["title"],
        "source": _source_label(meta),
        "source_url": url.split("?")[0],
        "credit": meta["credit"],
        "score_label": meta.get("score_label"),
        "filters": meta.get("filters") or [],
        "updated_at": _utc_now(),
        "count": len(items),
        "items": items[:KEEP_TOP],
    }


def _scrape_passmark_list(list_id: str, meta: Dict[str, Any]) -> Dict[str, Any]:
    kind = str(meta["kind"])
    pm_kind = str(meta.get("passmark_kind") or ("gpu" if kind in ("gpu", "nb_gpu") else "cpu"))
    score_key = str(_PASSMARK_ENDPOINTS[pm_kind]["score_key"])
    items: List[Dict[str, Any]] = []
    for row in _fetch_passmark_rows(pm_kind):
        model = str(row.get("name") or "").strip()
        if not model:
            continue
        cat = str(row.get("cat") or "")
        if not _passmark_cat_ok(list_id, cat, model):
            continue
        if not _include_row(model, kind, passmark_cat=cat):
            continue
        try:
            samples = int(float(str(samples_raw).replace(",", ""))) if samples_raw not in (None, "") else 0
        except ValueError:
            samples = 0
        if samples < PASSMARK_MIN_SAMPLES:
            continue
        perf = _parse_num(str(row.get(score_key) or ""))
        if perf is None or perf <= 0:
            continue
        architecture = ""
        if pm_kind == "cpu":
            architecture = str(row.get("socket") or "").strip()
        else:
            mem = str(row.get("memSize") or "").strip()
            architecture = mem
        item: Dict[str, Any] = {
            "pos": None,
            "model": model,
            "brand": _brand_of(model, kind),
            "architecture": architecture,
            "perf_rating": perf,
            "samples": samples,
            "category": cat,
        }
        rank_raw = row.get("rank")
        try:
            item["pos"] = int(float(str(rank_raw).replace(",", ""))) if rank_raw not in (None, "") else None
        except ValueError:
            item["pos"] = None
        items.append(item)
    return _finalize_items(list_id, meta, items)


def _scrape_notebookcheck_list(list_id: str, meta: Dict[str, Any]) -> Dict[str, Any]:
    kind = str(meta["kind"])
    url = str(meta["url"])
    headers = {
        "User-Agent": _UA,
        "Accept-Language": "en-US,en;q=0.9",
    }
    resp = requests.get(url, headers=headers, timeout=120)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table", class_="sortable")
    if not table:
        raise RuntimeError(f"Notebookcheck table not found for {list_id}")

    items: List[Dict[str, Any]] = []
    for tr in table.find_all("tr"):
        if not tr.find("td", class_="poslabel"):
            continue
        model = _row_model(tr)
        if not _include_row(model, kind):
            continue
        # CPU relative ratings with tiny sample confidence can invent outliers.
        if kind in ("cpu", "nb_cpu") and _is_low_confidence_perf(tr):
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
        conf = _perf_confidence(tr)
        if conf is not None:
            item["confidence"] = conf
        if kind in ("gpu", "nb_gpu"):
            item["time_spy"] = _time_spy_after_perf(tr)
        if kind in ("cpu", "nb_cpu"):
            item["cb_r23"] = _cb_r23_multi(tr)
        if kind == "soc":
            item["score_label"] = meta.get("score_label") or "Geekbench 5.5 Multi"
        items.append(item)

    return _finalize_items(list_id, meta, items)


def _scrape_list(list_id: str) -> Dict[str, Any]:
    meta = LISTS.get(list_id)
    if not meta:
        raise ValueError(f"Unknown list: {list_id}")
    provider = str(meta.get("provider") or "notebookcheck").lower()
    if provider == "passmark":
        return _scrape_passmark_list(list_id, meta)
    return _scrape_notebookcheck_list(list_id, meta)


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
        "source": payload.get("source"),
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
    _clear_passmark_cache()
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
        raise HTTPException(status_code=502, detail=f"Benchmark scrape failed: {exc}") from exc
    finally:
        _clear_passmark_cache()
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
                "source": (data or {}).get("source") or _source_label(meta),
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
