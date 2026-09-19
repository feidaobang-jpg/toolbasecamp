"""MiniMax-H3 image-to-video — async submit + poll + proxy download.

Billing: vendor list (¥0.5/s 768P, ¥0.8/s 2K) × AI_PRICE_MARKUP; charge on success only.
API: POST /v2/video_generation , GET /v2/query/video_generation/{task_id}
"""

from __future__ import annotations

import base64
import io
import os
import re
import time
from decimal import Decimal
from typing import Any, Dict, Optional, Tuple

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
router = APIRouter(prefix="/minimax", tags=["minimax-video"])

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@zhengxiaohui.cn").lower()
MINIMAX_API_KEY = (os.environ.get("MINIMAX_API_KEY") or "").strip()
MINIMAX_API_BASE = (
    os.environ.get("MINIMAX_VIDEO_API_BASE") or "https://api.minimaxi.com"
).strip().rstrip("/")
MINIMAX_TIMEOUT = float(os.environ.get("MINIMAX_VIDEO_TIMEOUT", "60"))
MAX_UPLOAD = 6 * 1024 * 1024
MAX_IMAGE_EDGE = 1280
MIN_DURATION = 4
MAX_DURATION = 15
ALLOWED_RESOLUTIONS = {"768P", "2K"}
LIST_RATE_PER_SEC = {
    "768P": Decimal("0.5"),
    "2K": Decimal("0.8"),
}
TASK_TTL_SEC = 24 * 3600
H3_MODEL = "MiniMax-H3"

_task_owners: Dict[str, Dict[str, Any]] = {}


def minimax_video_configured() -> bool:
    return bool(MINIMAX_API_KEY)


def list_price_cny(duration: int, resolution: str) -> float:
    rate = LIST_RATE_PER_SEC.get(resolution, LIST_RATE_PER_SEC["768P"])
    return float(money(rate * int(duration)))


def _valid_duration(duration: int) -> bool:
    return MIN_DURATION <= int(duration) <= MAX_DURATION


def pricing_public() -> dict:
    list_768 = float(LIST_RATE_PER_SEC["768P"])
    list_2k = float(LIST_RATE_PER_SEC["2K"])
    markup = float(AI_MARKUP)
    return {
        "listPerSec": {"768P": list_768, "2K": list_2k},
        "userPerSec": {
            "768P": float(user_price_cny(list_768)),
            "2K": float(user_price_cny(list_2k)),
        },
        "markup": markup,
        "examples": [
            {
                "duration": d,
                "resolution": r,
                "listPriceCny": list_price_cny(d, r),
                "userPriceCny": float(user_price_cny(list_price_cny(d, r))),
            }
            for d, r in ((5, "768P"), (10, "768P"), (10, "2K"))
        ],
        "minDuration": MIN_DURATION,
        "maxDuration": MAX_DURATION,
    }


def get_minimax_video_config() -> dict:
    return {
        "configured": minimax_video_configured(),
        "model": H3_MODEL,
        "api_base": MINIMAX_API_BASE,
        "paid": True,
        "pricing": pricing_public(),
        "audioDefault": True,
        "minDuration": MIN_DURATION,
        "maxDuration": MAX_DURATION,
        "resolutions": ["768P", "2K"],
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
            reason="minimax_h3_i2v",
            meta={
                "taskId": task_id,
                "duration": meta.get("duration"),
                "resolution": meta.get("resolution"),
                "model": meta.get("model") or H3_MODEL,
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


def _prepare_image_data_uri(raw: bytes, filename: str, content_type: str) -> str:
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
        pass
    if len(raw) > MAX_UPLOAD * 2:
        raise HTTPException(status_code=400, detail="Image is too large after processing")
    b64 = base64.b64encode(raw).decode("ascii")
    fmt = "png" if "png" in mime else "jpeg"
    return f"data:image/{fmt};base64,{b64}"


def _raise_minimax_http(data: dict, resp: httpx.Response) -> None:
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict):
        msg = str(err.get("message") or err.get("type") or "").strip()
        if msg:
            code = resp.status_code if resp.status_code >= 400 else 502
            if "1008" in msg or "insufficient" in msg.lower():
                raise HTTPException(status_code=402, detail=f"MiniMax insufficient balance: {msg}")
            if "1002" in msg or "rate limit" in msg.lower():
                raise HTTPException(status_code=429, detail=f"MiniMax rate limited: {msg}")
            raise HTTPException(status_code=code if code < 500 else 502, detail=f"MiniMax: {msg}")
    base = data.get("base_resp") if isinstance(data, dict) else None
    if isinstance(base, dict) and base.get("status_code") not in (None, 0):
        msg = str(base.get("status_msg") or base.get("status_code") or "").strip()
        raise HTTPException(status_code=502, detail=f"MiniMax: {msg}")
    raise HTTPException(
        status_code=502,
        detail=f"MiniMax video API error: HTTP {resp.status_code} — {(resp.text or '')[:300]}",
    )


async def _mm_post(path: str, payload: dict) -> dict:
    if not MINIMAX_API_KEY:
        raise HTTPException(status_code=503, detail="MiniMax is not configured (MINIMAX_API_KEY).")
    url = MINIMAX_API_BASE + path
    headers = {
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=MINIMAX_TIMEOUT) as client:
            res = await client.post(url, headers=headers, json=payload)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="MiniMax video API timeout. Please try again.")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"MiniMax network error: {exc}") from exc
    data: dict = {}
    try:
        data = res.json() if res.content else {}
    except Exception:
        data = {}
    if res.status_code >= 400:
        _raise_minimax_http(data if isinstance(data, dict) else {}, res)
    return data if isinstance(data, dict) else {}


async def _mm_get(path: str) -> dict:
    if not MINIMAX_API_KEY:
        raise HTTPException(status_code=503, detail="MiniMax is not configured (MINIMAX_API_KEY).")
    url = MINIMAX_API_BASE + path
    headers = {"Authorization": f"Bearer {MINIMAX_API_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=MINIMAX_TIMEOUT) as client:
            res = await client.get(url, headers=headers)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="MiniMax video API timeout. Please try again.")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"MiniMax network error: {exc}") from exc
    data: dict = {}
    try:
        data = res.json() if res.content else {}
    except Exception:
        data = {}
    if res.status_code >= 400:
        _raise_minimax_http(data if isinstance(data, dict) else {}, res)
    return data if isinstance(data, dict) else {}


@router.get("/status")
def mm_status(user: dict = Depends(_user)):
    return {
        "configured": minimax_video_configured(),
        "isAdmin": _is_admin(user),
        "model": H3_MODEL,
        "apiBase": MINIMAX_API_BASE,
        "wallet": _wallet_for(user),
        "pricing": pricing_public(),
        "audioDefault": True,
        "minDuration": MIN_DURATION,
        "maxDuration": MAX_DURATION,
        "resolutions": ["768P", "2K"],
        "provider": "minimax",
    }


@router.post("/i2v/submit")
async def mm_i2v_submit(
    image: UploadFile = File(...),
    prompt: str = Form(""),
    duration: int = Form(5),
    resolution: str = Form("768P"),
    user: dict = Depends(_user),
):
    if not minimax_video_configured():
        raise HTTPException(
            status_code=503,
            detail="MiniMax is not configured (MINIMAX_API_KEY).",
        )
    prompt = (prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Please enter a motion prompt")
    if len(prompt) > 7000:
        prompt = prompt[:7000]
    duration = int(duration)
    if not _valid_duration(duration):
        raise HTTPException(
            status_code=400,
            detail=f"Duration must be {MIN_DURATION}–{MAX_DURATION} seconds",
        )
    resolution = (resolution or "768P").upper()
    if resolution == "720P":
        resolution = "768P"
    if resolution == "1080P":
        resolution = "2K"
    if resolution not in ALLOWED_RESOLUTIONS:
        raise HTTPException(status_code=400, detail="Resolution must be 768P or 2K")

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

    img_uri = _prepare_image_data_uri(raw, image.filename or "image.jpg", ctype)
    payload = {
        "model": H3_MODEL,
        "content": [
            {"type": "text", "text": prompt},
            {
                "type": "image_url",
                "image_url": {"url": img_uri},
                "role": "first_frame",
            },
        ],
        "duration": duration,
        "resolution": resolution,
        "ratio": "adaptive",
        "aigc_watermark": False,
    }

    data = await _mm_post("/v2/video_generation", payload)
    task_id = str(data.get("task_id") or "").strip()
    if not task_id:
        raise HTTPException(
            status_code=502,
            detail="MiniMax did not return a task_id.",
        )

    _remember_task(
        task_id,
        int(user["id"]),
        list_price=list_price,
        duration=duration,
        resolution=resolution,
        model=H3_MODEL,
    )
    user_charge = float(user_price_cny(list_price))
    return {
        "success": True,
        "task_id": task_id,
        "model": H3_MODEL,
        "provider": "minimax",
        "duration": duration,
        "resolution": resolution,
        "listPriceCny": list_price,
        "userPriceCny": user_charge,
        "wallet": _wallet_for(user),
    }


def _normalize_status(raw: str) -> str:
    s = (raw or "").strip().lower()
    if s in ("succeeded", "success", "completed"):
        return "SUCCEEDED"
    if s in ("failed", "error"):
        return "FAILED"
    if s in ("cancelled", "canceled"):
        return "CANCELED"
    if s in ("running", "processing"):
        return "RUNNING"
    if s in ("queued", "pending", "submitted"):
        return "PENDING"
    return (raw or "UNKNOWN").upper()


@router.get("/i2v/task/{task_id}")
async def mm_i2v_task(task_id: str, user: dict = Depends(_user)):
    task_id = (task_id or "").strip()
    if not re.match(r"^[\w\-]{8,128}$", task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")
    meta = _require_task_owner(task_id, user)

    data = await _mm_get(f"/v2/query/video_generation/{task_id}")
    task = data.get("task") if isinstance(data.get("task"), dict) else data
    if not isinstance(task, dict):
        task = {}
    status = _normalize_status(str(task.get("status") or ""))
    message = ""
    err = task.get("error")
    if isinstance(err, dict):
        message = str(err.get("message") or err.get("code") or "").strip()
    elif isinstance(err, str):
        message = err.strip()

    video_url = ""
    content = task.get("content")
    if isinstance(content, dict):
        video_url = str(content.get("url") or "").strip()
    if not video_url:
        video_url = str(task.get("video_url") or "").strip()

    balance_after: Optional[float] = None
    if status == "SUCCEEDED" and video_url:
        meta["video_url"] = video_url
        balance_after = _ensure_charged(meta, user, task_id)

    out: Dict[str, Any] = {
        "success": True,
        "task_id": task_id,
        "status": status,
        "message": message,
        "video_url": video_url if status == "SUCCEEDED" else None,
        "proxy_url": f"/minimax/i2v/proxy/{task_id}" if video_url or status == "SUCCEEDED" else None,
        "duration": meta.get("duration"),
        "resolution": meta.get("resolution"),
        "model": meta.get("model") or H3_MODEL,
        "provider": "minimax",
        "charged": bool(meta.get("charged")),
        "userPriceCny": float(meta.get("charged_cny") or 0)
        if meta.get("charged")
        else float(user_price_cny(float(meta.get("list_price") or 0))),
    }
    if balance_after is not None or meta.get("charged"):
        out["wallet"] = _wallet_for(user)
    return out


@router.get("/i2v/proxy/{task_id}")
async def mm_i2v_proxy(task_id: str, user: dict = Depends(_user)):
    task_id = (task_id or "").strip()
    if not re.match(r"^[\w\-]{8,128}$", task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")
    meta = _require_task_owner(task_id, user)
    video_url = str(meta.get("video_url") or "").strip()
    if not video_url:
        data = await _mm_get(f"/v2/query/video_generation/{task_id}")
        task = data.get("task") if isinstance(data.get("task"), dict) else data
        if isinstance(task, dict):
            content = task.get("content")
            if isinstance(content, dict):
                video_url = str(content.get("url") or "").strip()
            if not video_url:
                video_url = str(task.get("video_url") or "").strip()
            if video_url and _normalize_status(str(task.get("status") or "")) == "SUCCEEDED":
                meta["video_url"] = video_url
                _ensure_charged(meta, user, task_id)
    if not video_url.startswith("http"):
        raise HTTPException(status_code=404, detail="Video not ready")

    async def stream():
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            async with client.stream("GET", video_url) as resp:
                if resp.status_code >= 400:
                    raise HTTPException(status_code=502, detail="Failed to download video")
                async for chunk in resp.aiter_bytes(65536):
                    yield chunk

    return StreamingResponse(
        stream(),
        media_type="video/mp4",
        headers={"Content-Disposition": 'inline; filename="minimax-h3.mp4"'},
    )
