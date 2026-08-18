"""Cloud image tools: OCR, enhance, ID photo segment, advanced images→PDF."""

from __future__ import annotations

import asyncio
import base64
import os
import re
import secrets
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from tencent_image import (
    image_enhancement,
    images_to_pdf_bytes,
    ocr_general_text,
    ocr_table,
    segment_portrait,
    tencent_configured,
)
from dashscope_image_edit import (
    dashscope_image_edit_configured,
    edit_image_with_instruction,
    generate_image_from_text,
    resolve_edit_prompt,
)
from volc_ark_image import (
    edit_image_with_seedream,
    is_seedream_model,
    volc_ark_configured,
)
from minimax_image import (
    generate_minimax_image_to_image,
    generate_minimax_text_to_image,
    is_minimax_model,
    minimax_configured,
)
from ai_wallet import (
    require_can_afford,
    require_positive_balance,
    try_charge,
    user_price_cny,
    wallet_public,
)

# Instruct-edit model menu. Order = UI recommendation.
# priceCny1K / priceCny2K = vendor list (× AI_PRICE_MARKUP for users).
# Wan: flat per image (Beijing list). Qwen 3.0: flat; Qwen Pro: tiered (0.02 input + output).
INSTRUCT_OUTPUT_SIZES = ("1K", "2K")
INSTRUCT_EDIT_MODELS = (
    {
        "id": "wan2.6-image",
        "priceCny1K": 0.2,
        "priceCny2K": 0.2,
        "maxRefs": 4,
        "labelKey": "tools.instructEdit.modelWan26",
        "default": True,
    },
    {
        "id": "wan2.7-image",
        "priceCny1K": 0.2,
        "priceCny2K": 0.2,
        "maxRefs": 4,
        "labelKey": "tools.instructEdit.modelWan27",
    },
    {
        "id": "wan2.7-image-pro",
        "priceCny1K": 0.5,
        "priceCny2K": 0.5,
        "maxRefs": 4,
        "labelKey": "tools.instructEdit.modelWan27pro",
    },
    {
        "id": "qwen-image-3.0",
        "priceCny1K": 0.2,
        "priceCny2K": 0.2,
        "maxRefs": 3,
        "labelKey": "tools.instructEdit.modelQwen30",
    },
    {
        "id": "qwen-image-3.0-pro",
        "priceCny1K": 0.27,
        "priceCny2K": 0.52,
        "maxRefs": 3,
        "labelKey": "tools.instructEdit.modelQwen30pro",
    },
    {
        "id": "doubao-seedream-5-0-260128",
        "priceCny1K": 0.22,
        "priceCny2K": 0.22,
        "maxRefs": 4,
        "labelKey": "tools.instructEdit.modelSeedream50lite",
    },
)
INSTRUCT_EDIT_MODEL_IDS = {m["id"] for m in INSTRUCT_EDIT_MODELS}
INSTRUCT_EDIT_MODEL_BY_ID = {m["id"]: m for m in INSTRUCT_EDIT_MODELS}
INSTRUCT_COMPARE_MODELS = ("wan2.6-image", "wan2.7-image")
MAX_INSTRUCT_BATCH = 4
INSTRUCT_EDIT_GAP_SEC = float(os.environ.get("IMAGE_EDIT_GAP_SEC", "0.6"))
INSTRUCT_EDIT_RATE_RETRIES = int(os.environ.get("IMAGE_EDIT_RATE_RETRIES", "1"))
INSTRUCT_EDIT_RATE_BACKOFF = float(os.environ.get("IMAGE_EDIT_RATE_BACKOFF", "2.5"))
IMAGE_DEBUG = os.environ.get("IMAGE_DEBUG", "1").strip().lower() not in ("0", "false", "no", "off")

# Text-to-image models — price ascending; MiniMax Image-01 = default.
TEXT_TO_IMAGE_MODELS = (
    {
        "id": "image-01",
        "priceCny": 0.025,
        "labelKey": "tools.textToImage.modelMinimax01",
        "default": True,
    },
    {
        "id": "image-01-live",
        "priceCny": 0.025,
        "labelKey": "tools.textToImage.modelMinimax01live",
    },
    {
        "id": "z-image-turbo",
        "priceCny": 0.04,
        "labelKey": "tools.textToImage.modelZTurbo",
    },
    {
        "id": "wan2.7-image",
        "priceCny": 0.2,
        "labelKey": "tools.textToImage.modelWan27",
    },
    {
        "id": "wan2.7-image-pro",
        "priceCny": 0.5,
        "labelKey": "tools.textToImage.modelWan27pro",
    },
)
TEXT_TO_IMAGE_MODEL_IDS = {m["id"] for m in TEXT_TO_IMAGE_MODELS}

try:
    from general_cutout import rembg_available, segment_general
except Exception as exc:  # pragma: no cover — keep image tools up if rembg stack breaks
    print(f"[general_cutout] import failed: {exc}")

    def rembg_available() -> bool:
        return False

    def segment_general(image_bytes: bytes) -> bytes:
        raise HTTPException(
            status_code=503,
            detail="General cutout is not available (rembg not installed).",
        )

security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/image", tags=["image"])

MAX_UPLOAD = 8 * 1024 * 1024
MAX_IMAGES_PDF = 12
# Prefer app-local dir so results survive /tmp cleanup and are not lost across brief restarts.
_TMP_ENV = (os.environ.get("IMAGE_TMP_DIR") or "").strip()
TMP_IMAGE_DIR = (
    Path(_TMP_ENV)
    if _TMP_ENV
    else Path(__file__).resolve().parent / "var" / "image-results"
)
try:
    TMP_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    TMP_IMAGE_DIR = Path(tempfile.gettempdir()) / "toolbasecamp-image-results"
    TMP_IMAGE_DIR.mkdir(parents=True, exist_ok=True)

# Public gallery (mirrors MUSIC_PUBLIC_DIR pattern).
PUBLIC_IMAGE_DIR = Path(
    os.environ.get("IMAGE_PUBLIC_DIR")
    or "/var/lib/toolbasecamp/public-images"
)
try:
    PUBLIC_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    PUBLIC_IMAGE_DIR = Path(__file__).resolve().parent / "var" / "public-images"
    PUBLIC_IMAGE_DIR.mkdir(parents=True, exist_ok=True)

PUBLIC_THUMB_MAX_WIDTH = max(120, int(os.environ.get("PUBLIC_IMAGE_THUMB_WIDTH") or "400"))
PUBLIC_THUMB_JPEG_QUALITY = max(50, min(95, int(os.environ.get("PUBLIC_IMAGE_THUMB_QUALITY") or "75")))

CN_TZ = ZoneInfo("Asia/Shanghai")

# Daily per-user limits (login required). Admins (role=admin or ADMIN_EMAIL) are exempt.
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@zhengxiaohui.cn").lower()
ADMIN_PHONE = (os.environ.get("ADMIN_PHONE") or "").strip()
LIMITS = {
    "ocr_text": int(os.environ.get("IMAGE_LIMIT_OCR_TEXT", "30")),
    "ocr_table": int(os.environ.get("IMAGE_LIMIT_OCR_TABLE", "20")),
    "image_understand": int(os.environ.get("IMAGE_LIMIT_IMAGE_UNDERSTAND", "20")),
    "enhance": int(os.environ.get("IMAGE_LIMIT_ENHANCE", "20")),
    "id_photo": int(os.environ.get("IMAGE_LIMIT_ID_PHOTO", "10")),
    "general_cutout": int(os.environ.get("IMAGE_LIMIT_GENERAL_CUTOUT", "15")),
    "to_pdf": int(os.environ.get("IMAGE_LIMIT_TO_PDF", "20")),
    # instruct_edit / text_to_image: billed via user balance only (no daily count).
}


def _is_admin(user: Optional[dict]) -> bool:
    if not user:
        return False
    if user.get("role") == "admin":
        return True
    if (user.get("email") or "").lower() == ADMIN_EMAIL:
        return True
    if ADMIN_PHONE and (user.get("phone") or "").strip() == ADMIN_PHONE:
        return True
    return False


def _unlimited_quota() -> dict:
    return {"used": 0, "limit": 0, "remaining": 0, "unlimited": True}


def _parse_bool(value: Any, *, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    if s in ("1", "true", "yes", "on", "y"):
        return True
    if s in ("0", "false", "no", "off", "n", ""):
        return False
    return default


def _now_utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _format_created_at_cn(created: Any) -> str:
    """DB stores UTC naive; show Asia/Shanghai for the images hub."""
    if created is None:
        return ""
    if isinstance(created, str):
        s = created.strip().replace("T", " ")
        try:
            created = datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return s
    if not hasattr(created, "year"):
        return str(created)
    if getattr(created, "tzinfo", None) is not None:
        dt = created.astimezone(CN_TZ)
    else:
        dt = created.replace(tzinfo=timezone.utc).astimezone(CN_TZ)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _mask_phone(raw: str) -> str:
    s = re.sub(r"\D", "", str(raw or ""))
    if len(s) >= 11:
        return s[:3] + "****" + s[-4:]
    if len(s) >= 7:
        return s[:2] + "****" + s[-2:]
    if s:
        return "****"
    return "—"


def _creator_public(row: dict) -> dict:
    nick = str(row.get("creator_nickname") or "").strip()
    phone_raw = str(row.get("creator_phone") or "").strip()
    email = str(row.get("creator_email") or "").strip()
    if not nick:
        nick = phone_raw or email or ""
    phone = _mask_phone(phone_raw) if phone_raw else "—"
    return {
        "creatorNickname": nick or "—",
        "creatorPhone": phone,
    }


def _ensure_public_images_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS public_images (
            id VARCHAR(32) PRIMARY KEY,
            user_id BIGINT NOT NULL,
            prompt TEXT,
            model VARCHAR(96) NOT NULL DEFAULT '',
            source VARCHAR(32) NOT NULL DEFAULT '',
            content_type VARCHAR(64) NOT NULL DEFAULT 'image/png',
            file_ext VARCHAR(8) NOT NULL DEFAULT '.png',
            file_name VARCHAR(80) NOT NULL,
            is_public TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL,
            INDEX idx_pubimg_public_created (is_public, created_at),
            INDEX idx_pubimg_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )


def _public_image_path(file_name: str) -> Path:
    name = Path(str(file_name or "")).name
    if not name or name != str(file_name) or ".." in name:
        raise HTTPException(status_code=400, detail="Invalid image file")
    path = (PUBLIC_IMAGE_DIR / name).resolve()
    if not str(path).startswith(str(PUBLIC_IMAGE_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid image file")
    return path


def _public_thumb_file_name(image_id: str) -> str:
    iid = "".join(ch for ch in str(image_id or "") if ch.isalnum())
    if len(iid) < 16:
        raise HTTPException(status_code=400, detail="Invalid image id")
    return f"{iid}_thumb.jpg"


def _public_thumb_path(image_id: str) -> Path:
    return _public_image_path(_public_thumb_file_name(image_id))


def _make_public_thumbnail_bytes(data: bytes) -> Optional[bytes]:
    """Grid preview JPEG (~400px wide)."""
    if not data:
        return None
    try:
        from io import BytesIO

        from PIL import Image

        im = Image.open(BytesIO(data))
        if im.mode in ("RGBA", "P", "LA"):
            im = im.convert("RGB")
        w, h = im.size
        max_w = PUBLIC_THUMB_MAX_WIDTH
        if w > max_w:
            nh = max(1, int(round(h * max_w / w)))
            im = im.resize((max_w, nh), Image.Resampling.LANCZOS)
        buf = BytesIO()
        im.save(buf, format="JPEG", quality=PUBLIC_THUMB_JPEG_QUALITY, optimize=True)
        out = buf.getvalue()
        return out if out else None
    except Exception:
        return None


def _write_public_thumbnail(image_id: str, source_data: bytes) -> bool:
    thumb = _make_public_thumbnail_bytes(source_data)
    if not thumb:
        return False
    try:
        path = _public_thumb_path(image_id)
        path.write_bytes(thumb)
        return True
    except Exception:
        return False


def _ensure_public_thumbnail(image_id: str, full_path: Path) -> Path:
    """Return thumb path, generating from full image if missing."""
    thumb_path = _public_thumb_path(image_id)
    if thumb_path.is_file():
        return thumb_path
    if full_path.is_file():
        _write_public_thumbnail(image_id, full_path.read_bytes())
    return thumb_path


def _insert_public_image(
    *,
    image_id: str,
    user_id: int,
    prompt: str,
    model: str,
    source: str,
    content_type: str,
    file_ext: str,
    file_name: str,
) -> None:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_public_images_schema(cur)
            cur.execute(
                """
                INSERT INTO public_images (
                    id, user_id, prompt, model, source,
                    content_type, file_ext, file_name, is_public, created_at
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, 1, %s
                )
                """,
                (
                    image_id,
                    int(user_id),
                    prompt or "",
                    (model or "")[:96],
                    (source or "")[:32],
                    content_type or "image/png",
                    file_ext or ".png",
                    file_name,
                    _now_utc_naive().strftime("%Y-%m-%d %H:%M:%S"),
                ),
            )
    finally:
        conn.close()


def _publish_public_image(
    *,
    user_id: int,
    prompt: str,
    model: str,
    source: str,
    data: bytes,
    content_type: str,
) -> dict:
    """Persist bytes to public gallery. Returns publicId / URL fields."""
    if not data:
        raise HTTPException(status_code=500, detail="Empty image for publish")
    image_id = secrets.token_hex(16)
    ctype = content_type or "image/png"
    ext = _tmp_suffix(ctype)
    file_name = f"{image_id}{ext}"
    path = PUBLIC_IMAGE_DIR / file_name
    path.write_bytes(data)
    _write_public_thumbnail(image_id, data)
    try:
        _insert_public_image(
            image_id=image_id,
            user_id=int(user_id),
            prompt=prompt or "",
            model=model or "",
            source=source or "",
            content_type=ctype,
            file_ext=ext,
            file_name=file_name,
        )
    except Exception:
        try:
            path.unlink(missing_ok=True)
            _public_thumb_path(image_id).unlink(missing_ok=True)
        except Exception:
            pass
        raise
    return {
        "publicId": image_id,
        "publicUrl": f"/image/public/{image_id}",
        "publicDownloadUrl": f"/image/public/{image_id}?download=1",
        "publicThumbnailUrl": f"/pubimg/{image_id}_thumb.jpg",
    }


def _ascii_image_filename(stem: str, ext: str) -> str:
    e = str(ext or ".png")
    if not e.startswith("."):
        e = "." + e
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", str(stem or "ai-image")).strip("-._") or "ai-image"
    return f"{safe[:80]}{e}"

ENHANCE_TASKS = {
    1: "cutEnhance",
    2: "curvatureCorrection",
    202: "blackAndWhite",
    204: "brightenMode",
    205: "grayScale",
    207: "inkSaving",
    208: "textSharpening",
    301: "removeMoire",
    302: "removeShadow",
    303: "removeBlur",
    304: "removeOverexposure",
}


def _wire(get_conn, require_db, get_current_user, require_admin=None, get_optional_user=None):
    router.get_conn = get_conn  # type: ignore[attr-defined]
    router.require_db = require_db  # type: ignore[attr-defined]
    router.get_current_user = get_current_user  # type: ignore[attr-defined]
    router.require_admin = require_admin  # type: ignore[attr-defined]
    router.get_optional_user = get_optional_user  # type: ignore[attr-defined]


def _user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    return router.get_current_user(creds)  # type: ignore[attr-defined]


def _optional_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    fn = getattr(router, "get_optional_user", None)
    if fn:
        return fn(creds)
    return None


def _admin_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    user = router.get_current_user(creds)  # type: ignore[attr-defined]
    req = getattr(router, "require_admin", None)
    if req:
        req(user)
    elif not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def _conn():
    router.require_db()  # type: ignore[attr-defined]
    return router.get_conn()  # type: ignore[attr-defined]


def _tmp_suffix(ctype: str) -> str:
    low = (ctype or "").lower()
    if "jpeg" in low or "jpg" in low:
        return ".jpg"
    if "webp" in low:
        return ".webp"
    return ".png"


def _save_tmp_image(data: bytes, ctype: str) -> str:
    name = secrets.token_hex(16) + _tmp_suffix(ctype)
    path = TMP_IMAGE_DIR / name
    path.write_bytes(data)
    return name


def _compress_for_mobile(data: bytes, ctype: str) -> tuple[bytes, str]:
    """Smaller JPEG for mobile light-response downloads."""
    try:
        from io import BytesIO

        from PIL import Image

        im = Image.open(BytesIO(data))
        if im.mode in ("RGBA", "P", "LA"):
            im = im.convert("RGB")
        buf = BytesIO()
        im.save(buf, format="JPEG", quality=85, optimize=True)
        out = buf.getvalue()
        if out and len(out) < len(data):
            return out, "image/jpeg"
    except Exception:
        pass
    return data, ctype or "image/png"


def _compress_for_public(data: bytes, ctype: str) -> tuple[bytes, str]:
    """Aggressive JPEG shrink for public gallery (Wan PNG can be 10MB+)."""
    try:
        from io import BytesIO

        from PIL import Image

        im = Image.open(BytesIO(data))
        if im.mode in ("RGBA", "P", "LA"):
            im = im.convert("RGB")
        # Cap long edge so 2K/4K AI outputs stay reasonable on the wall.
        max_edge = 2048
        w, h = im.size
        if max(w, h) > max_edge:
            if w >= h:
                nh = max(1, int(round(h * max_edge / w)))
                im = im.resize((max_edge, nh), Image.Resampling.LANCZOS)
            else:
                nw = max(1, int(round(w * max_edge / h)))
                im = im.resize((nw, max_edge), Image.Resampling.LANCZOS)
        best = data
        best_ctype = ctype or "image/png"
        for quality in (85, 75, 65, 55):
            buf = BytesIO()
            im.save(buf, format="JPEG", quality=quality, optimize=True)
            out = buf.getvalue()
            if not out:
                continue
            if len(out) < len(best):
                best, best_ctype = out, "image/jpeg"
            if len(out) <= 2 * 1024 * 1024:
                return out, "image/jpeg"
        return best, best_ctype
    except Exception:
        return data, ctype or "image/png"


@router.get("/tmp/{name}")
def image_tmp(name: str):
    safe = os.path.basename(name or "")
    path = TMP_IMAGE_DIR / safe
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(str(path))


@router.get("/public/list")
def image_public_list(
    limit: int = 50,
    offset: int = 0,
    viewer: Optional[dict] = Depends(_optional_user),
):
    lim = max(1, min(100, int(limit or 50)))
    off = max(0, int(offset or 0))
    can_admin = _is_admin(viewer) if viewer else False
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_public_images_schema(cur)
            cur.execute(
                """
                SELECT i.id, i.prompt, i.model, i.source, i.content_type,
                       i.created_at, i.file_name, i.user_id,
                       u.nickname AS creator_nickname,
                       u.phone AS creator_phone,
                       u.email AS creator_email
                FROM public_images i
                LEFT JOIN users u ON u.id = i.user_id
                WHERE i.is_public=1
                ORDER BY i.created_at DESC
                LIMIT %s OFFSET %s
                """,
                (lim, off),
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()
    items = []
    for row in rows:
        iid = str(row.get("id") or "")
        file_name = str(row.get("file_name") or (iid + ".png"))
        try:
            path = _public_image_path(file_name)
        except HTTPException:
            continue
        if not path.is_file():
            continue
        creator = _creator_public(row)
        prompt = (row.get("prompt") or "").strip()
        items.append(
            {
                "id": iid,
                "prompt": prompt[:400],
                "model": row.get("model") or "",
                "source": row.get("source") or "",
                "contentType": row.get("content_type") or "image/png",
                "createdAt": _format_created_at_cn(row.get("created_at")),
                "creatorNickname": creator["creatorNickname"],
                "creatorPhone": creator["creatorPhone"],
                "imageUrl": f"/image/public/{iid}",
                "thumbnailUrl": f"/pubimg/{iid}_thumb.jpg",
                "downloadUrl": f"/image/public/{iid}?download=1",
            }
        )
    return {"success": True, "items": items, "limit": lim, "offset": off, "canAdmin": can_admin}


@router.post("/public/publish")
async def image_public_publish(
    prompt: str = Form(""),
    model: str = Form(""),
    source: str = Form(""),
    file: UploadFile = File(...),
    user: dict = Depends(_user),
):
    """Publish an already-generated image to the public Images hub (no re-generation)."""
    # AI outputs (esp. Wan PNG) can exceed the normal 8MB tool upload cap; accept
    # up to 25MB then compress for the public wall.
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image")
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image is too large (max 8MB)")
    ctype = (getattr(file, "content_type", None) or "").strip() or "image/png"
    if ctype and not ctype.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")
    if not ctype.startswith("image/"):
        ctype = "image/png"
    src = (source or "").strip() or "manual"
    if src not in ("text_to_image", "instruct_edit", "manual"):
        src = "manual"
    # Always shrink large AI PNGs for the public gallery.
    if len(raw) > 1024 * 1024:
        raw, ctype = _compress_for_public(raw, ctype)
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(status_code=400, detail="Image is too large (max 8MB)")
    pub = _publish_public_image(
        user_id=int(user["id"]),
        prompt=(prompt or "").strip()[:2000],
        model=(model or "").strip()[:96],
        source=src,
        data=raw,
        content_type=ctype,
    )
    return {"success": True, **pub}


@router.delete("/public/{image_id}")
def image_public_delete(image_id: str, admin: dict = Depends(_admin_user)):
    iid = "".join(ch for ch in str(image_id or "") if ch.isalnum())
    if len(iid) < 16:
        raise HTTPException(status_code=404, detail="Image not found")
    conn = _conn()
    file_name = ""
    try:
        with conn.cursor() as cur:
            _ensure_public_images_schema(cur)
            cur.execute(
                """
                SELECT file_name FROM public_images
                WHERE id=%s AND is_public=1
                LIMIT 1
                """,
                (iid,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Image not found")
            file_name = str(row.get("file_name") or "")
            cur.execute("DELETE FROM public_images WHERE id=%s", (iid,))
    finally:
        conn.close()
    if file_name:
        try:
            path = _public_image_path(file_name)
            if path.is_file():
                path.unlink()
        except Exception:
            pass
    try:
        thumb = _public_thumb_path(iid)
        if thumb.is_file():
            thumb.unlink()
    except Exception:
        pass
    return {"success": True, "deletedId": iid}


@router.get("/public/{image_id}")
def image_public_file(image_id: str, download: int = 0, thumb: int = 0):
    iid = "".join(ch for ch in str(image_id or "") if ch.isalnum())
    if len(iid) < 16:
        raise HTTPException(status_code=404, detail="Image not found")
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_public_images_schema(cur)
            cur.execute(
                """
                SELECT file_name, content_type, file_ext
                FROM public_images
                WHERE id=%s AND is_public=1
                LIMIT 1
                """,
                (iid,),
            )
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")
    path = _public_image_path(str(row.get("file_name") or ""))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image file missing")
    if thumb and not download:
        thumb_path = _ensure_public_thumbnail(iid, path)
        if thumb_path.is_file():
            filename = _ascii_image_filename(f"ai-image-{iid}-thumb", ".jpg")
            headers = {
                "Content-Disposition": f'inline; filename="{filename}"',
                "Cache-Control": "public, max-age=86400",
            }
            return FileResponse(thumb_path, media_type="image/jpeg", headers=headers)
    ext = row.get("file_ext") or path.suffix or ".png"
    filename = _ascii_image_filename(f"ai-image-{iid}", ext)
    headers = {
        "Content-Disposition": (
            f'{"attachment" if download else "inline"}; filename="{filename}"'
        ),
    }
    if not download:
        headers["Cache-Control"] = "public, max-age=86400"
    return FileResponse(
        path,
        media_type=str(row.get("content_type") or "image/png"),
        headers=headers,
    )


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def ensure_image_quota_table(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS image_tool_quotas (
            user_id BIGINT NOT NULL,
            action_type VARCHAR(32) NOT NULL,
            usage_date CHAR(10) NOT NULL,
            usage_count INT NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, action_type, usage_date),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )


def _consume_quota(user: dict, action: str, amount: int = 1) -> dict:
    if amount < 1:
        amount = 1
    if _is_admin(user):
        return _unlimited_quota()
    user_id = int(user["id"])
    max_count = LIMITS.get(action, 0)
    if max_count <= 0:
        raise HTTPException(status_code=503, detail="This action is disabled")
    today = _today()
    conn = _conn()
    try:
        with conn.cursor() as cur:
            ensure_image_quota_table(cur)
            cur.execute(
                """
                SELECT usage_count FROM image_tool_quotas
                WHERE user_id=%s AND action_type=%s AND usage_date=%s
                """,
                (user_id, action, today),
            )
            row = cur.fetchone()
            current = int(row["usage_count"]) if row else 0
            if current + amount > max_count:
                raise HTTPException(
                    status_code=429,
                    detail="Daily limit reached. Please try again tomorrow.",
                )
            if row:
                cur.execute(
                    """
                    UPDATE image_tool_quotas SET usage_count = usage_count + %s
                    WHERE user_id=%s AND action_type=%s AND usage_date=%s
                    """,
                    (amount, user_id, action, today),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO image_tool_quotas (user_id, action_type, usage_date, usage_count)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (user_id, action, today, amount),
                )
            used = current + amount
        return {"used": used, "limit": max_count, "remaining": max(0, max_count - used)}
    finally:
        conn.close()


async def _read_upload(file: UploadFile) -> bytes:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=400, detail="Image is too large (max 8MB)")
    ctype = (file.content_type or "").lower()
    if ctype and not ctype.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")
    return data


def _require_tencent():
    if not tencent_configured():
        raise HTTPException(
            status_code=503,
            detail="Tencent Cloud is not configured (TENCENT_SECRET_ID / TENCENT_SECRET_KEY).",
        )


def _wallet_for(user: dict) -> dict:
    admin = _is_admin(user)
    conn = _conn()
    try:
        return wallet_public(conn, user, is_admin=admin)
    finally:
        conn.close()


def _assert_can_afford(user: dict, list_price: float) -> None:
    if _is_admin(user):
        return
    conn = _conn()
    try:
        require_can_afford(conn, int(user["id"]), list_price)
    finally:
        conn.close()


def _charge_success(user: dict, list_price: float, *, reason: str, meta: dict) -> Optional[float]:
    if _is_admin(user):
        return None
    charge = user_price_cny(list_price)
    conn = _conn()
    try:
        new_bal = try_charge(
            conn,
            int(user["id"]),
            charge,
            reason=reason,
            meta={**meta, "listPriceCny": float(list_price), "chargedCny": float(charge)},
        )
        if new_bal is None:
            raise HTTPException(
                status_code=402,
                detail="Insufficient balance. Please top up.",
            )
        return float(new_bal)
    finally:
        conn.close()


def _quota_snapshot(user: dict, action: str) -> dict:
    if _is_admin(user):
        return _unlimited_quota()
    today = _today()
    lim = LIMITS.get(action, 0)
    conn = _conn()
    try:
        with conn.cursor() as cur:
            ensure_image_quota_table(cur)
            cur.execute(
                """
                SELECT usage_count FROM image_tool_quotas
                WHERE user_id=%s AND action_type=%s AND usage_date=%s
                """,
                (int(user["id"]), action, today),
            )
            row = cur.fetchone()
            used = int(row["usage_count"]) if row else 0
        return {"used": used, "limit": lim, "remaining": max(0, lim - used)}
    finally:
        conn.close()


def _assert_quota_remaining(user: dict, action: str) -> None:
    if _is_admin(user):
        return
    snap = _quota_snapshot(user, action)
    if int(snap.get("remaining") or 0) < 1:
        raise HTTPException(
            status_code=429,
            detail="Daily limit reached. Please try again tomorrow.",
        )


@router.get("/status")
def image_status(user: dict = Depends(_user)):
    admin = _is_admin(user)
    wallet = _wallet_for(user)
    if admin:
        items = [
            {"action": action, "used": 0, "limit": 0, "remaining": 0, "unlimited": True}
            for action in LIMITS
        ]
        return {
            "tencentConfigured": tencent_configured(),
            "generalCutoutAvailable": rembg_available(),
            "instructEditConfigured": instruct_edit_configured(),
            "instructEditModels": list(INSTRUCT_EDIT_MODELS),
            "instructEditOutputSizes": list(INSTRUCT_OUTPUT_SIZES),
            "instructEditPresets": [
                {"id": "manga_to_real", "labelKey": "tools.instructEdit.presetMangaToReal"},
                {"id": "real_to_manga", "labelKey": "tools.instructEdit.presetRealToManga"},
                {"id": "restore_old_photo", "labelKey": "tools.instructEdit.presetRestoreOldPhoto"},
                {"id": "id_photo_white", "labelKey": "tools.instructEdit.presetIdPhotoWhite"},
                {"id": "remove_watermark", "labelKey": "tools.instructEdit.presetRemoveWatermark"},
                {"id": "beauty_light", "labelKey": "tools.instructEdit.presetBeautyLight"},
                {"id": "slim_body", "labelKey": "tools.instructEdit.presetSlimBody"},
                {"id": "colorize_bw", "labelKey": "tools.instructEdit.presetColorizeBw"},
                {"id": "product_white_bg", "labelKey": "tools.instructEdit.presetProductWhiteBg"},
                {"id": "lineart_colorize", "labelKey": "tools.instructEdit.presetLineartColorize"},
                {"id": "expand_edges", "labelKey": "tools.instructEdit.presetExpandEdges"},
            ],
            "instructEditMaxBatch": MAX_INSTRUCT_BATCH,
            "textToImageConfigured": dashscope_image_edit_configured(),
            "textToImageModels": list(TEXT_TO_IMAGE_MODELS),
            "isAdmin": True,
            "aiWallet": wallet,
            "quotas": items,
            "enhanceTasks": [
                {"taskType": k, "id": v} for k, v in sorted(ENHANCE_TASKS.items())
            ],
        }
    today = _today()
    conn = _conn()
    try:
        with conn.cursor() as cur:
            ensure_image_quota_table(cur)
            cur.execute(
                """
                SELECT action_type, usage_count FROM image_tool_quotas
                WHERE user_id=%s AND usage_date=%s
                """,
                (user["id"], today),
            )
            rows = {r["action_type"]: int(r["usage_count"]) for r in (cur.fetchall() or [])}
        items = []
        for action, limit in LIMITS.items():
            used = rows.get(action, 0)
            items.append(
                {
                    "action": action,
                    "used": used,
                    "limit": limit,
                    "remaining": max(0, limit - used),
                }
            )
        return {
            "tencentConfigured": tencent_configured(),
            "generalCutoutAvailable": rembg_available(),
            "instructEditConfigured": instruct_edit_configured(),
            "instructEditModels": list(INSTRUCT_EDIT_MODELS),
            "instructEditOutputSizes": list(INSTRUCT_OUTPUT_SIZES),
            "instructEditPresets": [
                {"id": "manga_to_real", "labelKey": "tools.instructEdit.presetMangaToReal"},
                {"id": "real_to_manga", "labelKey": "tools.instructEdit.presetRealToManga"},
                {"id": "restore_old_photo", "labelKey": "tools.instructEdit.presetRestoreOldPhoto"},
                {"id": "id_photo_white", "labelKey": "tools.instructEdit.presetIdPhotoWhite"},
                {"id": "remove_watermark", "labelKey": "tools.instructEdit.presetRemoveWatermark"},
                {"id": "beauty_light", "labelKey": "tools.instructEdit.presetBeautyLight"},
                {"id": "slim_body", "labelKey": "tools.instructEdit.presetSlimBody"},
                {"id": "colorize_bw", "labelKey": "tools.instructEdit.presetColorizeBw"},
                {"id": "product_white_bg", "labelKey": "tools.instructEdit.presetProductWhiteBg"},
                {"id": "lineart_colorize", "labelKey": "tools.instructEdit.presetLineartColorize"},
                {"id": "expand_edges", "labelKey": "tools.instructEdit.presetExpandEdges"},
            ],
            "instructEditMaxBatch": MAX_INSTRUCT_BATCH,
            "textToImageConfigured": dashscope_image_edit_configured(),
            "textToImageModels": list(TEXT_TO_IMAGE_MODELS),
            "isAdmin": False,
            "aiWallet": wallet,
            "quotas": items,
            "enhanceTasks": [
                {"taskType": k, "id": v} for k, v in sorted(ENHANCE_TASKS.items())
            ],
        }
    finally:
        conn.close()


@router.post("/ocr-text")
async def api_ocr_text(
    file: UploadFile = File(...),
    user: dict = Depends(_user),
):
    _require_tencent()
    quota = _consume_quota(user, "ocr_text")
    data = await _read_upload(file)
    text = ocr_general_text(data)
    return {"text": text, "quota": quota}


@router.post("/ocr-table")
async def api_ocr_table(
    file: UploadFile = File(...),
    user: dict = Depends(_user),
):
    _require_tencent()
    quota = _consume_quota(user, "ocr_table")
    data = await _read_upload(file)
    result = ocr_table(data)
    result["quota"] = quota
    return result


_UNDERSTAND_MODES = ("brief", "detailed", "t2i_prompt")


def _understand_prompt(mode: str, locale: str) -> str:
    zh = locale.startswith("zh")
    if mode == "t2i_prompt":
        if zh:
            return (
                "根据这张图片，写一段适合文生图模型的提示词（中英文均可，优先中文）。"
                "只输出提示词本身，不要编号、标题或解释。"
                "覆盖主体、构图、风格、光线与氛围，约 40–120 字。"
            )
        return (
            "Based on this image, write one text-to-image prompt. "
            "Output only the prompt, no titles or explanations. "
            "Cover subject, composition, style, lighting and mood (about 40–120 words)."
        )
    if mode == "detailed":
        if zh:
            return (
                "请详细解读这张图片：主体与人物、场景环境、动作关系、颜色与光线、"
                "可见文字（如有）、风格与氛围。用中文分段说明，不要编造图中不存在的细节。"
            )
        return (
            "Describe this image in detail: subjects/people, setting, actions, colors/lighting, "
            "visible text if any, style and mood. Use clear paragraphs. Do not invent details."
        )
    # brief
    if zh:
        return (
            "用 2–4 句中文简要说明这张图的内容（主体、场景、氛围）。"
            "不要编造图中没有的信息，不要用 markdown。"
        )
    return (
        "In 2–4 sentences, briefly describe this image (subject, scene, mood). "
        "Do not invent details. No markdown."
    )


@router.post("/image-understand")
async def api_image_understand(
    file: UploadFile = File(...),
    mode: str = Form("brief"),
    locale: str = Form("zh-CN"),
    user: dict = Depends(_user),
):
    """Describe an image with Qwen VL (not OCR — understanding / caption / T2I prompt)."""
    from recipe_ai import (
        DASHSCOPE_API_KEY,
        QWEN_VL_MODEL,
        _call_qwen,
        _image_data_url,
    )

    if not DASHSCOPE_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="DashScope is not configured (DASHSCOPE_API_KEY).",
        )
    mid = (mode or "brief").strip().lower()
    if mid not in _UNDERSTAND_MODES:
        mid = "brief"
    loc = (locale or "zh-CN").strip() or "zh-CN"
    quota = _consume_quota(user, "image_understand")
    data = await _read_upload(file)
    ctype = (getattr(file, "content_type", None) or "image/jpeg").split(";")[0].strip()
    if not ctype.startswith("image/"):
        ctype = "image/jpeg"
    data_url = _image_data_url(data, ctype)
    prompt = _understand_prompt(mid, loc)
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": prompt},
            ],
        }
    ]
    try:
        text = await _call_qwen(
            messages,
            model=QWEN_VL_MODEL,
            use_json_mode=False,
            max_tokens=1200 if mid == "detailed" else 600,
            temperature=0.4,
            timeout=90.0,
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[image-understand] {exc}")
        raise HTTPException(status_code=502, detail=f"Image understand failed: {exc}") from exc
    out = (text or "").strip()
    if not out:
        raise HTTPException(status_code=502, detail="Model returned empty description")
    return {
        "text": out,
        "mode": mid,
        "model": QWEN_VL_MODEL,
        "quota": quota,
    }


@router.post("/enhance")
async def api_enhance(
    file: UploadFile = File(...),
    task_type: int = Form(...),
    user: dict = Depends(_user),
):
    _require_tencent()
    if int(task_type) not in ENHANCE_TASKS:
        raise HTTPException(status_code=400, detail="Invalid enhance task type")
    quota = _consume_quota(user, "enhance")
    data = await _read_upload(file)
    out = image_enhancement(data, int(task_type))
    return {
        "imageBase64": base64.b64encode(out).decode("ascii"),
        "contentType": "image/png",
        "quota": quota,
        "taskType": int(task_type),
    }


@router.post("/id-photo/segment")
async def api_id_photo_segment(
    file: UploadFile = File(...),
    user: dict = Depends(_user),
):
    _require_tencent()
    quota = _consume_quota(user, "id_photo")
    data = await _read_upload(file)
    out = segment_portrait(data)
    return {
        "imageBase64": base64.b64encode(out).decode("ascii"),
        "contentType": "image/png",
        "quota": quota,
    }


@router.post("/general-cutout/segment")
async def api_general_cutout_segment(
    file: UploadFile = File(...),
    user: dict = Depends(_user),
):
    if not rembg_available():
        raise HTTPException(
            status_code=503,
            detail="General cutout is not available (rembg not installed).",
        )
    quota = _consume_quota(user, "general_cutout")
    data = await _read_upload(file)
    out = segment_general(data)
    return {
        "imageBase64": base64.b64encode(out).decode("ascii"),
        "contentType": "image/png",
        "quota": quota,
    }


def _resolve_instruct_models(
    model: Optional[str],
    models: Optional[List[str]],
    compare: bool,
) -> list[str]:
    raw: list[str] = []
    if models:
        for item in models:
            if not item:
                continue
            for part in str(item).replace(";", ",").split(","):
                p = part.strip()
                if p:
                    raw.append(p)
    if not raw and compare:
        raw = list(INSTRUCT_COMPARE_MODELS)
    if not raw and model:
        raw = [(model or "").strip()]
    if not raw:
        raw = ["wan2.6-image"]
    out: list[str] = []
    seen: set[str] = set()
    for mid in raw:
        if mid not in INSTRUCT_EDIT_MODEL_IDS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported model '{mid}'. Use one of: {', '.join(sorted(INSTRUCT_EDIT_MODEL_IDS))}",
            )
        if mid in seen:
            continue
        seen.add(mid)
        out.append(mid)
    return out


def _normalize_output_size(raw: Optional[str]) -> str:
    s = (raw or "2K").strip().upper()
    return s if s in INSTRUCT_OUTPUT_SIZES else "2K"


def _billable_output_size(model_id: str, output_size: str) -> str:
    """User-selected size; Seedream API minimum is 2k — bill 2K when UI says 1K."""
    size = _normalize_output_size(output_size)
    if is_seedream_model(model_id) and size == "1K":
        return "2K"
    return size


def _price_for(model_id: str, output_size: str = "2K") -> float:
    m = INSTRUCT_EDIT_MODEL_BY_ID.get(model_id)
    if not m:
        return 0.0
    size = _billable_output_size(model_id, output_size)
    key = "priceCny1K" if size == "1K" else "priceCny2K"
    return float(m.get(key) or m.get("priceCny2K") or 0.0)


def _max_refs_for_model(model_id: str) -> int:
    m = INSTRUCT_EDIT_MODEL_BY_ID.get(model_id)
    if not m:
        return 3
    return int(m.get("maxRefs") or 3)


def _max_refs_for_models(model_ids: list[str]) -> int:
    if not model_ids:
        return MAX_INSTRUCT_BATCH
    return min(_max_refs_for_model(mid) for mid in model_ids)


def instruct_edit_configured() -> bool:
    return dashscope_image_edit_configured() or volc_ark_configured()


def _model_provider_ready(model_id: str) -> None:
    """Raise 503 if the backend for this model id is not configured."""
    if is_minimax_model(model_id):
        if not minimax_configured():
            raise HTTPException(
                status_code=503,
                detail="MiniMax is not configured (MINIMAX_API_KEY).",
            )
        return
    if is_seedream_model(model_id):
        if not volc_ark_configured():
            raise HTTPException(
                status_code=503,
                detail="Volcengine Ark is not configured (VOLC_ARK_API_KEY).",
            )
        return
    if not dashscope_image_edit_configured():
        raise HTTPException(
            status_code=503,
            detail="DashScope is not configured (DASHSCOPE_API_KEY).",
        )


async def _run_instruct_edit(
    refs: list[bytes],
    text: str,
    *,
    model: str,
    output_size: str = "2K",
) -> tuple[bytes, str]:
    _model_provider_ready(model)
    size = _normalize_output_size(output_size)
    if is_minimax_model(model):
        # MiniMax only uses the first reference image.
        return await generate_minimax_image_to_image(
            refs[0],
            text,
            model=model,
            size_preset="square",
        )
    if is_seedream_model(model):
        return await edit_image_with_seedream(
            refs[0],
            text,
            model=model,
            images=refs if len(refs) > 1 else None,
            output_size=size,
        )
    return await edit_image_with_instruction(
        refs[0],
        text,
        model=model,
        images=refs if len(refs) > 1 else None,
        output_size=size,
    )


def _exc_detail(exc: BaseException) -> str:
    detail = getattr(exc, "detail", None)
    if detail is None:
        return str(exc)
    return str(detail)


@router.post("/instruct-edit")
async def api_instruct_edit(
    prompt: str = Form(""),
    preset: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    models: List[str] = Form(default=[]),
    compare: str = Form("0"),
    ref_mode: str = Form("single"),
    output_size: str = Form("2K"),
    public: str = Form("0"),
    file: Optional[UploadFile] = File(None),
    files: List[UploadFile] = File(default=[]),
    request: Request = None,
    user: dict = Depends(_user),
):
    t0 = time.perf_counter()
    req_user_id = int(user["id"])
    is_public = _parse_bool(public, default=False)
    light_response = False
    if request is not None:
        hdr = (request.headers.get("X-TB-Light-Response") or "").strip().lower()
        light_response = hdr in ("1", "true", "yes", "on")
    if not instruct_edit_configured():
        raise HTTPException(
            status_code=503,
            detail="Image edit is not configured (DASHSCOPE_API_KEY or VOLC_ARK_API_KEY).",
        )
    text = resolve_edit_prompt(prompt, preset)
    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="Please enter an edit instruction or choose a style preset.",
        )
    mode = (ref_mode or "single").strip().lower()
    if mode not in ("single", "multi"):
        mode = "single"
    out_size = _normalize_output_size(output_size)
    uploads: list[UploadFile] = []
    if files:
        uploads.extend([f for f in files if f is not None and getattr(f, "filename", None)])
    if file is not None and getattr(file, "filename", None):
        uploads.append(file)
    if not uploads:
        raise HTTPException(status_code=400, detail="No images")
    if len(uploads) > MAX_INSTRUCT_BATCH:
        raise HTTPException(
            status_code=400,
            detail=f"Too many images (max {MAX_INSTRUCT_BATCH})",
        )
    if mode == "multi" and len(uploads) < 2:
        raise HTTPException(
            status_code=400,
            detail="Multi-reference mode needs at least 2 images",
        )

    do_compare = str(compare or "").strip().lower() in ("1", "true", "yes", "on")
    model_ids = _resolve_instruct_models(model, models, do_compare)
    if IMAGE_DEBUG:
        print(
            "[instruct-edit] start",
            {
                "userId": req_user_id,
                "uploadCount": len(uploads),
                "refMode": mode,
                "models": model_ids,
                "compare": do_compare,
                "preset": (preset or "").strip() or None,
                "promptLen": len(text),
            },
            flush=True,
        )
    blobs: list[bytes] = []
    for up in uploads:
        blobs.append(await _read_upload(up))

    # Multi-ref limits: min(maxRefs) across selected models (Wan 4, Qwen 3, Seedream 4).
    max_refs = _max_refs_for_models(model_ids)
    if mode == "multi" and len(blobs) > max_refs:
        raise HTTPException(
            status_code=400,
            detail=f"Selected models support at most {max_refs} reference images.",
        )

    # Billed via user balance only (no daily count).
    job_count = len(model_ids) if mode == "multi" else len(blobs) * len(model_ids)
    if not _is_admin(user):
        conn = _conn()
        try:
            require_positive_balance(conn, int(user["id"]))
        finally:
            conn.close()
        # Ensure at least one generation is affordable (cheapest selected model).
        min_list = min(_price_for(m, out_size) for m in model_ids)
        _assert_can_afford(user, min_list)

    est_list = round(
        sum(_price_for(m, out_size) for m in model_ids) * (1 if mode == "multi" else len(blobs)),
        2,
    )
    est_user = round(
        sum(float(user_price_cny(_price_for(m, out_size))) for m in model_ids)
        * (1 if mode == "multi" else len(blobs)),
        2,
    )

    def _is_rate_limit(exc: BaseException) -> bool:
        detail = _exc_detail(exc).lower()
        return (
            "rate limit" in detail
            or "throttl" in detail
            or "too many request" in detail
        )

    async def _one(idx: int, mid: str, *, refs: list[bytes]) -> dict:
        one_t0 = time.perf_counter()
        if IMAGE_DEBUG:
            print(
                "[instruct-edit] job_start",
                {
                    "userId": req_user_id,
                    "index": idx,
                    "model": mid,
                    "refCount": len(refs),
                    "size": sum(len(b) for b in refs),
                },
                flush=True,
            )
        out, ctype = await _run_instruct_edit(refs, text, model=mid, output_size=out_size)
        if IMAGE_DEBUG:
            print(
                "[instruct-edit] job_ok",
                {
                    "userId": req_user_id,
                    "index": idx,
                    "model": mid,
                    "elapsedMs": int((time.perf_counter() - one_t0) * 1000),
                    "contentType": ctype or "image/png",
                    "outBytes": len(out or b""),
                },
                flush=True,
            )
        save_data, save_ctype = out, ctype or "image/png"
        if light_response:
            # Compress for mobile, but still embed base64 so UI/history do not depend
            # solely on /api/image/tmp (502 during deploy restart used to blank results).
            save_data, save_ctype = _compress_for_mobile(out, save_ctype)
        tmp_name = _save_tmp_image(save_data, save_ctype)
        return {
            "index": idx,
            "model": mid,
            "priceCny": _price_for(mid, out_size),
            "userPriceCny": float(user_price_cny(_price_for(mid, out_size))),
            "outputSize": out_size,
            "imageBase64": base64.b64encode(save_data).decode("ascii"),
            "imageUrl": f"/api/image/tmp/{tmp_name}",
            "contentType": save_ctype,
        }

    async def _one_with_retry(idx: int, mid: str, *, refs: list[bytes]) -> dict:
        last: Optional[BaseException] = None
        for attempt in range(INSTRUCT_EDIT_RATE_RETRIES + 1):
            try:
                return await _one(idx, mid, refs=refs)
            except HTTPException as exc:
                if IMAGE_DEBUG:
                    print(
                        "[instruct-edit] job_http_error",
                        {
                            "userId": req_user_id,
                            "index": idx,
                            "model": mid,
                            "attempt": attempt + 1,
                            "status": exc.status_code,
                            "detail": _exc_detail(exc),
                        },
                        flush=True,
                    )
                last = exc
                if _is_rate_limit(exc) and attempt < INSTRUCT_EDIT_RATE_RETRIES:
                    await asyncio.sleep(INSTRUCT_EDIT_RATE_BACKOFF * (attempt + 1))
                    continue
                raise
            except Exception as exc:
                if IMAGE_DEBUG:
                    print(
                        "[instruct-edit] job_error",
                        {
                            "userId": req_user_id,
                            "index": idx,
                            "model": mid,
                            "attempt": attempt + 1,
                            "detail": _exc_detail(exc),
                        },
                        flush=True,
                    )
                last = exc
                if _is_rate_limit(exc) and attempt < INSTRUCT_EDIT_RATE_RETRIES:
                    await asyncio.sleep(INSTRUCT_EDIT_RATE_BACKOFF * (attempt + 1))
                    continue
                raise
        assert last is not None
        raise last

    images: list[dict] = []
    errors: list[str] = []
    charged_total = 0.0
    balance_after: Optional[float] = None
    first_job = True
    stop_all = False

    # Jobs: multi = one set of refs × each model; single = each blob × each model.
    jobs: list[tuple[int, list[bytes], str]] = []
    if mode == "multi":
        for mid in model_ids:
            jobs.append((0, blobs, mid))
    else:
        for i, blob in enumerate(blobs):
            for mid in model_ids:
                jobs.append((i, [blob], mid))

    for job_i, (img_idx, refs, mid) in enumerate(jobs):
        if stop_all:
            break
        list_p = _price_for(mid, out_size)
        try:
            if not _is_admin(user):
                _assert_can_afford(user, list_p)
        except HTTPException as exc:
            errors.append(f"{mid}#{img_idx + 1}: {_exc_detail(exc)}")
            stop_all = True
            break
        if not first_job and INSTRUCT_EDIT_GAP_SEC > 0:
            await asyncio.sleep(INSTRUCT_EDIT_GAP_SEC)
        first_job = False
        try:
            item = await _one_with_retry(img_idx, mid, refs=refs)
            bal = _charge_success(
                user,
                list_p,
                reason="instruct_edit",
                meta={
                    "model": mid,
                    "index": img_idx,
                    "refMode": mode,
                    "refCount": len(refs),
                    "outputSize": out_size,
                    "billedSize": _billable_output_size(mid, out_size),
                    "public": is_public,
                },
            )
            if bal is not None:
                balance_after = bal
                charged_total = round(charged_total + float(user_price_cny(list_p)), 2)
            if is_public:
                try:
                    raw = base64.b64decode(item.get("imageBase64") or "")
                    pub = _publish_public_image(
                        user_id=req_user_id,
                        prompt=text,
                        model=mid,
                        source="instruct_edit",
                        data=raw,
                        content_type=str(item.get("contentType") or "image/png"),
                    )
                    item.update(pub)
                except Exception as pub_exc:
                    if IMAGE_DEBUG:
                        print(
                            "[instruct-edit] public_publish_failed",
                            {"userId": req_user_id, "model": mid, "err": str(pub_exc)},
                            flush=True,
                        )
            images.append(item)
        except HTTPException as exc:
            if exc.status_code in (402, 429, 504):
                errors.append(f"{mid}#{img_idx + 1}: {_exc_detail(exc)}")
                stop_all = True
                break
            errors.append(f"{mid}#{img_idx + 1}: {_exc_detail(exc)}")
        except Exception as exc:
            errors.append(f"{mid}#{img_idx + 1}: {_exc_detail(exc)}")

    if not images:
        detail = "Image edit failed: " + "; ".join(errors) if errors else "no images"
        code = 402 if any("Insufficient" in e for e in errors) else 502
        if IMAGE_DEBUG:
            print(
                "[instruct-edit] fail",
                {
                    "userId": req_user_id,
                    "models": model_ids,
                    "uploadCount": len(blobs),
                    "refMode": mode,
                    "errors": errors,
                    "elapsedMs": int((time.perf_counter() - t0) * 1000),
                },
                flush=True,
            )
        raise HTTPException(status_code=code, detail=detail)
    order = {m: i for i, m in enumerate(model_ids)}
    images.sort(key=lambda x: (int(x.get("index") or 0), order.get(x.get("model") or "", 99)))
    first = images[0]
    out = {
        "model": first["model"],
        "models": model_ids,
        "priceCny": first["priceCny"],
        "estimatedPriceCny": est_list,
        "estimatedUserPriceCny": est_user,
        "chargedCny": charged_total,
        "imageBase64": first["imageBase64"],
        "contentType": first["contentType"],
        "images": images,
        "preset": (preset or "").strip() or None,
        "refMode": mode,
        "outputSize": out_size,
        "batch": 1 if mode == "multi" else len(blobs),
        "compare": len(model_ids) > 1,
        "public": is_public,
        "aiWallet": _wallet_for(user),
    }
    if balance_after is not None:
        out["balanceCny"] = balance_after
    if errors:
        out["partialErrors"] = errors
    if IMAGE_DEBUG:
        print(
            "[instruct-edit] done",
            {
                "userId": req_user_id,
                "imageCount": len(images),
                "errorCount": len(errors),
                "refMode": mode,
                "jobCount": job_count,
                "elapsedMs": int((time.perf_counter() - t0) * 1000),
            },
            flush=True,
        )
    return out


def _resolve_t2i_models(model: Optional[str], models: Optional[List[str]]) -> list[str]:
    raw: list[str] = []
    if models:
        for item in models:
            if not item:
                continue
            for part in str(item).replace(";", ",").split(","):
                p = part.strip()
                if p:
                    raw.append(p)
    if not raw and model:
        raw = [(model or "").strip()]
    if not raw:
        raw = ["image-01"]
    out: list[str] = []
    seen: set[str] = set()
    for mid in raw:
        if mid not in TEXT_TO_IMAGE_MODEL_IDS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported model '{mid}'. Use one of: {', '.join(sorted(TEXT_TO_IMAGE_MODEL_IDS))}",
            )
        if mid in seen:
            continue
        seen.add(mid)
        out.append(mid)
    return out


def _t2i_price_for(model_id: str) -> float:
    for m in TEXT_TO_IMAGE_MODELS:
        if m["id"] == model_id:
            return float(m["priceCny"])
    return 0.0


@router.post("/text-to-image")
async def api_text_to_image(
    prompt: str = Form(...),
    model: Optional[str] = Form(None),
    models: List[str] = Form(default=[]),
    size: str = Form("square"),
    public: str = Form("0"),
    user: dict = Depends(_user),
):
    text = (prompt or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Please enter a prompt.")
    is_public = _parse_bool(public, default=False)
    model_ids = _resolve_t2i_models(model, models)
    # Per-model provider check (deferred to _one; fail early for non-minimax if dashscope missing)
    non_minimax = [m for m in model_ids if not is_minimax_model(m)]
    if non_minimax and not dashscope_image_edit_configured():
        raise HTTPException(
            status_code=503,
            detail="DashScope is not configured (DASHSCOPE_API_KEY).",
        )
    size_preset = (size or "square").strip().lower() or "square"
    if size_preset not in ("square", "portrait", "landscape", "hd"):
        size_preset = "square"

    if not _is_admin(user):
        conn = _conn()
        try:
            require_positive_balance(conn, int(user["id"]))
        finally:
            conn.close()
        min_list = min(_t2i_price_for(m) for m in model_ids)
        _assert_can_afford(user, min_list)

    est_list = round(sum(_t2i_price_for(m) for m in model_ids), 2)
    est_user = round(
        sum(float(user_price_cny(_t2i_price_for(m))) for m in model_ids),
        2,
    )

    def _is_retryable(exc: BaseException) -> bool:
        detail = _exc_detail(exc).lower()
        return (
            "rate limit" in detail
            or "throttl" in detail
            or "too many request" in detail
        )

    async def _one(mid: str) -> dict:
        if is_minimax_model(mid):
            _model_provider_ready(mid)
            out, ctype = await generate_minimax_text_to_image(text, model=mid, size_preset=size_preset)
        else:
            out, ctype = await generate_image_from_text(text, model=mid, size_preset=size_preset)
        return {
            "model": mid,
            "priceCny": _t2i_price_for(mid),
            "userPriceCny": float(user_price_cny(_t2i_price_for(mid))),
            "imageBase64": base64.b64encode(out).decode("ascii"),
            "contentType": ctype or "image/png",
        }

    async def _one_with_retry(mid: str) -> dict:
        last: Optional[BaseException] = None
        for attempt in range(INSTRUCT_EDIT_RATE_RETRIES + 1):
            try:
                return await _one(mid)
            except HTTPException as exc:
                last = exc
                if _is_retryable(exc) and attempt < INSTRUCT_EDIT_RATE_RETRIES:
                    await asyncio.sleep(INSTRUCT_EDIT_RATE_BACKOFF * (attempt + 1))
                    continue
                raise
            except Exception as exc:
                last = exc
                if _is_retryable(exc) and attempt < INSTRUCT_EDIT_RATE_RETRIES:
                    await asyncio.sleep(INSTRUCT_EDIT_RATE_BACKOFF * (attempt + 1))
                    continue
                raise
        assert last is not None
        raise last

    images: list[dict] = []
    errors: list[str] = []
    charged_total = 0.0
    balance_after: Optional[float] = None
    first_job = True
    for mid in model_ids:
        list_p = _t2i_price_for(mid)
        try:
            if not _is_admin(user):
                _assert_can_afford(user, list_p)
        except HTTPException as exc:
            errors.append(f"{mid}: {_exc_detail(exc)}")
            break
        if not first_job and INSTRUCT_EDIT_GAP_SEC > 0:
            await asyncio.sleep(INSTRUCT_EDIT_GAP_SEC)
        first_job = False
        try:
            item = await _one_with_retry(mid)
            bal = _charge_success(
                user,
                list_p,
                reason="text_to_image",
                meta={"model": mid},
            )
            if bal is not None:
                balance_after = bal
                charged_total = round(charged_total + float(user_price_cny(list_p)), 2)
            if is_public:
                try:
                    raw = base64.b64decode(item.get("imageBase64") or "")
                    pub = _publish_public_image(
                        user_id=int(user["id"]),
                        prompt=text,
                        model=mid,
                        source="text_to_image",
                        data=raw,
                        content_type=str(item.get("contentType") or "image/png"),
                    )
                    item.update(pub)
                except Exception as pub_exc:
                    if IMAGE_DEBUG:
                        print(
                            "[text-to-image] public_publish_failed",
                            {"userId": int(user["id"]), "model": mid, "err": str(pub_exc)},
                            flush=True,
                        )
            images.append(item)
        except HTTPException as exc:
            errors.append(f"{mid}: {_exc_detail(exc)}")
            if exc.status_code in (402, 429, 504):
                break
        except Exception as exc:
            errors.append(f"{mid}: {_exc_detail(exc)}")
    if not images:
        detail = "Image generation failed: " + "; ".join(errors) if errors else "no images"
        code = 402 if any("Insufficient" in e for e in errors) else 502
        raise HTTPException(status_code=code, detail=detail)
    order = {m: i for i, m in enumerate(model_ids)}
    images.sort(key=lambda x: order.get(x.get("model") or "", 99))
    first = images[0]
    out = {
        "model": first["model"],
        "models": model_ids,
        "priceCny": first["priceCny"],
        "estimatedPriceCny": est_list,
        "estimatedUserPriceCny": est_user,
        "chargedCny": charged_total,
        "imageBase64": first["imageBase64"],
        "contentType": first["contentType"],
        "images": images,
        "size": size_preset,
        "public": is_public,
        "aiWallet": _wallet_for(user),
    }
    if balance_after is not None:
        out["balanceCny"] = balance_after
    if errors:
        out["partialErrors"] = errors
    return out


@router.post("/to-pdf-advanced")
async def api_to_pdf_advanced(
    files: List[UploadFile] = File(...),
    remove_shadow: bool = Form(False),
    user: dict = Depends(_user),
):
    if not files:
        raise HTTPException(status_code=400, detail="No images")
    if len(files) > MAX_IMAGES_PDF:
        raise HTTPException(status_code=400, detail=f"Too many images (max {MAX_IMAGES_PDF})")
    if remove_shadow:
        _require_tencent()
    quota = _consume_quota(user, "to_pdf")
    images: list[bytes] = []
    for f in files:
        raw = await _read_upload(f)
        if remove_shadow:
            raw = image_enhancement(raw, 302)
        images.append(raw)
    pdf = images_to_pdf_bytes(images)
    headers = {
        "Content-Disposition": 'attachment; filename="images_advanced.pdf"',
        "X-Quota-Remaining": str(quota["remaining"]),
        "X-Quota-Limit": str(quota["limit"]),
    }
    return Response(content=pdf, media_type="application/pdf", headers=headers)
