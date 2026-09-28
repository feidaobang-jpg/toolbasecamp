"""Software download hub: admin-managed file/external-link library.

Public:
  GET  /downloads                 — published list
  GET  /downloads/{id}/file       — download (counts a hit; X-Accel-Redirect when nginx patched)

Admin (JWT):
  GET    /downloads/admin/list
  POST   /downloads/admin                        — metadata-only entry (external link)
  PUT    /downloads/admin/{id}                   — edit metadata / status / sort
  DELETE /downloads/admin/{id}                   — delete row + file on disk
  POST   /downloads/admin/upload                 — single-shot multipart upload (small files)
  POST   /downloads/admin/upload/init            — chunked upload handshake (Cloudflare 100MB limit)
  POST   /downloads/admin/upload/chunk           — one chunk (multipart)
  POST   /downloads/admin/upload/finalize        — assemble + insert row

Storage: DOWNLOADS_DIR (default /opt/toolbasecamp-downloads)
  files/    — stored binaries (never executed, always attachment)
  chunks/   — in-progress chunked uploads (auto-swept after 24h)
"""

from __future__ import annotations

import hashlib
import os
import re
import secrets
import shutil
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

router = APIRouter(prefix="/downloads", tags=["downloads"])
security = HTTPBearer(auto_error=False)

_get_conn: Optional[Callable[[], Any]] = None
_require_db: Optional[Callable[[], None]] = None
_get_current_user: Optional[Callable[..., Any]] = None
_require_admin: Optional[Callable[[dict], None]] = None


def wire(
    get_conn: Callable[[], Any],
    require_db: Callable[[], None],
    get_current_user: Callable[..., Any],
    require_admin: Callable[[dict], None],
) -> None:
    global _get_conn, _require_db, _get_current_user, _require_admin
    _get_conn = get_conn
    _require_db = require_db
    _get_current_user = get_current_user
    _require_admin = require_admin


def _admin_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if _get_current_user is None or _require_admin is None:
        raise HTTPException(status_code=503, detail="Downloads admin unavailable")
    user = _get_current_user(creds)
    _require_admin(user)
    return user


DOWNLOADS_DIR = os.environ.get("DOWNLOADS_DIR", "/opt/toolbasecamp-downloads")
# Set (e.g. "/downloads-internal") after applying deploy/patch-nginx-downloads.sh;
# empty → stream via FileResponse (slower but works without nginx).
DOWNLOADS_XACCEL_PREFIX = os.environ.get("DOWNLOADS_XACCEL_PREFIX", "")
CHUNK_MB = max(1, int(os.environ.get("DOWNLOADS_CHUNK_MB") or "8"))
MAX_TOTAL_MB = max(1, int(os.environ.get("DOWNLOADS_MAX_TOTAL_MB") or "2048"))
MAX_CHUNKS = 20000

FILES_DIR = os.path.join(DOWNLOADS_DIR, "files")
CHUNKS_DIR = os.path.join(DOWNLOADS_DIR, "chunks")

_UPLOAD_ID_RE = re.compile(r"^[a-f0-9]{16,64}$")
_STATUS_ALLOWED = ("published", "hidden")
# Served as attachment/octet-stream only; still refuse things that only make sense inline.
_EXT_BLOCKLIST = {".html", ".htm", ".svg", ".php", ".asp", ".aspx", ".jsp", ".cgi"}
_FIELDS_EDITABLE = (
    "title",
    "version",
    "category",
    "description",
    "source_url",
    "source_type",
    "sort_order",
    "status",
)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS downloads (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    version VARCHAR(64) NOT NULL DEFAULT '',
    category VARCHAR(64) NOT NULL DEFAULT '',
    description TEXT NULL,
    source_url VARCHAR(1024) NULL,
    source_type VARCHAR(16) NOT NULL DEFAULT 'server',
    file_name VARCHAR(128) NOT NULL DEFAULT '',
    orig_name VARCHAR(255) NOT NULL DEFAULT '',
    file_size BIGINT NOT NULL DEFAULT 0,
    sha256 CHAR(64) NOT NULL DEFAULT '',
    download_count INT NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'published',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_downloads_status (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""


def ensure_downloads_tables(cur: Any) -> None:
    cur.execute(SCHEMA_SQL)


# ---------------------------------------------------------------------------
# helpers


def _conn():
    if _get_conn is None or _require_db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    _require_db()
    return _get_conn()


def _safe_ext(name: str) -> str:
    stem, ext = os.path.splitext(String_or_empty(name))
    ext = ext.lower()
    if ext in _EXT_BLOCKLIST or len(ext) > 16:
        return ""
    return ext


def String_or_empty(v: Any) -> str:
    return v if isinstance(v, str) else ""


def _sanitize_display_name(name: str, fallback: str = "download") -> str:
    s = String_or_empty(name).strip()
    s = re.sub(r"[\\/:*?\"<>|\r\n\t]+", "_", s).strip(". ")
    if not s:
        s = _sanitize_display_name(fallback, "download")
    return s[:180]


def _content_disposition(filename: str) -> str:
    safe = filename.replace("\\", "_").replace('"', "_")
    try:
        safe.encode("ascii")
        return f'attachment; filename="{safe}"'
    except UnicodeEncodeError:
        from urllib.parse import quote

        return f"attachment; filename=\"download\"; filename*=UTF-8''{quote(filename)}"


def _stored_path(file_name: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{32}(\.[A-Za-z0-9]{1,15})?", file_name or ""):
        raise HTTPException(status_code=400, detail="Invalid file reference")
    return os.path.join(FILES_DIR, file_name)


def _chunks_dir(upload_id: str) -> str:
    if not _UPLOAD_ID_RE.fullmatch(upload_id or ""):
        raise HTTPException(status_code=400, detail="Invalid upload id")
    return os.path.join(CHUNKS_DIR, upload_id)


def _sweep_stale_chunks() -> None:
    """Best-effort cleanup of chunk dirs older than 24h."""
    try:
        now = time.time()
        for name in os.listdir(CHUNKS_DIR):
            path = os.path.join(CHUNKS_DIR, name)
            try:
                if now - os.path.getmtime(path) > 86400:
                    shutil.rmtree(path, ignore_errors=True)
            except OSError:
                continue
    except OSError:
        pass


def _fetch_row(item_id: int) -> Optional[Dict[str, Any]]:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM downloads WHERE id=%s", (item_id,))
            return cur.fetchone()
    finally:
        conn.close()


def _file_url(row: Dict[str, Any]) -> str:
    if row.get("source_type") == "external":
        return String_or_empty(row.get("source_url"))
    if row.get("file_name"):
        return f"/downloads/{row['id']}/file"
    return String_or_empty(row.get("source_url") or "")


def _serialize(row: Dict[str, Any], admin: bool = False) -> Dict[str, Any]:
    created = row.get("created_at")
    updated = row.get("updated_at")
    item = {
        "id": row["id"],
        "title": row.get("title") or "",
        "version": row.get("version") or "",
        "category": row.get("category") or "",
        "description": row.get("description") or "",
        "sourceType": row.get("source_type") or "server",
        "origName": row.get("orig_name") or "",
        "fileSize": int(row.get("file_size") or 0),
        "sha256": row.get("sha256") or "",
        "downloadCount": int(row.get("download_count") or 0),
        "sortOrder": int(row.get("sort_order") or 0),
        "url": _file_url(row),
        "createdAt": _fmt_ts(created),
        "updatedAt": _fmt_ts(updated),
    }
    if admin:
        item["status"] = row.get("status") or "published"
        item["fileName"] = row.get("file_name") or ""
        item["sourceUrl"] = String_or_empty(row.get("source_url"))
    return item


def _fmt_ts(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        return value.strftime("%Y-%m-%d %H:%M")
    except AttributeError:
        return str(value)


def _validate_meta(data: Dict[str, Any], *, need_file_or_url: bool, has_file: bool = False) -> Dict[str, Any]:
    title = String_or_empty(data.get("title")).strip()
    if not title:
        raise HTTPException(status_code=400, detail="标题不能为空")
    if len(title) > 200:
        raise HTTPException(status_code=400, detail="标题过长（≤200 字符）")

    version = String_or_empty(data.get("version")).strip()[:64]
    category = String_or_empty(data.get("category")).strip()[:64]
    description = String_or_empty(data.get("description")).strip()
    if len(description) > 2000:
        raise HTTPException(status_code=400, detail="简介过长（≤2000 字符）")

    source_url = String_or_empty(data.get("source_url")).strip()
    if source_url:
        if len(source_url) > 1000 or not re.match(r"^https?://", source_url, re.I):
            raise HTTPException(status_code=400, detail="外链必须是 http(s) 链接")

    source_type = String_or_empty(data.get("source_type")).strip() or (
        "server" if has_file else ("external" if source_url else "server")
    )
    if source_type not in ("server", "external"):
        raise HTTPException(status_code=400, detail="source_type 仅支持 server / external")
    if source_type == "server" and not has_file and not source_url and need_file_or_url:
        raise HTTPException(status_code=400, detail="请上传文件或填写网盘/官网外链")
    if source_type == "external" and not source_url:
        raise HTTPException(status_code=400, detail="外链模式必须填写链接")

    status = String_or_empty(data.get("status")).strip() or "published"
    if status not in _STATUS_ALLOWED:
        raise HTTPException(status_code=400, detail="状态仅支持 published / hidden")

    try:
        sort_order = int(data.get("sort_order") or 0)
    except (TypeError, ValueError):
        sort_order = 0

    return {
        "title": title,
        "version": version,
        "category": category,
        "description": description,
        "source_url": source_url,
        "source_type": source_type,
        "status": status,
        "sort_order": sort_order,
    }


def _insert_row(meta: Dict[str, Any], file: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO downloads
                    (title, version, category, description, source_url, source_type,
                     file_name, orig_name, file_size, sha256, sort_order, status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    meta["title"],
                    meta["version"],
                    meta["category"],
                    meta["description"],
                    meta["source_url"],
                    meta["source_type"],
                    (file or {}).get("file_name", ""),
                    (file or {}).get("orig_name", ""),
                    int((file or {}).get("file_size", 0)),
                    (file or {}).get("sha256", ""),
                    meta["sort_order"],
                    meta["status"],
                ),
            )
            new_id = cur.lastrowid
    finally:
        conn.close()
    row = _fetch_row(new_id)
    return _serialize(row or {}, admin=True)


def _assemble_and_store(upload_id: str, total_size: int, orig_name: str) -> Dict[str, Any]:
    """Concatenate verified chunks into files/ and return file info dict."""
    cdir = _chunks_dir(upload_id)
    if not os.path.isdir(cdir):
        raise HTTPException(status_code=404, detail="上传会话不存在或已过期")

    parts = sorted(
        (n for n in os.listdir(cdir) if n.endswith(".part")),
        key=lambda n: int(n.split(".")[0]),
    )
    if not parts:
        raise HTTPException(status_code=400, detail="没有已上传的分片")
    expected = list(range(len(parts)))
    got = [int(n.split(".")[0]) for n in parts]
    if got != expected:
        raise HTTPException(
            status_code=400,
            detail=f"分片不完整：缺少 {sorted(set(expected) - set(got))[:5]} 等",
        )

    total = 0
    sha = hashlib.sha256()
    ext = _safe_ext(orig_name)
    file_name = uuid.uuid4().hex + ext
    dest = os.path.join(FILES_DIR, file_name)
    os.makedirs(FILES_DIR, exist_ok=True)
    try:
        with open(dest, "wb") as out:
            for name in parts:
                with open(os.path.join(cdir, name), "rb") as src:
                    while True:
                        block = src.read(1024 * 1024)
                        if not block:
                            break
                        out.write(block)
                        sha.update(block)
                        total += len(block)
        if total_size and total != total_size:
            raise HTTPException(
                status_code=400,
                detail=f"分片总大小 {total} 与预期 {total_size} 不一致",
            )
    except HTTPException:
        try:
            os.remove(dest)
        except OSError:
            pass
        raise
    except OSError as exc:
        try:
            os.remove(dest)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail=f"写文件失败：{exc}")

    shutil.rmtree(cdir, ignore_errors=True)
    return {
        "file_name": file_name,
        "orig_name": _sanitize_display_name(orig_name, file_name),
        "file_size": total,
        "sha256": sha.hexdigest(),
    }


def _store_single_shot(data: bytes, orig_name: str) -> Dict[str, Any]:
    if len(data) > MAX_TOTAL_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"文件超过单次上传上限 {MAX_TOTAL_MB}MB，请走分片上传",
        )
    os.makedirs(FILES_DIR, exist_ok=True)
    ext = _safe_ext(orig_name)
    file_name = uuid.uuid4().hex + ext
    dest = os.path.join(FILES_DIR, file_name)
    with open(dest, "wb") as out:
        out.write(data)
    return {
        "file_name": file_name,
        "orig_name": _sanitize_display_name(orig_name, file_name),
        "file_size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


# ---------------------------------------------------------------------------
# public routes


@router.get("")
@router.get("/")
def downloads_list():
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM downloads WHERE status='published' ORDER BY sort_order ASC, id DESC"
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()
    return {"rev": 1, "items": [_serialize(r) for r in rows]}


@router.get("/{item_id}/file")
def downloads_file(item_id: int):
    row = _fetch_row(item_id)
    if not row or (row.get("status") or "") != "published":
        raise HTTPException(status_code=404, detail="下载不存在")
    file_name = String_or_empty(row.get("file_name"))
    if row.get("source_type") == "external" or not file_name:
        url = String_or_empty(row.get("source_url"))
        if url:
            return Response(status_code=302, headers={"Location": url})
        raise HTTPException(status_code=404, detail="该条目没有服务器文件")

    path = _stored_path(file_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="文件已丢失，请联系管理员")

    try:
        conn = _conn()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE downloads SET download_count=download_count+1 WHERE id=%s",
                (item_id,),
            )
        conn.close()
    except Exception:
        pass  # counting must never block the download

    download_name = _sanitize_display_name(row.get("orig_name") or "", file_name)
    if DOWNLOADS_XACCEL_PREFIX:
        return Response(
            status_code=200,
            headers={
                "X-Accel-Redirect": f"{DOWNLOADS_XACCEL_PREFIX.rstrip('/')}/{file_name}",
                "Content-Type": "application/octet-stream",
                "Content-Disposition": _content_disposition(download_name),
            },
        )
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=download_name,
    )


# ---------------------------------------------------------------------------
# admin routes


@router.get("/admin/list")
def admin_list(_admin: dict = Depends(_admin_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM downloads ORDER BY sort_order ASC, id DESC"
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()
    return {"rev": 1, "items": [_serialize(r, admin=True) for r in rows]}


@router.post("/admin")
def admin_create(body: Dict[str, Any], _admin: dict = Depends(_admin_user)):
    _ = _admin
    meta = _validate_meta(body, need_file_or_url=True)
    if meta["source_type"] != "external":
        raise HTTPException(status_code=400, detail="此接口用于外链条目；服务器文件请用上传接口")
    return _insert_row(meta, None)


@router.put("/admin/{item_id}")
def admin_update(item_id: int, body: Dict[str, Any], _admin: dict = Depends(_admin_user)):
    _ = _admin
    row = _fetch_row(item_id)
    if not row:
        raise HTTPException(status_code=404, detail="条目不存在")

    updates: Dict[str, Any] = {}
    merged = {k: (row.get(k) if k not in body else body[k]) for k in _FIELDS_EDITABLE}
    meta = _validate_meta(merged, need_file_or_url=False)
    updates.update(meta)
    if "sort_order" not in body and "status" not in body and not any(
        k in body for k in ("title", "version", "category", "description", "source_url", "source_type")
    ):
        raise HTTPException(status_code=400, detail="没有需要更新的字段")

    sets = ", ".join(f"{k}=%s" for k in updates)
    values = list(updates.values()) + [item_id]
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE downloads SET {sets} WHERE id=%s", values)
    finally:
        conn.close()
    return _serialize(_fetch_row(item_id) or {}, admin=True)


@router.delete("/admin/{item_id}")
def admin_delete(item_id: int, _admin: dict = Depends(_admin_user)):
    _ = _admin
    row = _fetch_row(item_id)
    if not row:
        raise HTTPException(status_code=404, detail="条目不存在")
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM downloads WHERE id=%s", (item_id,))
    finally:
        conn.close()
    file_name = String_or_empty(row.get("file_name"))
    if file_name:
        try:
            os.remove(_stored_path(file_name))
        except OSError:
            pass
    return {"ok": True, "id": item_id}


@router.post("/admin/upload")
def admin_upload_single(
    file: UploadFile = File(...),
    title: str = Form(""),
    version: str = Form(""),
    category: str = Form(""),
    description: str = Form(""),
    sort_order: int = Form(0),
    status: str = Form("published"),
    _admin: dict = Depends(_admin_user),
):
    _ = _admin
    orig_name = _sanitize_display_name(file.filename or "", "download")
    if not _safe_ext(orig_name) and "." not in orig_name:
        raise HTTPException(status_code=400, detail="文件需要带扩展名")
    data = file.file.read()
    info = _store_single_shot(data, orig_name)
    meta = _validate_meta(
        {
            "title": title or os.path.splitext(orig_name)[0],
            "version": version,
            "category": category,
            "description": description,
            "sort_order": sort_order,
            "status": status,
            "source_type": "server",
        },
        need_file_or_url=False,
        has_file=True,
    )
    return _insert_row(meta, info)


@router.post("/admin/upload/init")
def admin_upload_init(body: Dict[str, Any], _admin: dict = Depends(_admin_user)):
    _ = _admin
    file_name = _sanitize_display_name(String_or_empty(body.get("fileName")), "download")
    if not _safe_ext(file_name) and "." not in file_name:
        raise HTTPException(status_code=400, detail="文件需要带扩展名")
    try:
        total_size = int(body.get("totalSize") or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="totalSize 必须是整数")
    if total_size <= 0:
        raise HTTPException(status_code=400, detail="totalSize 必须大于 0")
    if total_size > MAX_TOTAL_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"文件超过上限 {MAX_TOTAL_MB}MB",
        )

    chunk_size = CHUNK_MB * 1024 * 1024
    total_chunks = (total_size + chunk_size - 1) // chunk_size
    if total_chunks > MAX_CHUNKS:
        raise HTTPException(status_code=400, detail=f"分片数超出上限 {MAX_CHUNKS}")

    upload_id = secrets.token_hex(16)
    os.makedirs(os.path.join(CHUNKS_DIR, upload_id), exist_ok=True)
    _sweep_stale_chunks()
    return {"uploadId": upload_id, "chunkSize": chunk_size, "totalChunks": total_chunks}


@router.post("/admin/upload/chunk")
async def admin_upload_chunk(
    uploadId: str = Form(...),
    index: int = Form(...),
    file: UploadFile = File(...),
    _admin: dict = Depends(_admin_user),
):
    _ = _admin
    cdir = _chunks_dir(uploadId)
    if index < 0 or index >= MAX_CHUNKS:
        raise HTTPException(status_code=400, detail="分片序号越界")
    if not os.path.isdir(cdir):
        raise HTTPException(status_code=404, detail="上传会话不存在，请重新初始化")
    dest = os.path.join(cdir, f"{index:06d}.part")
    size = 0
    try:
        with open(dest, "wb") as out:
            while True:
                block = await file.read(1024 * 1024)
                if not block:
                    break
                out.write(block)
                size += len(block)
    except OSError as exc:
        try:
            os.remove(dest)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail=f"分片写入失败：{exc}")
    return {"ok": True, "index": index, "size": size}


@router.post("/admin/upload/finalize")
def admin_upload_finalize(body: Dict[str, Any], _admin: dict = Depends(_admin_user)):
    _ = _admin
    upload_id = String_or_empty(body.get("uploadId"))
    cdir = _chunks_dir(upload_id)
    if not os.path.isdir(cdir):
        raise HTTPException(status_code=404, detail="上传会话不存在或已过期")

    try:
        total_size = int(body.get("totalSize") or 0)
    except (TypeError, ValueError):
        total_size = 0
    orig_name = _sanitize_display_name(String_or_empty(body.get("fileName")), "download")

    info = _assemble_and_store(upload_id, total_size, orig_name)
    meta_in = body.get("meta") if isinstance(body.get("meta"), dict) else {}
    meta = _validate_meta(
        {
            "title": meta_in.get("title") or os.path.splitext(orig_name)[0],
            "version": meta_in.get("version") or "",
            "category": meta_in.get("category") or "",
            "description": meta_in.get("description") or "",
            "sort_order": meta_in.get("sort_order") or 0,
            "status": meta_in.get("status") or "published",
            "source_type": "server",
        },
        need_file_or_url=False,
        has_file=True,
    )
    return _insert_row(meta, info)
