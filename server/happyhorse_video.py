"""HappyHorse T2V + R2V + Video-Edit (DashScope) — async submit + poll + proxy.

Billing: vendor list × AI_PRICE_MARKUP; charge on success only.
  480P ¥0.45/s · 720P ¥0.9/s · 1080P ¥1.2/s (Beijing list).
Models: happyhorse-1.1-t2v · happyhorse-1.1-r2v · happyhorse-1.0-video-edit
Duration: generate/edit output capped at 15s by API.
"""

from __future__ import annotations

import base64
import io
import math
import os
import re
import secrets
import time
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ai_wallet import (
    AI_MARKUP,
    money,
    require_can_afford,
    try_charge,
    user_price_cny,
    wallet_public,
)
from feishu_notify import SITE_BASE_URL
from recipe_ai import DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL

security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/happyhorse", tags=["happyhorse"])

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@toolbasecamp.com").lower()
HH_TIMEOUT = float(os.environ.get("HAPPYHORSE_TIMEOUT", "60"))
MIN_DURATION = 3
MAX_DURATION = 15
DEFAULT_DURATION = 5
ALLOWED_RESOLUTIONS = {"480P", "720P", "1080P"}
EDIT_RESOLUTIONS = {"720P", "1080P"}
ALLOWED_RATIOS = {"16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "5:4", "9:21", "21:9"}
LIST_RATE_PER_SEC = {
    "480P": Decimal("0.45"),
    "720P": Decimal("0.9"),
    "1080P": Decimal("1.2"),
}
HH_T2V_MODEL = (os.environ.get("HAPPYHORSE_T2V_MODEL") or "happyhorse-1.1-t2v").strip()
HH_R2V_MODEL = (os.environ.get("HAPPYHORSE_R2V_MODEL") or "happyhorse-1.1-r2v").strip()
HH_EDIT_MODEL = (os.environ.get("HAPPYHORSE_EDIT_MODEL") or "happyhorse-1.0-video-edit").strip()
HH_MODEL = HH_T2V_MODEL
MAX_PROMPT_CHARS = 2500
MAX_REF_IMAGES = 9
MAX_EDIT_REF_IMAGES = 5
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_VIDEO_UPLOAD_BYTES = 45 * 1024 * 1024  # under nginx 50M; API allows 100MB
MAX_IMAGE_EDGE = 2048
TASK_TTL_SEC = 24 * 3600
TEMP_TTL_SEC = 2 * 3600

_TMP_ENV = (os.environ.get("HAPPYHORSE_TMP_DIR") or "").strip()
TEMP_DIR = Path(_TMP_ENV) if _TMP_ENV else Path(__file__).resolve().parent / "var" / "happyhorse-temp"
try:
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    TEMP_DIR = Path("/tmp") / "toolbasecamp-happyhorse"
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

_task_owners: Dict[str, Dict[str, Any]] = {}
_temp_files: Dict[str, Dict[str, Any]] = {}


def _dashscope_api_root() -> str:
    explicit = (
        os.environ.get("IMAGE_EDIT_DASHSCOPE_API_URL")
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
    return "https://dashscope.aliyuncs.com/api/v1"


def happyhorse_configured() -> bool:
    return bool(DASHSCOPE_API_KEY)


def list_price_cny(duration: int, resolution: str) -> float:
    rate = LIST_RATE_PER_SEC.get(resolution, LIST_RATE_PER_SEC["720P"])
    return float(money(rate * int(duration)))


def pricing_public() -> dict:
    markup = float(AI_MARKUP)
    list_map = {k: float(v) for k, v in LIST_RATE_PER_SEC.items()}
    return {
        "listPerSec": list_map,
        "userPerSec": {k: float(user_price_cny(v)) for k, v in list_map.items()},
        "markup": markup,
        "examples": [
            {
                "duration": d,
                "resolution": r,
                "listPriceCny": list_price_cny(d, r),
                "userPriceCny": float(user_price_cny(list_price_cny(d, r))),
            }
            for d, r in ((5, "720P"), (10, "720P"), (5, "1080P"))
        ],
        "minDuration": MIN_DURATION,
        "maxDuration": MAX_DURATION,
    }


def get_happyhorse_config() -> dict:
    return {
        "configured": happyhorse_configured(),
        "model": HH_T2V_MODEL,
        "t2vModel": HH_T2V_MODEL,
        "r2vModel": HH_R2V_MODEL,
        "editModel": HH_EDIT_MODEL,
        "api_root": _dashscope_api_root(),
        "paid": True,
        "pricing": pricing_public(),
        "minDuration": MIN_DURATION,
        "maxDuration": MAX_DURATION,
        "maxRefImages": MAX_REF_IMAGES,
        "maxEditRefImages": MAX_EDIT_REF_IMAGES,
        "maxVideoUploadMb": MAX_VIDEO_UPLOAD_BYTES // (1024 * 1024),
        "editResolutions": ["720P", "1080P"],
        "resolutions": ["480P", "720P", "1080P"],
        "ratios": list(ALLOWED_RATIOS),
    }


def _public_api_base() -> str:
    explicit = (os.environ.get("API_PUBLIC_BASE") or "").strip().rstrip("/")
    if explicit:
        return explicit
    return f"{SITE_BASE_URL.rstrip('/')}/api"


def _purge_temp_files() -> None:
    now = time.time()
    dead = [k for k, v in _temp_files.items() if now - float(v.get("created", 0)) > TEMP_TTL_SEC]
    for k in dead:
        meta = _temp_files.pop(k, None) or {}
        try:
            Path(str(meta.get("path") or "")).unlink(missing_ok=True)
        except Exception:
            pass


def _store_temp_video(raw: bytes, *, user_id: int, filename: str = "") -> str:
    _purge_temp_files()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty video")
    if len(raw) > MAX_VIDEO_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Video must be ≤ {MAX_VIDEO_UPLOAD_BYTES // (1024 * 1024)}MB",
        )
    name = (filename or "").lower()
    ext = ".mov" if name.endswith(".mov") else ".mp4"
    token = secrets.token_urlsafe(18)
    path = TEMP_DIR / f"{token}{ext}"
    path.write_bytes(raw)
    _temp_files[token] = {
        "path": str(path),
        "created": time.time(),
        "user_id": int(user_id),
        "ext": ext,
    }
    return f"{_public_api_base()}/happyhorse/temp/{token}{ext}"


def _validate_public_video_url(url: str) -> str:
    u = (url or "").strip()
    parsed = urlparse(u)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Video URL must be http(s)")
    return u



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
    reason = str(meta.get("charge_reason") or "happyhorse_t2v")
    conn = _conn()
    try:
        new_bal = try_charge(
            conn,
            int(user["id"]),
            charge,
            reason=reason,
            meta={
                "taskId": task_id,
                "duration": meta.get("duration"),
                "resolution": meta.get("resolution"),
                "ratio": meta.get("ratio"),
                "model": meta.get("model") or HH_T2V_MODEL,
                "mode": meta.get("mode") or "t2v",
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
    ratio: str,
    model: str,
    mode: str = "t2v",
    charge_reason: str = "happyhorse_t2v",
):
    _purge_tasks()
    _task_owners[task_id] = {
        "user_id": int(user_id),
        "created": time.time(),
        "video_url": None,
        "list_price": float(list_price),
        "duration": int(duration),
        "resolution": resolution,
        "ratio": ratio,
        "model": model,
        "mode": mode,
        "charge_reason": charge_reason,
        "charged": False,
        "charged_cny": None,
        "balance_after": None,
    }


def _image_to_data_url(raw: bytes, filename: str = "", *, min_side: int = 400) -> str:
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Each reference image must be ≤ 8MB")
    mime = "image/jpeg"
    name = (filename or "").lower()
    if name.endswith(".png"):
        mime = "image/png"
    elif name.endswith(".webp"):
        mime = "image/webp"
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(raw))
        img.load()
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        w, h = img.size
        if min(w, h) < min_side:
            raise HTTPException(
                status_code=400,
                detail=f"Reference image short side must be ≥ {min_side}px",
            )
        scale = min(1.0, MAX_IMAGE_EDGE / float(max(w, h)))
        if scale < 1.0:
            try:
                resample = Image.Resampling.LANCZOS
            except AttributeError:
                resample = Image.LANCZOS  # type: ignore[attr-defined]
            img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), resample)
        buf = io.BytesIO()
        if img.mode == "RGBA":
            img.save(buf, format="PNG", optimize=True)
            mime = "image/png"
        else:
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.save(buf, format="JPEG", quality=88, optimize=True)
            mime = "image/jpeg"
        raw = buf.getvalue()
    except HTTPException:
        raise
    except Exception:
        pass
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _parse_common_params(prompt: str, duration: int, resolution: str, ratio: str) -> tuple:
    plain = (prompt or "").strip()
    if not plain:
        raise HTTPException(status_code=400, detail="Please enter a prompt")
    if len(plain) > MAX_PROMPT_CHARS:
        plain = plain[:MAX_PROMPT_CHARS]
    duration = int(duration)
    if duration < MIN_DURATION or duration > MAX_DURATION:
        raise HTTPException(
            status_code=400,
            detail=f"Duration must be {MIN_DURATION}–{MAX_DURATION} seconds",
        )
    resolution = (resolution or "720P").upper()
    if resolution not in ALLOWED_RESOLUTIONS:
        raise HTTPException(status_code=400, detail="Resolution must be 480P, 720P or 1080P")
    ratio = (ratio or "16:9").strip()
    if ratio not in ALLOWED_RATIOS:
        ratio = "16:9"
    return plain, duration, resolution, ratio


async def _poll_and_charge(task_id: str, user: dict, proxy_prefix: str) -> dict:
    meta = _require_task_owner(task_id, user)
    data = await _dashscope_get_task(task_id)
    output = data.get("output") if isinstance(data.get("output"), dict) else {}
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
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
        if meta.get("mode") == "edit" and usage and not meta.get("charged"):
            try:
                actual = float(
                    usage.get("output_video_duration")
                    or usage.get("duration")
                    or meta.get("duration")
                    or DEFAULT_DURATION
                )
                actual_sec = max(MIN_DURATION, min(MAX_DURATION, int(math.ceil(actual))))
                meta["duration"] = actual_sec
                meta["list_price"] = list_price_cny(
                    actual_sec, str(meta.get("resolution") or "720P")
                )
            except Exception:
                pass
        balance_after = _ensure_charged(meta, user, task_id)
        charged_cny = meta.get("charged_cny")
    return {
        "success": True,
        "task_id": task_id,
        "status": status or "PENDING",
        "video_url": video_url or None,
        "proxy_url": f"{proxy_prefix}/{task_id}" if video_url or status == "SUCCEEDED" else None,
        "message": message,
        "listPriceCny": meta.get("list_price"),
        "userPriceCny": float(user_price_cny(meta.get("list_price") or 0)),
        "chargedCny": charged_cny,
        "wallet": _wallet_for(user) if status == "SUCCEEDED" else None,
        "balanceAfter": balance_after,
    }



async def _proxy_video(task_id: str, user: dict, filename: str) -> StreamingResponse:
    meta = _require_task_owner(task_id, user)
    video_url = meta.get("video_url") or ""
    if not video_url:
        data = await _dashscope_get_task(task_id)
        output = data.get("output") if isinstance(data.get("output"), dict) else {}
        video_url = _extract_video_url(output)
        if video_url:
            meta["video_url"] = video_url
    if not video_url:
        raise HTTPException(status_code=404, detail="Video not ready")
    if not meta.get("charged"):
        _ensure_charged(meta, user, task_id)

    parsed = urlparse(str(video_url))
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=502, detail="Invalid video URL")

    async def stream():
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            async with client.stream("GET", video_url) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes(64 * 1024):
                    yield chunk

    return StreamingResponse(
        stream(),
        media_type="video/mp4",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _require_task_owner(task_id: str, user: dict) -> Dict[str, Any]:
    meta = _task_owners.get(task_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Task not found or expired")
    if int(meta["user_id"]) != int(user["id"]) and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Task not found or expired")
    return meta


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
        async with httpx.AsyncClient(timeout=HH_TIMEOUT) as client:
            res = await client.post(url, headers=headers, json=payload)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="HappyHorse API timeout. Please try again.")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"HappyHorse API network error: {exc}") from exc

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
            or (res.text or "")[:300]
            or res.reason_phrase
        )
        raise HTTPException(status_code=502, detail=f"HappyHorse API error: {msg}")
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
        async with httpx.AsyncClient(timeout=HH_TIMEOUT) as client:
            res = await client.get(url, headers=headers)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="HappyHorse API timeout. Please try again.")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"HappyHorse API network error: {exc}") from exc

    data: dict = {}
    try:
        data = res.json() if res.content else {}
    except Exception:
        data = {}
    if res.status_code >= 400:
        msg = data.get("message") or data.get("code") or (res.text or "")[:300] or res.reason_phrase
        raise HTTPException(status_code=502, detail=f"HappyHorse API error: {msg}")
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
def hh_status(user: dict = Depends(_user)):
    return {
        **get_happyhorse_config(),
        "isAdmin": _is_admin(user),
        "wallet": _wallet_for(user),
    }


@router.post("/t2v/submit")
async def hh_t2v_submit(
    prompt: str = Form(...),
    duration: int = Form(DEFAULT_DURATION),
    resolution: str = Form("720P"),
    ratio: str = Form("16:9"),
    user: dict = Depends(_user),
):
    if not happyhorse_configured():
        raise HTTPException(
            status_code=503,
            detail="DashScope is not configured (DASHSCOPE_API_KEY).",
        )
    plain, duration, resolution, ratio = _parse_common_params(prompt, duration, resolution, ratio)
    list_price = list_price_cny(duration, resolution)
    _assert_can_afford(user, list_price)

    payload = {
        "model": HH_T2V_MODEL,
        "input": {"prompt": plain},
        "parameters": {
            "resolution": resolution,
            "ratio": ratio,
            "duration": duration,
            "watermark": False,
        },
    }
    data = await _dashscope_post("/services/aigc/video-generation/video-synthesis", payload)
    output = data.get("output") if isinstance(data.get("output"), dict) else {}
    task_id = str((output or {}).get("task_id") or data.get("task_id") or "").strip()
    if not task_id:
        raise HTTPException(
            status_code=502,
            detail="HappyHorse API did not return a task_id.",
        )

    _remember_task(
        task_id,
        int(user["id"]),
        list_price=list_price,
        duration=duration,
        resolution=resolution,
        ratio=ratio,
        model=HH_T2V_MODEL,
        mode="t2v",
        charge_reason="happyhorse_t2v",
    )
    return {
        "success": True,
        "task_id": task_id,
        "model": HH_T2V_MODEL,
        "duration": duration,
        "resolution": resolution,
        "ratio": ratio,
        "listPriceCny": list_price,
        "userPriceCny": float(user_price_cny(list_price)),
        "wallet": _wallet_for(user),
    }


@router.get("/t2v/task/{task_id}")
async def hh_t2v_task(task_id: str, user: dict = Depends(_user)):
    task_id = (task_id or "").strip()
    if not re.match(r"^[\w\-]{8,128}$", task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")
    return await _poll_and_charge(task_id, user, "/happyhorse/t2v/proxy")


@router.get("/t2v/proxy/{task_id}")
async def hh_t2v_proxy(task_id: str, user: dict = Depends(_user)):
    task_id = (task_id or "").strip()
    if not re.match(r"^[\w\-]{8,128}$", task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")
    return await _proxy_video(task_id, user, "happyhorse-t2v.mp4")


@router.post("/r2v/submit")
async def hh_r2v_submit(
    prompt: str = Form(...),
    duration: int = Form(DEFAULT_DURATION),
    resolution: str = Form("720P"),
    ratio: str = Form("16:9"),
    images: List[UploadFile] = File(...),
    user: dict = Depends(_user),
):
    if not happyhorse_configured():
        raise HTTPException(
            status_code=503,
            detail="DashScope is not configured (DASHSCOPE_API_KEY).",
        )
    plain, duration, resolution, ratio = _parse_common_params(prompt, duration, resolution, ratio)

    files = [f for f in (images or []) if f is not None]
    if not files:
        raise HTTPException(status_code=400, detail="Please upload 1–9 reference images")
    if len(files) > MAX_REF_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"At most {MAX_REF_IMAGES} reference images",
        )

    media: List[Dict[str, str]] = []
    for f in files:
        raw = await f.read()
        data_url = _image_to_data_url(raw, f.filename or "")
        media.append({"type": "reference_image", "url": data_url})

    list_price = list_price_cny(duration, resolution)
    _assert_can_afford(user, list_price)

    payload = {
        "model": HH_R2V_MODEL,
        "input": {
            "prompt": plain,
            "media": media,
        },
        "parameters": {
            "resolution": resolution,
            "ratio": ratio,
            "duration": duration,
            "watermark": False,
        },
    }
    data = await _dashscope_post("/services/aigc/video-generation/video-synthesis", payload)
    output = data.get("output") if isinstance(data.get("output"), dict) else {}
    task_id = str((output or {}).get("task_id") or data.get("task_id") or "").strip()
    if not task_id:
        raise HTTPException(
            status_code=502,
            detail="HappyHorse API did not return a task_id.",
        )

    _remember_task(
        task_id,
        int(user["id"]),
        list_price=list_price,
        duration=duration,
        resolution=resolution,
        ratio=ratio,
        model=HH_R2V_MODEL,
        mode="r2v",
        charge_reason="happyhorse_r2v",
    )
    return {
        "success": True,
        "task_id": task_id,
        "model": HH_R2V_MODEL,
        "duration": duration,
        "resolution": resolution,
        "ratio": ratio,
        "refCount": len(media),
        "listPriceCny": list_price,
        "userPriceCny": float(user_price_cny(list_price)),
        "wallet": _wallet_for(user),
    }


@router.get("/r2v/task/{task_id}")
async def hh_r2v_task(task_id: str, user: dict = Depends(_user)):
    task_id = (task_id or "").strip()
    if not re.match(r"^[\w\-]{8,128}$", task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")
    return await _poll_and_charge(task_id, user, "/happyhorse/r2v/proxy")


@router.get("/r2v/proxy/{task_id}")
async def hh_r2v_proxy(task_id: str, user: dict = Depends(_user)):
    task_id = (task_id or "").strip()
    if not re.match(r"^[\w\-]{8,128}$", task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")
    return await _proxy_video(task_id, user, "happyhorse-r2v.mp4")


@router.get("/temp/{name}")
def hh_temp_file(name: str):
    """Public short-lived source video for DashScope to fetch (no auth)."""
    _purge_temp_files()
    m = re.match(r"^([A-Za-z0-9_\-]{16,64})(\.mp4|\.mov)$", name or "")
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    token, ext = m.group(1), m.group(2)
    meta = _temp_files.get(token)
    if not meta:
        raise HTTPException(status_code=404, detail="Not found or expired")
    path = Path(str(meta.get("path") or ""))
    if not path.is_file():
        _temp_files.pop(token, None)
        raise HTTPException(status_code=404, detail="Not found or expired")
    media = "video/quicktime" if ext == ".mov" else "video/mp4"
    return FileResponse(path, media_type=media, filename=f"source{ext}")


@router.post("/edit/submit")
async def hh_edit_submit(
    prompt: str = Form(...),
    resolution: str = Form("720P"),
    audio_setting: str = Form("origin"),
    duration: int = Form(10),
    video_url: str = Form(""),
    video: Optional[UploadFile] = File(None),
    images: Optional[List[UploadFile]] = File(None),
    user: dict = Depends(_user),
):
    if not happyhorse_configured():
        raise HTTPException(
            status_code=503,
            detail="DashScope is not configured (DASHSCOPE_API_KEY).",
        )
    plain = (prompt or "").strip()
    if not plain:
        raise HTTPException(status_code=400, detail="Please enter a prompt")
    if len(plain) > MAX_PROMPT_CHARS:
        plain = plain[:MAX_PROMPT_CHARS]

    resolution = (resolution or "720P").upper()
    if resolution not in EDIT_RESOLUTIONS:
        raise HTTPException(status_code=400, detail="Resolution must be 720P or 1080P")
    audio = (audio_setting or "origin").strip().lower()
    if audio not in ("origin", "auto"):
        audio = "origin"

    # Bill estimate for afford; actual charged from usage on success (≤15s).
    duration = int(duration)
    if duration < MIN_DURATION or duration > MAX_DURATION:
        duration = 10
    # Afford worst-case 15s so usage-based charge won't surprise.
    _assert_can_afford(user, list_price_cny(MAX_DURATION, resolution))

    source_url = (video_url or "").strip()
    if video is not None and (getattr(video, "filename", None) or getattr(video, "content_type", None)):
        raw = await video.read()
        if raw:
            source_url = _store_temp_video(raw, user_id=int(user["id"]), filename=video.filename or "")
    if source_url and not source_url.startswith(_public_api_base()):
        # user-provided external URL
        if not source_url.startswith("http"):
            raise HTTPException(status_code=400, detail="Please upload a video or provide a video URL")
        source_url = _validate_public_video_url(source_url)
    if not source_url:
        raise HTTPException(status_code=400, detail="Please upload a video or provide a video URL")

    media: List[Dict[str, str]] = [{"type": "video", "url": source_url}]
    refs = [f for f in (images or []) if f is not None and (getattr(f, "filename", None) or getattr(f, "content_type", None))]
    if len(refs) > MAX_EDIT_REF_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"At most {MAX_EDIT_REF_IMAGES} reference images",
        )
    for f in refs:
        raw = await f.read()
        media.append(
            {
                "type": "reference_image",
                "url": _image_to_data_url(raw, f.filename or "", min_side=300),
            }
        )

    list_price = list_price_cny(duration, resolution)
    payload = {
        "model": HH_EDIT_MODEL,
        "input": {"prompt": plain, "media": media},
        "parameters": {
            "resolution": resolution,
            "watermark": False,
            "audio_setting": audio,
        },
    }
    data = await _dashscope_post("/services/aigc/video-generation/video-synthesis", payload)
    output = data.get("output") if isinstance(data.get("output"), dict) else {}
    task_id = str((output or {}).get("task_id") or data.get("task_id") or "").strip()
    if not task_id:
        raise HTTPException(
            status_code=502,
            detail="HappyHorse API did not return a task_id.",
        )

    _remember_task(
        task_id,
        int(user["id"]),
        list_price=list_price,
        duration=duration,
        resolution=resolution,
        ratio="",
        model=HH_EDIT_MODEL,
        mode="edit",
        charge_reason="happyhorse_edit",
    )
    return {
        "success": True,
        "task_id": task_id,
        "model": HH_EDIT_MODEL,
        "duration": duration,
        "resolution": resolution,
        "audioSetting": audio,
        "refCount": len(refs),
        "listPriceCny": list_price,
        "userPriceCny": float(user_price_cny(list_price)),
        "wallet": _wallet_for(user),
    }


@router.get("/edit/task/{task_id}")
async def hh_edit_task(task_id: str, user: dict = Depends(_user)):
    task_id = (task_id or "").strip()
    if not re.match(r"^[\w\-]{8,128}$", task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")
    return await _poll_and_charge(task_id, user, "/happyhorse/edit/proxy")


@router.get("/edit/proxy/{task_id}")
async def hh_edit_proxy(task_id: str, user: dict = Depends(_user)):
    task_id = (task_id or "").strip()
    if not re.match(r"^[\w\-]{8,128}$", task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")
    return await _proxy_video(task_id, user, "happyhorse-edit.mp4")
