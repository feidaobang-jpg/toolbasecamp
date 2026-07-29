"""Notebookcheck mobile GPU rankings (admin refresh + public JSON)."""

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
}

NB_GPU_URL = "https://www.notebookcheck.net/Mobile-Graphics-Cards-Benchmark-List.844.0.html"
NB_GPU_ID = "nb_gpu"
KEEP_TOP = 100


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


def _json_path(list_id: str = NB_GPU_ID) -> str:
    return os.path.join(_data_dir(), f"{list_id}.json")


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_num(s: str) -> Optional[float]:
    if not s:
        return None
    m = re.search(r"([\d.]+)", s.replace(",", ""))
    return float(m.group(1)) if m else None


def _brand_of(model: str) -> str:
    low = model.lower()
    if "nvidia" in low or "geforce" in low or re.search(r"\brtx\b", low) or "quadro" in low:
        return "NVIDIA"
    if "amd" in low or "radeon" in low:
        return "AMD"
    if "intel" in low or re.search(r"\barc\b", low):
        return "Intel"
    return "Other"


def _is_consumer_mobile(model: str) -> bool:
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


def _scrape_nb_gpu() -> Dict[str, Any]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }
    resp = requests.get(NB_GPU_URL, headers=headers, timeout=60)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table", class_="sortable")
    if not table:
        raise RuntimeError("Notebookcheck table not found")

    items: List[Dict[str, Any]] = []
    for tr in table.find_all("tr"):
        model_td = tr.find("td", class_="fullname")
        if not model_td:
            continue
        model = model_td.get_text(" ", strip=True)
        if not _is_consumer_mobile(model):
            continue
        perf_td = tr.find("td", class_="bv_perfrating")
        perf = _parse_num(perf_td.get_text(" ", strip=True) if perf_td else "")
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
                time_spy = _parse_num(v.get_text(" ", strip=True))
        pos_td = tr.find("td", class_="poslabel")
        pos_raw = pos_td.get_text(strip=True) if pos_td else ""
        pos = int(re.sub(r"\D", "", pos_raw) or 0) or None
        arch_td = tr.find("td", class_="sorttable_codename")
        items.append(
            {
                "pos": pos,
                "model": model,
                "brand": _brand_of(model),
                "architecture": arch_td.get_text(strip=True) if arch_td else "",
                "perf_rating": perf,
                "time_spy": time_spy,
            }
        )

    if not items:
        raise RuntimeError("No consumer mobile GPUs parsed")

    items.sort(key=lambda x: (-float(x["perf_rating"]), x["model"]))
    top = float(items[0]["perf_rating"])
    for i, it in enumerate(items, 1):
        it["rank"] = i
        it["pct"] = round(100.0 * float(it["perf_rating"]) / top, 1) if top else 0

    return {
        "id": NB_GPU_ID,
        "title": "笔记本显卡跑分榜",
        "source": "Notebookcheck",
        "source_url": NB_GPU_URL,
        "credit": "Data from Notebookcheck. For reference only; laptop TGP varies by chassis.",
        "updated_at": _utc_now(),
        "count": len(items),
        "items": items[:KEEP_TOP],
    }


def _load_json(list_id: str = NB_GPU_ID) -> Optional[Dict[str, Any]]:
    path = _json_path(list_id)
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save_json(payload: Dict[str, Any]) -> str:
    path = _json_path(str(payload.get("id") or NB_GPU_ID))
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
    path = os.path.join(out_dir, f"{payload.get('id') or NB_GPU_ID}.json")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return path


def refresh_nb_gpu() -> Dict[str, Any]:
    if not _REFRESH_LOCK.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Refresh already running")
    _REFRESH_STATE["running"] = True
    _REFRESH_STATE["started_at"] = _utc_now()
    _REFRESH_STATE["last_error"] = None
    try:
        payload = _scrape_nb_gpu()
        path = _save_json(payload)
        public_path = _save_public_copy(payload)
        return {
            "ok": True,
            "id": NB_GPU_ID,
            "count": payload.get("count"),
            "kept": len(payload.get("items") or []),
            "updated_at": payload.get("updated_at"),
            "path": path,
            "public_path": public_path,
        }
    except Exception as exc:
        _REFRESH_STATE["last_error"] = str(exc)
        raise HTTPException(status_code=502, detail=f"Notebookcheck scrape failed: {exc}") from exc
    finally:
        _REFRESH_STATE["running"] = False
        _REFRESH_STATE["finished_at"] = _utc_now()
        _REFRESH_LOCK.release()


@router.get("/status")
def nbcheck_status(_admin: dict = Depends(_admin_user)):
    data = _load_json(NB_GPU_ID)
    return {
        "running": bool(_REFRESH_STATE.get("running")),
        "started_at": _REFRESH_STATE.get("started_at"),
        "finished_at": _REFRESH_STATE.get("finished_at"),
        "last_error": _REFRESH_STATE.get("last_error"),
        "lists": [
            {
                "id": NB_GPU_ID,
                "title": "笔记本显卡跑分榜",
                "source": "Notebookcheck",
                "updated_at": (data or {}).get("updated_at"),
                "count": (data or {}).get("count"),
                "kept": len((data or {}).get("items") or []),
                "has_data": bool(data and data.get("items")),
            }
        ],
    }


@router.post("/refresh")
def nbcheck_refresh(_admin: dict = Depends(_admin_user)):
    _ = _admin
    return refresh_nb_gpu()


@router.get("/{list_id}")
def nbcheck_list(list_id: str):
    if list_id != NB_GPU_ID:
        raise HTTPException(status_code=404, detail="Unknown list")
    data = _load_json(list_id)
    if not data:
        raise HTTPException(status_code=404, detail="No cached data — admin refresh required")
    return data
