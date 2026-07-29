"""Admin-triggered performance ladder scrape (快科技天梯) + public table serve."""

from __future__ import annotations

import json
import os
import re
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup
from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

router = APIRouter(prefix="/ladder", tags=["ladder"])
security = HTTPBearer(auto_error=False)

_get_current_user: Optional[Callable[..., Any]] = None
_require_admin: Optional[Callable[[dict], None]] = None

_REFRESH_LOCK = threading.Lock()
_REFRESH_STATE: Dict[str, Any] = {
    "running": False,
    "started_at": None,
    "finished_at": None,
}

SOURCES: List[Dict[str, Any]] = [
    {
        "id": "cpu",
        "name": "桌面处理器",
        "url": "https://www.mydrivers.com/zhuanti/tianti/cpu/index.html",
        "filename": "cpu.html",
        "truncate": True,
    },
    {
        "id": "nb_cpu",
        "name": "笔记本处理器",
        "url": "https://www.mydrivers.com/zhuanti/tianti/cpum/index.html",
        "filename": "nb_cpu.html",
        "truncate": True,
    },
    {
        "id": "gpu",
        "name": "桌面显卡",
        "url": "https://www.mydrivers.com/zhuanti/tianti/gpu/index.html",
        "filename": "gpu.html",
        "truncate": True,
    },
    {
        "id": "nb_gpu",
        "name": "笔记本显卡",
        "url": "https://www.mydrivers.com/zhuanti/tianti/gpum/index.html",
        "filename": "nb_gpu.html",
        "truncate": True,
    },
    {
        "id": "soc",
        "name": "手机 SoC",
        "url": "https://www.mydrivers.com/zhuanti/tianti/01/index.html",
        "filename": "soc.html",
        "truncate": False,
        "source_key": "phone",
    },
]

_SOURCE_BY_ID = {s["id"]: s for s in SOURCES}


def wire(get_current_user: Callable[..., Any], require_admin: Callable[[dict], None]) -> None:
    global _get_current_user, _require_admin
    _get_current_user = get_current_user
    _require_admin = require_admin


def _admin_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if _get_current_user is None or _require_admin is None:
        raise HTTPException(status_code=503, detail="Ladder admin unavailable")
    user = _get_current_user(creds)
    _require_admin(user)
    return user


def _data_dir() -> str:
    env = (os.environ.get("LADDER_DATA_DIR") or "").strip()
    if env:
        return env
    return os.path.join(os.path.dirname(__file__), "data", "ladder")


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


def _meta_path() -> str:
    return os.path.join(_data_dir(), "meta.json")


def _table_path(ladder_id: str) -> str:
    return os.path.join(_data_dir(), f"{ladder_id}.html")


def _load_meta() -> Dict[str, Any]:
    path = _meta_path()
    if not os.path.isfile(path):
        return {"items": {}, "last_refresh": None}
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            return {"items": {}, "last_refresh": None}
        data.setdefault("items", {})
        return data
    except (OSError, json.JSONDecodeError):
        return {"items": {}, "last_refresh": None}


def _save_meta(meta: Dict[str, Any]) -> None:
    os.makedirs(_data_dir(), exist_ok=True)
    path = _meta_path()
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def process_table(soup: BeautifulSoup, source_id: str, do_truncate: bool):
    """Parse and clean the ladder table from mydrivers HTML."""
    table = None
    main_div = soup.find("div", class_="main")
    if main_div:
        table = main_div.find("table")

    if not table:
        content_div = soup.find("div", id="content") or soup.find("div", class_="content")
        if content_div:
            table = content_div.find("table")

    if not table:
        tables = soup.find_all("table")
        if tables:
            data_tables = [t for t in tables if len(t.find_all("tr")) > 5]
            table = max(data_tables or tables, key=lambda t: len(str(t)))

    if not table:
        return None

    for attr in ("width", "border", "cellpadding", "cellspacing", "style"):
        if table.has_attr(attr):
            del table[attr]

    rows = table.find_all("tr")
    if not rows:
        return None

    gen_row = rows[1] if len(rows) > 1 else None
    col_indices_to_keep: List[int] = []
    center_col_index = -1
    total_cols = 0

    if gen_row:
        cells = gen_row.find_all("td")
        total_cols = len(cells)
        for i, cell in enumerate(cells):
            text = cell.get_text(strip=True).lower()
            rowspan = int(cell.get("rowspan", 1) or 1)
            if rowspan > 5 or "vs" in text:
                center_col_index = i
                break
            if source_id == "phone" and not text and 0 < i < total_cols - 1:
                if abs(i - total_cols / 2) <= 1.5:
                    center_col_index = i
                    break

    if source_id == "phone" and center_col_index == -1 and total_cols > 0:
        center_col_index = total_cols // 2

    if do_truncate and gen_row and center_col_index != -1:
        left_cols_count = center_col_index
        keep_left = 5 if source_id in ("cpu", "nb_cpu") else 6
        start_left = max(0, left_cols_count - keep_left)
        keep_right = 4 if source_id in ("cpu", "nb_cpu") else 6
        end_right = center_col_index + 1 + keep_right
        col_indices_to_keep.extend(range(start_left, center_col_index))
        col_indices_to_keep.append(center_col_index)
        col_indices_to_keep.extend(range(center_col_index + 1, min(end_right, total_cols)))
    elif gen_row:
        col_indices_to_keep = list(range(len(gen_row.find_all("td"))))

    new_table = soup.new_tag("table")
    new_logo_row = soup.new_tag("tr")
    new_logo_row["class"] = "brand-header"

    if center_col_index != -1:
        left_count = len([i for i in col_indices_to_keep if i < center_col_index])
        right_count = len([i for i in col_indices_to_keep if i > center_col_index])
    else:
        left_count = len(col_indices_to_keep) // 2
        right_count = len(col_indices_to_keep) - left_count

    left_brand_td = soup.new_tag("td")
    left_brand_td["colspan"] = left_count
    if source_id in ("cpu", "nb_cpu"):
        left_brand_td["class"] = "brand-intel"
        left_brand_td.string = "Intel"
    elif source_id in ("gpu", "nb_gpu"):
        left_brand_td["class"] = "brand-nvidia"
        left_brand_td.string = "NVIDIA"
    else:
        left_brand_td["class"] = "brand-amd"
        left_brand_td["style"] = "color: #333; border-bottom-color: #333 !important;"
        left_brand_td.string = "高通 (Qualcomm)"

    center_td = soup.new_tag("td")
    center_td.string = "VS"
    center_td["style"] = "color: #cbd5e1; font-size: 12px; width: 20px;"

    right_brand_td = soup.new_tag("td")
    right_brand_td["colspan"] = right_count
    if source_id in ("cpu", "nb_cpu", "gpu", "nb_gpu"):
        right_brand_td["class"] = "brand-amd"
        right_brand_td.string = "AMD"
    else:
        right_brand_td["class"] = "brand-intel"
        right_brand_td["style"] = "color: #333; border-bottom-color: #333 !important;"
        right_brand_td.string = "联发科 / 苹果 / 华为 / 三星"

    new_logo_row.append(left_brand_td)
    new_logo_row.append(center_td)
    new_logo_row.append(right_brand_td)
    new_table.append(new_logo_row)

    for row_idx, row in enumerate(rows[1:], 1):
        new_row = soup.new_tag("tr")
        if row_idx == 1:
            new_row["class"] = "generation-row"

        cells = row.find_all("td")
        if not cells:
            continue

        has_real_content = False
        for header_idx in col_indices_to_keep:
            if header_idx == center_col_index:
                if row_idx == 1:
                    sep_td = soup.new_tag("td")
                    sep_td["rowspan"] = 9999
                    sep_td["style"] = "width: 1px; padding: 0; background: #f8fafc; border: none;"
                    new_row.append(sep_td)
                continue

            data_idx = header_idx
            if center_col_index != -1 and header_idx > center_col_index:
                data_idx -= 1

            original_cell = None
            if row_idx == 1:
                if header_idx < len(cells):
                    original_cell = cells[header_idx]
            else:
                if data_idx < len(cells):
                    original_cell = cells[data_idx]

            if original_cell:
                for img in original_cell.find_all("img"):
                    img.decompose()
                text_content = original_cell.get_text(strip=True)
                new_cell = soup.new_tag("td")
                if text_content:
                    has_real_content = True
                    for child in list(original_cell.contents):
                        new_cell.append(child)
                    for link in new_cell.find_all("a"):
                        link.unwrap()
                    if row_idx > 1 and text_content.strip():
                        keyword = text_content.strip()
                        jd_link = soup.new_tag("a")
                        jd_link["href"] = (
                            "https://search.jd.com/Search?keyword="
                            + quote(keyword)
                            + "&enc=utf-8"
                        )
                        jd_link["target"] = "_blank"
                        jd_link["class"] = "ladder-jd"
                        jd_link["title"] = "去京东购买"
                        new_cell.append(jd_link)
                else:
                    new_cell.string = ""
                new_row.append(new_cell)
            else:
                new_row.append(soup.new_tag("td"))

        if row_idx == 1 or has_real_content:
            new_table.append(new_row)

    return new_table


def _fetch_table(source: Dict[str, Any]) -> str:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }
    resp = requests.get(source["url"], headers=headers, timeout=25)
    resp.raise_for_status()
    resp.encoding = "gb18030"
    soup = BeautifulSoup(resp.text, "html.parser")
    source_key = source.get("source_key") or source["id"]
    clean = process_table(soup, source_key, bool(source.get("truncate")))
    if not clean:
        raise RuntimeError("未能解析天梯表格")
    return str(clean)


_CONTAINER_RE = re.compile(
    r'(<div class="ladder-container">\s*)(.*?)(\s*</div>)',
    re.DOTALL,
)


def _patch_public_page(filename: str, table_html: str) -> Optional[str]:
    root = _web_root()
    if not root:
        return None
    path = os.path.join(root, "html", "ladder", filename)
    if not os.path.isfile(path):
        return f"missing:{path}"
    try:
        with open(path, encoding="utf-8") as fh:
            html = fh.read()
        if not _CONTAINER_RE.search(html):
            return f"no-container:{path}"

        def _repl(m: re.Match) -> str:
            return m.group(1) + table_html + m.group(3)

        new_html = _CONTAINER_RE.sub(_repl, html, count=1)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(new_html)
        os.replace(tmp, path)
        return "ok"
    except OSError as exc:
        return f"error:{exc}"


def _refresh_one(source: Dict[str, Any]) -> Dict[str, Any]:
    ladder_id = source["id"]
    started = time.time()
    item: Dict[str, Any] = {
        "id": ladder_id,
        "name": source["name"],
        "ok": False,
        "updated_at": None,
        "error": None,
        "bytes": 0,
        "page_patch": None,
        "elapsed_ms": 0,
    }
    try:
        table_html = _fetch_table(source)
        os.makedirs(_data_dir(), exist_ok=True)
        path = _table_path(ladder_id)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(table_html)
        os.replace(tmp, path)
        item["ok"] = True
        item["updated_at"] = _now_iso()
        item["bytes"] = len(table_html.encode("utf-8"))
        item["page_patch"] = _patch_public_page(source["filename"], table_html)
    except Exception as exc:  # noqa: BLE001 — surface crawl errors to admin UI
        item["error"] = str(exc)
    item["elapsed_ms"] = int((time.time() - started) * 1000)
    return item


def refresh_sources(ids: Optional[List[str]] = None) -> Dict[str, Any]:
    if not _REFRESH_LOCK.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="刷新进行中，请稍后再试")
    _REFRESH_STATE["running"] = True
    _REFRESH_STATE["started_at"] = _now_iso()
    _REFRESH_STATE["finished_at"] = None
    try:
        targets = SOURCES
        if ids:
            unknown = [i for i in ids if i not in _SOURCE_BY_ID]
            if unknown:
                raise HTTPException(status_code=400, detail=f"未知天梯 id: {', '.join(unknown)}")
            targets = [_SOURCE_BY_ID[i] for i in ids]

        results = [_refresh_one(src) for src in targets]
        meta = _load_meta()
        items = meta.setdefault("items", {})
        for r in results:
            items[r["id"]] = {
                "name": r["name"],
                "ok": r["ok"],
                "updated_at": r["updated_at"],
                "error": r["error"],
                "bytes": r["bytes"],
                "page_patch": r["page_patch"],
            }
        meta["last_refresh"] = _now_iso()
        _save_meta(meta)
        return {
            "ok": all(r["ok"] for r in results),
            "results": results,
            "last_refresh": meta["last_refresh"],
            "data_dir": _data_dir(),
            "web_root": _web_root(),
        }
    finally:
        _REFRESH_STATE["running"] = False
        _REFRESH_STATE["finished_at"] = _now_iso()
        _REFRESH_LOCK.release()


class RefreshBody(BaseModel):
    ids: Optional[List[str]] = Field(default=None, description="Subset of ladder ids to refresh")


@router.get("/status")
def ladder_status(_admin: dict = Depends(_admin_user)):
    meta = _load_meta()
    items = []
    for src in SOURCES:
        saved = (meta.get("items") or {}).get(src["id"]) or {}
        has_file = os.path.isfile(_table_path(src["id"]))
        items.append(
            {
                "id": src["id"],
                "name": src["name"],
                "url": src["url"],
                "filename": src["filename"],
                "has_cache": has_file,
                "ok": saved.get("ok"),
                "updated_at": saved.get("updated_at"),
                "error": saved.get("error"),
                "bytes": saved.get("bytes"),
                "page_patch": saved.get("page_patch"),
            }
        )
    return {
        "items": items,
        "last_refresh": meta.get("last_refresh"),
        "running": bool(_REFRESH_STATE.get("running")),
        "started_at": _REFRESH_STATE.get("started_at"),
        "finished_at": _REFRESH_STATE.get("finished_at"),
        "data_dir": _data_dir(),
        "web_root": _web_root(),
    }


@router.post("/refresh")
def ladder_refresh(
    body: RefreshBody = Body(default_factory=RefreshBody),
    _admin: dict = Depends(_admin_user),
):
    return refresh_sources(body.ids)


@router.get("/{ladder_id}")
def ladder_table(ladder_id: str):
    """Public: return cached table HTML for live injection."""
    if ladder_id not in _SOURCE_BY_ID:
        raise HTTPException(status_code=404, detail="Unknown ladder")
    path = _table_path(ladder_id)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="No cached ladder data")
    try:
        with open(path, encoding="utf-8") as fh:
            html = fh.read()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    meta = _load_meta()
    item = (meta.get("items") or {}).get(ladder_id) or {}
    return {
        "id": ladder_id,
        "html": html,
        "updated_at": item.get("updated_at"),
        "bytes": len(html.encode("utf-8")),
    }
