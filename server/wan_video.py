"""Wan image-to-video (DashScope) — async submit + poll + proxy download.

Billing: vendor list (¥0.6/s 720P, ¥1/s 1080P) × AI_PRICE_MARKUP; charge on success only.

Deploy note: if /api/wan/* is 404 while deploy_sha is new, run:
  bash /opt/toolbasecamp-deploy/fix-wan-api.sh
"""

from __future__ import annotations

import base64
import io
import os
import re
import time
from decimal import Decimal
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from PIL import Image

from ai_wallet import (
    AI_MARKUP,
    money,
    require_can_afford,
    try_charge,
    user_price_cny,
    wallet_public,
)

security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/wan", tags=["wan"])

DASHSCOPE_API_KEY = os.environ.get("DASHSCOPE_API_KEY", "")
DASHSCOPE_BASE_URL = os.environ.get(
    "DASHSCOPE_BASE_URL", "https://dashscope-us.aliyuncs.com/compatible-mode/v1"
).rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@toolbasecamp.com").lower()
WAN_I2V_TIMEOUT = float(os.environ.get("WAN_I2V_TIMEOUT", "60"))
MAX_UPLOAD = 6 * 1024 * 1024
MAX_IMAGE_EDGE = 1280
ALLOWED_DURATIONS = {5, 10}
ALLOWED_RESOLUTIONS = {"720P", "1080P"}
# Official Wan 2.6 i2v list rates (CNY per output second)
LIST_RATE_PER_SEC = {
    "720P": Decimal("0.6"),
    "1080P": Decimal("1.0"),
}
TASK_TTL_SEC = 24 * 3600

# task_id -> {user_id, created, video_url?, list_price, duration, resolution, charged, ...}
_task_owners: Dict[str, Dict[str, Any]] = {}


def _dashscope_api_root() -> str:
    explicit = (
        os.environ.get("WAN_DASHSCOPE_API_URL")
        or os.environ.get("DASHSCOPE_HTTP_API_URL")
        or ""
    ).strip().rstrip("/")
    if explicit:
        return explicit
    base = DASHSCOPE_BASE_URL
    if "/compatible-mode/" in base:
        return base.split("/compatible-mode/")[0] + "/api/v1"
    if base.endswith("/api/v1"):
        return base
    # Fallbacks by region hint
    low = base.lower()
    if "dashscope-us" in low:
        return "https://dashscope-us.aliyuncs.com/api/v1"
    if "dashscope-intl" in low:
        return "https://dashscope-intl.aliyuncs.com/api/v1"
    return "https://dashscope.aliyuncs.com/api/v1"


def _default_model() -> str:
    env = (os.environ.get("WAN_I2V_MODEL") or "").strip()
    if env:
        return env
    root = _dashscope_api_root().lower()
    if "dashscope-us" in root:
        return "wan2.6-i2v-us"
    return "wan2.6-i2v-flash"


def wan_configured() -> bool:
    return bool(DASHSCOPE_API_KEY)


def list_price_cny(duration: int, resolution: str) -> float:
    rate = LIST_RATE_PER_SEC.get(resolution, LIST_RATE_PER_SEC["720P"])
    return float(money(rate * int(duration)))


def pricing_public() -> dict:
    list_720 = float(LIST_RATE_PER_SEC["720P"])
    list_1080 = float(LIST_RATE_PER_SEC["1080P"])
    markup = float(AI_MARKUP)
    return {
        "listPerSec": {"720P": list_720, "1080P": list_1080},
        "userPerSec": {
            "720P": float(user_price_cny(list_720)),
            "1080P": float(user_price_cny(list_1080)),
        },
        "markup": markup,
        "examples": [
            {
                "duration": d,
                "resolution": r,
                "listPriceCny": list_price_cny(d, r),
                "userPriceCny": float(user_price_cny(list_price_cny(d, r))),
            }
            for d in sorted(ALLOWED_DURATIONS)
            for r in ("720P", "1080P")
        ],
    }


def get_wan_config() -> dict:
    return {
        "configured": wan_configured(),
        "model": _default_model(),
        "api_root": _dashscope_api_root(),
        "paid": True,
        "pricing": pricing_public(),
        "durations": sorted(ALLOWED_DURATIONS),
        "resolutions": sorted(ALLOWED_RESOLUTIONS),
    }


def _wire(get_conn, require_db, get_current_user):
    router.get_conn = get_conn  # type: ignore[attr-defined]
    router.require_db = require_db  # type: ignore[attr-defined]
    router.get_current_user = get_current_user  # type: ignore[attr-defined]


def _user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    return router.get_current_user(creds)  # type: ignore[attr-defined]


def _conn():
    router.require_db()  # type: ignore[attr-defined]
    return router.get_conn()  # type: ignore[attr-defined]


def _is_admin(user: dict) -> bool:
    return user.get("role") == "admin" or (user.get("email") or "").lower() == ADMIN_EMAIL


def _wallet_for(user: dict) -> dict:
    conn = _conn()
    try:
        return wallet_public(conn, user, is_admin=_is_admin(user))
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


def _ensure_charged(meta: Dict[str, Any], user: dict, task_id: str) -> Optional[float]:
    """Charge once when generation succeeded. Returns balance after charge (None for admin)."""
    if meta.get("charged"):
        bal = meta.get("balance_after")
        return float(bal) if bal is not None else None
    list_price = float(meta.get("list_price") or 0)
    if _is_admin(user):
        meta["charged"] = True
        meta["charged_cny"] = 0.0
        meta["balance_after"] = None
        return None
    charge = user_price_cny(list_price)
    conn = _conn()
    try:
        new_bal = try_charge(
            conn,
            int(user["id"]),
            charge,
            reason="wan_i2v",
            meta={
                "taskId": task_id,
                "duration": meta.get("duration"),
                "resolution": meta.get("resolution"),
                "model": meta.get("model") or _default_model(),
                "listPriceCny": float(list_price),
                "chargedCny": float(charge),
            },
        )
        if new_bal is None:
            raise HTTPException(
                status_code=402,
                detail="Insufficient balance. Please top up.",
            )
        meta["charged"] = True
        meta["charged_cny"] = float(charge)
        meta["balance_after"] = float(new_bal)
        return float(new_bal)
    finally:
        conn.close()


def _purge_tasks():
    now = time.time()
    dead = [k for k, v in _task_owners.items() if now - float(v.get("created", 0)) > TASK_TTL_SEC]
    for k in dead:
        _task_owners.pop(k, None)


def _remember_task(
    task_id: str,
    user_id: int,
    *,
    list_price: float,
    duration: int,
    resolution: str,
    model: str,
):
    _purge_tasks()
    _task_owners[task_id] = {
        "user_id": int(user_id),
        "created": time.time(),
        "video_url": None,
        "list_price": float(list_price),
        "duration": int(duration),
        "resolution": resolution,
        "model": model,
        "charged": False,
        "charged_cny": None,
        "balance_after": None,
    }


def _require_task_owner(task_id: str, user: dict) -> Dict[str, Any]:
    meta = _task_owners.get(task_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Task not found or expired")
    if int(meta["user_id"]) != int(user["id"]) and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Task not found or expired")
    return meta


def _mime_from_name(name: str, content_type: str) -> str:
    ctype = (content_type or "").lower().split(";")[0].strip()
    if ctype.startswith("image/"):
        return ctype
    ext = (os.path.splitext(name or "")[1] or "").lower()
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
    }.get(ext, "image/jpeg")


def _prepare_image_data_uri(raw: bytes, filename: str, content_type: str) -> Tuple[str, str]:
    mime = _mime_from_name(filename, content_type)
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        w, h = img.size
        scale = min(1.0, MAX_IMAGE_EDGE / float(max(w, h)))
        if scale < 1.0:
            try:
                resample = Image.Resampling.LANCZOS
            except AttributeError:
                resample = Image.LANCZOS  # type: ignore[attr-defined]
            img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), resample)
        buf = io.BytesIO()
        out_mime = "image/png" if img.mode == "RGBA" else "image/jpeg"
        if out_mime == "image/png":
            img.save(buf, format="PNG", optimize=True)
        else:
            if img.mode == "RGBA":
                img = img.convert("RGB")
            img.save(buf, format="JPEG", quality=88, optimize=True)
        raw = buf.getvalue()
        mime = out_mime
    except Exception:
        # Keep original bytes if Pillow cannot decode
        pass
    if len(raw) > MAX_UPLOAD * 2:
        raise HTTPException(status_code=400, detail="Image is too large after processing")
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{b64}", mime


async def _dashscope_post(path: str, payload: dict) -> dict:
    if not DASHSCOPE_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="DashScope is not configured (DASHSCOPE_API_KEY).",
        )
    url = _dashscope_api_root().rstrip("/") + path
    headers = {
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
    }
    try:
        async with httpx.AsyncClient(timeout=WAN_I2V_TIMEOUT) as client:
            res = await client.post(url, headers=headers, json=payload)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Wan API timeout. Please try again.")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Wan API network error: {exc}") from exc

    data: dict = {}
    try:
        data = res.json() if res.content else {}
    except Exception:
        data = {}
    if res.status_code >= 400:
        msg = (
            data.get("message")
            or data.get("msg")
            or data.get("code")
            or res.text[:300]
            or res.reason_phrase
        )
        raise HTTPException(status_code=502, detail=f"Wan API error: {msg}")
    return data


async def _dashscope_get_task(task_id: str) -> dict:
    if not DASHSCOPE_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="DashScope is not configured (DASHSCOPE_API_KEY).",
        )
    url = f"{_dashscope_api_root().rstrip('/')}/tasks/{task_id}"
    headers = {"Authorization": f"Bearer {DASHSCOPE_API_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=WAN_I2V_TIMEOUT) as client:
            res = await client.get(url, headers=headers)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Wan API timeout. Please try again.")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Wan API network error: {exc}") from exc

    data: dict = {}
    try:
        data = res.json() if res.content else {}
    except Exception:
        data = {}
    if res.status_code >= 400:
        msg = data.get("message") or data.get("code") or res.text[:300] or res.reason_phrase
        raise HTTPException(status_code=502, detail=f"Wan API error: {msg}")
    return data


def _extract_video_url(output: Any) -> str:
    if not isinstance(output, dict):
        return ""
    url = output.get("video_url") or ""
    if url:
        return str(url)
    results = output.get("results")
    if isinstance(results, list) and results:
        first = results[0]
        if isinstance(first, dict):
            return str(first.get("url") or first.get("video_url") or "")
    return ""


@router.get("/status")
def wan_status(user: dict = Depends(_user)):
    return {
        "configured": wan_configured(),
        "isAdmin": _is_admin(user),
        "model": _default_model(),
        "wallet": _wallet_for(user),
        "pricing": pricing_public(),
        "durations": sorted(ALLOWED_DURATIONS),
        "resolutions": sorted(ALLOWED_RESOLUTIONS),
    }


@router.post("/i2v/submit")
async def wan_i2v_submit(
    image: UploadFile = File(...),
    prompt: str = Form(""),
    duration: int = Form(5),
    resolution: str = Form("720P"),
    user: dict = Depends(_user),
):
    if not wan_configured():
        raise HTTPException(
            status_code=503,
            detail="DashScope is not configured (DASHSCOPE_API_KEY).",
        )
    prompt = (prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Please enter a motion prompt")
    if len(prompt) > 1500:
        prompt = prompt[:1500]
    duration = int(duration)
    if duration not in ALLOWED_DURATIONS:
        raise HTTPException(status_code=400, detail="Duration must be 5 or 10 seconds")
    resolution = (resolution or "720P").upper()
    if resolution not in ALLOWED_RESOLUTIONS:
        raise HTTPException(status_code=400, detail="Resolution must be 720P or 1080P")

    list_price = list_price_cny(duration, resolution)
    _assert_can_afford(user, list_price)

    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(status_code=400, detail="Image is too large (max 6MB)")
    ctype = (image.content_type or "").lower()
    if ctype and not ctype.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")

    img_url, _ = _prepare_image_data_uri(raw, image.filename or "image.jpg", ctype)

    model = _default_model()
    payload = {
        "model": model,
        "input": {
            "prompt": prompt,
            "img_url": img_url,
        },
        "parameters": {
            "resolution": resolution,
            "duration": duration,
            "prompt_extend": True,
            "watermark": False,
            "audio": False,
        },
    }

    data = await _dashscope_post("/services/aigc/video-generation/video-synthesis", payload)

    output = data.get("output") if isinstance(data.get("output"), dict) else {}
    task_id = str((output or {}).get("task_id") or data.get("task_id") or "").strip()
    if not task_id:
        raise HTTPException(
            status_code=502,
            detail="Wan API did not return a task_id. Check model / region settings.",
        )

    _remember_task(
        task_id,
        int(user["id"]),
        list_price=list_price,
        duration=duration,
        resolution=resolution,
        model=model,
    )
    user_charge = float(user_price_cny(list_price))
    return {
        "success": True,
        "task_id": task_id,
        "model": model,
        "duration": duration,
        "resolution": resolution,
        "listPriceCny": list_price,
        "userPriceCny": user_charge,
        "wallet": _wallet_for(user),
    }


@router.get("/i2v/task/{task_id}")
async def wan_i2v_task(task_id: str, user: dict = Depends(_user)):
    task_id = (task_id or "").strip()
    if not re.match(r"^[\w\-]{8,128}$", task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")
    meta = _require_task_owner(task_id, user)
    data = await _dashscope_get_task(task_id)
    output = data.get("output") if isinstance(data.get("output"), dict) else {}
    status = str((output or {}).get("task_status") or data.get("task_status") or "").upper()
    video_url = _extract_video_url(output)
    if video_url:
        meta["video_url"] = video_url
    message = ""
    if status in ("FAILED", "CANCELED", "UNKNOWN"):
        message = str(
            (output or {}).get("message")
            or data.get("message")
            or data.get("code")
            or "Generation failed"
        )
    balance_after = None
    charged_cny = None
    if status == "SUCCEEDED" and (video_url or meta.get("video_url")):
        balance_after = _ensure_charged(meta, user, task_id)
        charged_cny = meta.get("charged_cny")
    return {
        "success": True,
        "task_id": task_id,
        "status": status or "PENDING",
        "video_url": video_url or None,
        "proxy_url": f"/wan/i2v/proxy/{task_id}" if video_url or status == "SUCCEEDED" else None,
        "message": message,
        "usage": data.get("usage"),
        "listPriceCny": meta.get("list_price"),
        "userPriceCny": float(user_price_cny(meta.get("list_price") or 0)),
        "chargedCny": charged_cny,
        "wallet": _wallet_for(user) if status == "SUCCEEDED" else None,
        "balanceAfter": balance_after,
    }


@router.get("/i2v/proxy/{task_id}")
async def wan_i2v_proxy(task_id: str, user: dict = Depends(_user)):
    task_id = (task_id or "").strip()
    if not re.match(r"^[\w\-]{8,128}$", task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")
    meta = _require_task_owner(task_id, user)
    video_url = meta.get("video_url") or ""
    if not video_url:
        data = await _dashscope_get_task(task_id)
        output = data.get("output") if isinstance(data.get("output"), dict) else {}
        status = str((output or {}).get("task_status") or "").upper()
        video_url = _extract_video_url(output)
        if video_url:
            meta["video_url"] = video_url
        if not video_url:
            if status and status != "SUCCEEDED":
                raise HTTPException(status_code=409, detail=f"Video not ready ({status or 'PENDING'})")
            raise HTTPException(status_code=404, detail="Video URL not available")

    # Must bill before download (same as task poll success path)
    _ensure_charged(meta, user, task_id)

    parsed = urlparse(str(video_url))
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid video URL")

    try:
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            upstream = await client.get(str(video_url))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch video: {exc}") from exc
    if upstream.status_code >= 400:
        raise HTTPException(status_code=502, detail="Upstream video fetch failed")

    media = upstream.headers.get("content-type") or "video/mp4"
    headers = {
        "Content-Disposition": 'attachment; filename="wan-video.mp4"',
        "Cache-Control": "private, max-age=300",
    }
    return StreamingResponse(iter([upstream.content]), media_type=media, headers=headers)
