"""Admin-uploaded sticker packs for the public images hub."""

from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/image/stickers", tags=["stickers"])

CN_TZ = ZoneInfo("Asia/Shanghai")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@zhengxiaohui.cn").lower()
ADMIN_PHONE = (os.environ.get("ADMIN_PHONE") or "").strip()

STICKER_DIR = Path(
    os.environ.get("STICKER_DIR") or "/var/lib/toolbasecamp/stickers"
)
try:
    STICKER_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    STICKER_DIR = Path(__file__).resolve().parent / "var" / "stickers"
    STICKER_DIR.mkdir(parents=True, exist_ok=True)

STICKER_MANIFEST = STICKER_DIR / "manifest.json"
_sticker_manifest_cache: tuple[float, list] = (0.0, [])
STICKER_UPLOAD_MAX_MB = max(1, int(os.environ.get("STICKER_UPLOAD_MAX_MB") or "8"))
STICKER_THUMB_MAX_WIDTH = max(80, int(os.environ.get("STICKER_THUMB_MAX_WIDTH") or "240"))
STICKER_THUMB_JPEG_QUALITY = max(50, min(95, int(os.environ.get("STICKER_THUMB_JPEG_QUALITY") or "80")))

_ALLOWED_EXT = frozenset({".png", ".jpg", ".jpeg", ".gif", ".webp"})
_CONTENT_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def _wire(get_conn, require_db, get_current_user, require_admin=None, get_optional_user=None):
    router.get_conn = get_conn  # type: ignore[attr-defined]
    router.require_db = require_db  # type: ignore[attr-defined]
    router.get_current_user = get_current_user  # type: ignore[attr-defined]
    router.require_admin = require_admin  # type: ignore[attr-defined]
    router.get_optional_user = get_optional_user  # type: ignore[attr-defined]


def _admin_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    user = router.get_current_user(creds)  # type: ignore[attr-defined]
    req = getattr(router, "require_admin", None)
    if req:
        req(user)
    else:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def _format_created_at_cn(created: str) -> str:
    s = (created or "").strip().replace("T", " ")
    if not s:
        return datetime.now(timezone.utc).astimezone(CN_TZ).strftime("%Y-%m-%d %H:%M:%S")
    try:
        dt = datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc).astimezone(CN_TZ).strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        return s


def _invalidate_sticker_cache() -> None:
    global _sticker_manifest_cache
    _sticker_manifest_cache = (0.0, [])


def _save_sticker_manifest(items: list) -> None:
    STICKER_DIR.mkdir(parents=True, exist_ok=True)
    STICKER_MANIFEST.write_text(
        json.dumps({"version": 1, "items": items}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    _invalidate_sticker_cache()


def _load_sticker_manifest() -> list:
    global _sticker_manifest_cache
    now = time.time()
    cached_at, cached_items = _sticker_manifest_cache
    if cached_items and now - cached_at < 30:
        return cached_items
    if not STICKER_MANIFEST.is_file():
        _sticker_manifest_cache = (now, [])
        return []
    try:
        raw = json.loads(STICKER_MANIFEST.read_text(encoding="utf-8"))
        items = raw.get("items") if isinstance(raw, dict) else raw
        if not isinstance(items, list):
            items = []
        _sticker_manifest_cache = (now, items)
        return items
    except Exception:
        _sticker_manifest_cache = (now, [])
        return []


def _next_sticker_id(items: list) -> str:
    used = {str(it.get("id") or "") for it in items}
    for n in range(1, 100000):
        sid = f"stk{n:05d}"
        if sid not in used:
            return sid
    raise HTTPException(status_code=500, detail="Sticker id space exhausted")


def _sticker_source_exists(items: list, orig_name: str) -> bool:
    key = orig_name.strip().lower()
    for row in items:
        if str(row.get("source") or "").strip().lower() == key:
            return True
    return False


def _parse_upload_meta(orig_name: str, category_hint: str = "") -> tuple[str, str]:
    stem = Path(str(orig_name or "sticker")).stem.strip()
    cat_hint = (category_hint or "").strip()
    if cat_hint:
        title = stem or "sticker"
        return cat_hint[:40], title[:80]
    for sep in ("-", "_", "—", "–"):
        if sep in stem:
            parts = stem.split(sep, 1)
            cat = parts[0].strip()
            title = parts[1].strip() if len(parts) > 1 else ""
            if cat and title:
                return cat[:40], title[:80]
    return "", (stem or "sticker")[:80]


def _safe_sticker_path(file_name: str) -> Path:
    name = Path(str(file_name or "")).name
    if not name or name != str(file_name) or ".." in name:
        raise HTTPException(status_code=400, detail="Invalid sticker file")
    path = (STICKER_DIR / name).resolve()
    if not str(path).startswith(str(STICKER_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid sticker file")
    return path


def _thumb_file_name(sticker_id: str) -> str:
    sid = re.sub(r"[^a-zA-Z0-9_-]", "", str(sticker_id or ""))[:48]
    if not sid:
        raise HTTPException(status_code=400, detail="Invalid sticker id")
    return f"{sid}_thumb.jpg"


def _make_thumbnail_bytes(data: bytes) -> Optional[bytes]:
    if not data:
        return None
    try:
        from PIL import Image

        im = Image.open(BytesIO(data))
        if im.mode in ("RGBA", "LA"):
            bg = Image.new("RGB", im.size, (245, 245, 245))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        elif im.mode == "P":
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (245, 245, 245))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        elif im.mode != "RGB":
            im = im.convert("RGB")
        w, h = im.size
        max_w = STICKER_THUMB_MAX_WIDTH
        if w > max_w:
            nh = max(1, int(round(h * max_w / w)))
            im = im.resize((max_w, nh), Image.Resampling.LANCZOS)
        buf = BytesIO()
        im.save(buf, format="JPEG", quality=STICKER_THUMB_JPEG_QUALITY, optimize=True)
        out = buf.getvalue()
        return out if out else None
    except Exception:
        return None


def _write_thumbnail(sticker_id: str, source_data: bytes) -> str:
    thumb_name = _thumb_file_name(sticker_id)
    thumb = _make_thumbnail_bytes(source_data)
    if not thumb:
        return ""
    path = _safe_sticker_path(thumb_name)
    path.write_bytes(thumb)
    return thumb_name


def _sticker_row(sticker_id: str) -> Optional[dict]:
    sid = re.sub(r"[^a-zA-Z0-9_-]", "", str(sticker_id or ""))[:48]
    if not sid:
        return None
    for row in _load_sticker_manifest():
        if str(row.get("id") or "") == sid:
            return row
    return None


def _is_gif_row(row: dict) -> bool:
    ctype = str(row.get("contentType") or "").lower()
    file_name = str(row.get("file") or "").lower()
    if "gif" in ctype or file_name.endswith(".gif"):
        return True
    return False


def _public_item(row: dict) -> dict:
    sid = str(row.get("id") or "").strip()
    thumb = str(row.get("thumbFile") or "").strip()
    file_name = str(row.get("file") or "").strip()
    ctype = str(row.get("contentType") or "image/png")
    animated = _is_gif_row(row)
    if animated and "gif" not in ctype.lower():
        ctype = "image/gif"
    bytes_n = 0
    if file_name:
        try:
            full_path = _safe_sticker_path(file_name)
            if full_path.is_file():
                bytes_n = full_path.stat().st_size
        except HTTPException:
            pass
    return {
        "id": sid,
        "title": str(row.get("title") or sid).strip() or sid,
        "category": str(row.get("category") or "").strip(),
        "contentType": ctype,
        "animated": bool(animated),
        "createdAt": str(row.get("createdAt") or ""),
        "bytes": bytes_n,
        "imageUrl": f"/image/stickers/{sid}",
        "staticUrl": f"/pubsticker/{file_name}" if file_name else f"/image/stickers/{sid}",
        "thumbnailUrl": f"/pubsticker/{sid}_thumb.jpg" if thumb else f"/image/stickers/{sid}?thumb=1",
        "downloadUrl": f"/image/stickers/{sid}?download=1",
    }


def _admin_item(row: dict) -> dict:
    file_name = str(row.get("file") or "").strip()
    thumb_name = str(row.get("thumbFile") or "").strip()
    full_path = _safe_sticker_path(file_name) if file_name else None
    thumb_path = _safe_sticker_path(thumb_name) if thumb_name else None
    return {
        **_public_item(row),
        "source": str(row.get("source") or ""),
        "bytes": full_path.stat().st_size if full_path and full_path.is_file() else 0,
        "thumbBytes": thumb_path.stat().st_size if thumb_path and thumb_path.is_file() else 0,
    }


def _guess_content_type(ext: str, upload_ctype: str) -> str:
    ext = (ext or "").lower()
    if ext in _CONTENT_BY_EXT:
        return _CONTENT_BY_EXT[ext]
    low = (upload_ctype or "").strip().lower()
    if low.startswith("image/"):
        return low
    return "image/png"


def _ascii_filename(sticker_id: str, ext: str) -> str:
    ext = ext if ext.startswith(".") else f".{ext}"
    safe_ext = re.sub(r"[^a-zA-Z0-9.]", "", ext) or ".png"
    return f"sticker-{sticker_id}{safe_ext}"


@router.get("/list")
def stickers_public_list(
    limit: int = 200,
    offset: int = 0,
    category: str = "",
    kind: str = "",
):
    all_items = _load_sticker_manifest()
    cat_filter = (category or "").strip()
    kind_filter = (kind or "").strip().lower()
    categories = []
    seen_cats = set()
    for row in all_items:
        cat = str(row.get("category") or "").strip()
        if cat and cat not in seen_cats:
            seen_cats.add(cat)
            categories.append(cat)
    filtered = all_items
    if cat_filter:
        filtered = [
            row for row in all_items
            if str(row.get("category") or "").strip() == cat_filter
        ]
    if kind_filter in ("gif", "animated"):
        filtered = [row for row in filtered if _is_gif_row(row)]
    elif kind_filter in ("still", "static"):
        filtered = [row for row in filtered if not _is_gif_row(row)]
    lim = max(1, min(int(limit or 200), 500))
    off = max(0, int(offset or 0))
    items = []
    for row in filtered[off : off + lim]:
        sid = str(row.get("id") or "").strip()
        if not sid:
            continue
        file_name = str(row.get("file") or "").strip()
        if not file_name:
            continue
        try:
            path = _safe_sticker_path(file_name)
        except HTTPException:
            continue
        if not path.is_file():
            continue
        items.append(_public_item(row))
    return {
        "success": True,
        "items": items,
        "categories": categories,
        "limit": lim,
        "offset": off,
        "total": len(filtered),
        "kind": kind_filter or "all",
    }


@router.get("/admin/list")
def stickers_admin_list(limit: int = 500, offset: int = 0, admin: dict = Depends(_admin_user)):
    del admin
    all_items = _load_sticker_manifest()
    lim = max(1, min(int(limit or 500), 1000))
    off = max(0, int(offset or 0))
    items = [_admin_item(row) for row in all_items[off : off + lim] if row.get("id")]
    categories = []
    seen = set()
    for row in all_items:
        cat = str(row.get("category") or "").strip()
        if cat and cat not in seen:
            seen.add(cat)
            categories.append(cat)
    return {
        "success": True,
        "items": items,
        "categories": categories,
        "limit": lim,
        "offset": off,
        "total": len(all_items),
    }


@router.delete("/admin/{sticker_id}")
def stickers_admin_delete(sticker_id: str, admin: dict = Depends(_admin_user)):
    del admin
    sid = re.sub(r"[^a-zA-Z0-9_-]", "", str(sticker_id or ""))[:48]
    if not sid:
        raise HTTPException(status_code=404, detail="Sticker not found")
    items = _load_sticker_manifest()
    row = _sticker_row(sid)
    if not row:
        raise HTTPException(status_code=404, detail="Sticker not found")
    for fname in {str(row.get("file") or ""), str(row.get("thumbFile") or "")}:
        if not fname:
            continue
        try:
            path = _safe_sticker_path(fname)
            if path.is_file():
                path.unlink()
        except HTTPException:
            pass
    new_items = [it for it in items if str(it.get("id") or "") != sid]
    _save_sticker_manifest(new_items)
    return {"success": True, "deletedId": sid}


@router.post("/admin/batch-delete")
async def stickers_admin_batch_delete(request: Request, admin: dict = Depends(_admin_user)):
    del admin
    try:
        body = await request.json()
    except Exception:
        body = {}
    raw_ids = body.get("ids") if isinstance(body, dict) else None
    if not isinstance(raw_ids, list) or not raw_ids:
        raise HTTPException(status_code=400, detail="ids required")
    items = _load_sticker_manifest()
    by_id = {str(it.get("id") or ""): it for it in items if it.get("id")}
    deleted = []
    for raw in raw_ids[:200]:
        sid = re.sub(r"[^a-zA-Z0-9_-]", "", str(raw or ""))[:48]
        if not sid or sid not in by_id:
            continue
        row = by_id.pop(sid)
        for fname in {str(row.get("file") or ""), str(row.get("thumbFile") or "")}:
            if not fname:
                continue
            try:
                path = _safe_sticker_path(fname)
                if path.is_file():
                    path.unlink()
            except HTTPException:
                pass
        deleted.append(sid)
    if deleted:
        new_items = [it for it in items if str(it.get("id") or "") not in set(deleted)]
        _save_sticker_manifest(new_items)
    return {"success": True, "deletedIds": deleted, "count": len(deleted)}


@router.post("/admin/upload")
async def stickers_admin_upload(
    file: UploadFile = File(...),
    category: str = Form(""),
    admin: dict = Depends(_admin_user),
):
    del admin
    orig_name = Path(str(file.filename or "sticker.png")).name
    ext = Path(orig_name).suffix.lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, GIF, and WebP are supported")
    raw = await file.read()
    max_bytes = STICKER_UPLOAD_MAX_MB * 1024 * 1024
    if len(raw) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File too large (max {STICKER_UPLOAD_MAX_MB}MB)")
    if len(raw) < 32:
        raise HTTPException(status_code=400, detail="File too small")

    items = _load_sticker_manifest()
    if _sticker_source_exists(items, orig_name):
        raise HTTPException(status_code=409, detail=f"Already uploaded: {orig_name}")

    sid = _next_sticker_id(items)
    cat, title = _parse_upload_meta(orig_name, category)
    file_name = f"{sid}{ext}"
    full_path = _safe_sticker_path(file_name)
    STICKER_DIR.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(raw)

    thumb_name = _write_thumbnail(sid, raw)
    created = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    row = {
        "id": sid,
        "title": title,
        "category": cat,
        "file": file_name,
        "thumbFile": thumb_name,
        "contentType": _guess_content_type(ext, getattr(file, "content_type", "") or ""),
        "source": orig_name,
        "createdAt": _format_created_at_cn(created),
    }
    items.append(row)
    _save_sticker_manifest(items)
    return {"success": True, "item": _admin_item(row)}


@router.get("/{sticker_id}")
def stickers_file(sticker_id: str, download: int = 0, thumb: int = 0):
    sid = re.sub(r"[^a-zA-Z0-9_-]", "", str(sticker_id or ""))[:48]
    if not sid:
        raise HTTPException(status_code=404, detail="Sticker not found")
    row = _sticker_row(sid)
    if not row:
        raise HTTPException(status_code=404, detail="Sticker not found")
    if thumb and not download:
        thumb_name = str(row.get("thumbFile") or "").strip()
        if thumb_name:
            thumb_path = _safe_sticker_path(thumb_name)
            if thumb_path.is_file():
                filename = _ascii_filename(sid, ".jpg")
                headers = {
                    "Content-Disposition": f'inline; filename="{filename}"',
                    "Cache-Control": "public, max-age=86400",
                }
                return FileResponse(thumb_path, media_type="image/jpeg", headers=headers)
    file_name = str(row.get("file") or "").strip()
    if not file_name:
        raise HTTPException(status_code=404, detail="Sticker file missing")
    path = _safe_sticker_path(file_name)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Sticker file missing")
    ext = path.suffix or ".png"
    filename = _ascii_filename(sid, ext)
    headers = {
        "Content-Disposition": (
            f'{"attachment" if download else "inline"}; filename="{filename}"'
        ),
    }
    if not download:
        headers["Cache-Control"] = "public, max-age=86400"
    return FileResponse(
        path,
        media_type=str(row.get("contentType") or "image/png"),
        headers=headers,
    )
