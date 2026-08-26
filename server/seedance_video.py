"""Seedance 2.5 参考生 (逍遥 lk888) — async submit + poll + proxy.

Model: doubao-seedance-2-5-cankaosheng
Billing: estimate list from token formula × 火山官方价；成功后优先用 status.cost 结算；× AI_PRICE_MARKUP。
"""

from __future__ import annotations

import os
import re
import time
from decimal import Decimal
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ai_wallet import (
    AI_MARKUP,
    money,
    require_can_afford,
    try_charge,
    user_price_cny,
    wallet_public,
)
from lk888_video import (
    SEEDANCE_R2V_MODEL,
    bytes_to_data_url,
    lk888_video_configured,
    poll_media_status_once,
    sniff_image_mime,
    submit_seedance_r2v,
)


def seedance_configured() -> bool:
    return lk888_video_configured()

security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/seedance", tags=["seedance"])

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@zhengxiaohui.cn").lower()
MIN_DURATION = 4
MAX_DURATION = 30
DEFAULT_DURATION = 10
MAX_REF_IMAGES = 9
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PROMPT_CHARS = 2500
TASK_TTL_SEC = 24 * 3600

ALLOWED_RESOLUTIONS = {"480p", "720p"}
ALLOWED_RATIOS = {
    "adaptive",
    "16:9",
    "9:16",
    "1:1",
    "4:3",
    "3:4",
    "21:9",
}

# 火山官方 output ≈138.86 算力/百万 token；tokens/s ≈ w×h×24/1024
_TOKENS_PER_SEC = {
    "480p": Decimal("9608"),
    "720p": Decimal("21600"),
}
_OUT_PRICE_PER_M = Decimal(
    (os.environ.get("SEEDANCE_OUT_PRICE_PER_M") or "138.8625").strip() or "138.8625"
)

_task_owners: Dict[str, Dict[str, Any]] = {}


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


def estimate_list_price_cny(duration: int, resolution: str) -> float:
    res = (resolution or "720p").lower()
    if res not in _TOKENS_PER_SEC:
        res = "720p"
    tokens = _TOKENS_PER_SEC[res] * Decimal(int(duration))
    cost = tokens / Decimal(1000000) * _OUT_PRICE_PER_M
    return float(money(cost))


def list_price_cny(duration: int, resolution: str) -> float:
    return estimate_list_price_cny(duration, resolution)


def pricing_public() -> dict:
    markup = float(AI_MARKUP)
    list_map = {
        "480p": float(money(_TOKENS_PER_SEC["480p"] / Decimal(1000000) * _OUT_PRICE_PER_M)),
        "720p": float(money(_TOKENS_PER_SEC["720p"] / Decimal(1000000) * _OUT_PRICE_PER_M)),
        # UI often uses uppercase
        "480P": float(money(_TOKENS_PER_SEC["480p"] / Decimal(1000000) * _OUT_PRICE_PER_M)),
        "720P": float(money(_TOKENS_PER_SEC["720p"] / Decimal(1000000) * _OUT_PRICE_PER_M)),
    }
    return {
        "listPerSec": list_map,
        "userPerSec": {k: float(user_price_cny(v)) for k, v in list_map.items()},
        "markup": markup,
        "billing": "token",
        "note": "Estimate from Seedance token formula × 逍遥火山官方价；成功后按实际 cost 结算。",
        "examples": [
            {
                "duration": d,
                "resolution": r,
                "listPriceCny": list_price_cny(d, r),
                "userPriceCny": float(user_price_cny(list_price_cny(d, r))),
            }
            for d, r in ((5, "720p"), (10, "720p"), (5, "480p"))
        ],
        "minDuration": MIN_DURATION,
        "maxDuration": MAX_DURATION,
    }


def get_seedance_config() -> dict:
    return {
        "configured": lk888_video_configured(),
        "model": SEEDANCE_R2V_MODEL,
        "r2vModel": SEEDANCE_R2V_MODEL,
        "provider": "lk888",
        "paid": True,
        "pricing": pricing_public(),
        "minDuration": MIN_DURATION,
        "maxDuration": MAX_DURATION,
        "maxRefImages": MAX_REF_IMAGES,
        "resolutions": ["480p", "720p"],
        "ratios": list(ALLOWED_RATIOS),
    }


def _purge_tasks() -> None:
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
) -> None:
    _purge_tasks()
    _task_owners[task_id] = {
        "user_id": int(user_id),
        "created": time.time(),
        "list_price": float(list_price),
        "duration": int(duration),
        "resolution": resolution,
        "ratio": ratio,
        "model": SEEDANCE_R2V_MODEL,
        "mode": "r2v",
        "charge_reason": "seedance_r2v",
        "charged": False,
        "video_url": "",
    }


def _require_task_owner(task_id: str, user: dict) -> Dict[str, Any]:
    meta = _task_owners.get(task_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Task not found or expired")
    if int(meta["user_id"]) != int(user["id"]) and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Task not found or expired")
    return meta


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
            reason=str(meta.get("charge_reason") or "seedance_r2v"),
            meta={
                "taskId": task_id,
                "model": meta.get("model"),
                "duration": meta.get("duration"),
                "resolution": meta.get("resolution"),
                "listPriceCny": list_price,
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


def _normalize_resolution(raw: str) -> str:
    r = (raw or "720p").strip().lower().replace(" ", "")
    if r in ("480", "480p"):
        return "480p"
    if r in ("720", "720p"):
        return "720p"
    raise HTTPException(status_code=400, detail="Seedance only supports 480p / 720p")


def _normalize_ratio(raw: str) -> str:
    r = (raw or "16:9").strip()
    if r not in ALLOWED_RATIOS:
        raise HTTPException(status_code=400, detail="Invalid aspect ratio")
    return r


def _normalize_duration(raw: Any) -> tuple[str, int]:
    """Return (api_duration_str, estimate_seconds)."""
    s = str(raw or "").strip().lower()
    if s in ("auto", ""):
        return "auto", DEFAULT_DURATION
    try:
        n = int(float(s))
    except (TypeError, ValueError):
        n = DEFAULT_DURATION
    n = max(MIN_DURATION, min(MAX_DURATION, n))
    return str(n), n


def _rewrite_prompt_refs(prompt: str) -> str:
    """Map [Image N] → @图像N for Seedance."""
    text = (prompt or "").strip()

    def repl(m: re.Match) -> str:
        return f"@图像{m.group(1)}"

    text = re.sub(r"\[\s*[Ii]mage\s*(\d+)\s*\]", repl, text)
    text = re.sub(r"\[\s*图像\s*(\d+)\s*\]", repl, text)
    return text


@router.get("/status")
def seedance_status(user: dict = Depends(_user)):
    return {
        **get_seedance_config(),
        "isAdmin": _is_admin(user),
        "wallet": _wallet_for(user),
    }


@router.post("/r2v/submit")
async def seedance_r2v_submit(
    prompt: str = Form(...),
    duration: str = Form(str(DEFAULT_DURATION)),
    resolution: str = Form("720p"),
    ratio: str = Form("16:9"),
    images: List[UploadFile] = File(...),
    user: dict = Depends(_user),
):
    if not lk888_video_configured():
        raise HTTPException(
            status_code=503,
            detail="逍遥 AI is not configured (LK888_API_KEY).",
        )
    plain = _rewrite_prompt_refs(prompt)
    if not plain:
        raise HTTPException(status_code=400, detail="Please enter a prompt")
    if len(plain) > MAX_PROMPT_CHARS:
        raise HTTPException(status_code=400, detail="Prompt is too long")

    dur_api, dur_est = _normalize_duration(duration)
    res = _normalize_resolution(resolution)
    aspect = _normalize_ratio(ratio)

    files = [f for f in (images or []) if f is not None]
    if not files:
        raise HTTPException(status_code=400, detail="Please upload 1–9 reference images")
    if len(files) > MAX_REF_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"At most {MAX_REF_IMAGES} reference images",
        )

    data_urls: List[str] = []
    total = 0
    for f in files:
        raw = await f.read()
        if not raw:
            continue
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail="Each image must be ≤ 10MB")
        total += len(raw)
        if total > 30 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Total image size must be ≤ 30MB")
        mime = sniff_image_mime(raw, f.filename or "")
        data_urls.append(bytes_to_data_url(raw, mime))
    if not data_urls:
        raise HTTPException(status_code=400, detail="Please upload 1–9 reference images")

    list_price = list_price_cny(dur_est, res)
    _assert_can_afford(user, list_price)

    vendor_task_id = await submit_seedance_r2v(
        prompt=plain,
        image_data_urls=data_urls,
        duration=dur_api,
        resolution=res,
        aspect_ratio=aspect,
    )
    task_id = str(vendor_task_id)
    _remember_task(
        task_id,
        int(user["id"]),
        list_price=list_price,
        duration=dur_est,
        resolution=res,
        ratio=aspect,
    )
    return {
        "success": True,
        "task_id": task_id,
        "model": SEEDANCE_R2V_MODEL,
        "provider": "lk888",
        "duration": dur_est,
        "durationApi": dur_api,
        "resolution": res,
        "ratio": aspect,
        "refCount": len(data_urls),
        "listPriceCny": list_price,
        "userPriceCny": float(user_price_cny(list_price)),
        "wallet": _wallet_for(user),
    }


@router.get("/r2v/task/{task_id}")
async def seedance_r2v_task(task_id: str, user: dict = Depends(_user)):
    task_id = (task_id or "").strip()
    if not re.match(r"^\d{4,20}$", task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")
    meta = _require_task_owner(task_id, user)

    polled = await poll_media_status_once(int(task_id))
    status = str(polled.get("status") or "PENDING").upper()
    message = str(polled.get("message") or "")
    video_url = str(polled.get("video_url") or meta.get("video_url") or "")
    if video_url:
        meta["video_url"] = video_url

    balance_after = None
    charged_cny = None
    if status == "SUCCEEDED" and video_url:
        actual_cost = polled.get("cost")
        if actual_cost is not None:
            try:
                c = float(actual_cost)
                if c > 0:
                    meta["list_price"] = float(money(Decimal(str(c))))
            except Exception:
                pass
        balance_after = _ensure_charged(meta, user, task_id)
        charged_cny = meta.get("charged_cny")

    return {
        "success": True,
        "task_id": task_id,
        "status": status,
        "video_url": video_url or None,
        "proxy_url": f"/seedance/r2v/proxy/{task_id}" if video_url or status == "SUCCEEDED" else None,
        "message": message,
        "progress": polled.get("progress"),
        "listPriceCny": meta.get("list_price"),
        "userPriceCny": float(user_price_cny(meta.get("list_price") or 0)),
        "chargedCny": charged_cny,
        "wallet": _wallet_for(user) if status == "SUCCEEDED" else None,
        "balanceAfter": balance_after,
    }


@router.get("/r2v/proxy/{task_id}")
async def seedance_r2v_proxy(task_id: str, user: dict = Depends(_user)):
    task_id = (task_id or "").strip()
    if not re.match(r"^\d{4,20}$", task_id):
        raise HTTPException(status_code=400, detail="Invalid task id")
    meta = _require_task_owner(task_id, user)
    video_url = meta.get("video_url") or ""
    if not video_url:
        polled = await poll_media_status_once(int(task_id))
        if str(polled.get("status") or "").upper() == "SUCCEEDED":
            video_url = str(polled.get("video_url") or "")
            if video_url:
                meta["video_url"] = video_url
            actual_cost = polled.get("cost")
            if actual_cost is not None:
                try:
                    c = float(actual_cost)
                    if c > 0:
                        meta["list_price"] = float(money(Decimal(str(c))))
                except Exception:
                    pass
    if not video_url:
        raise HTTPException(status_code=404, detail="Video not ready")
    if not meta.get("charged"):
        _ensure_charged(meta, user, task_id)

    parsed = urlparse(str(video_url))
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=502, detail="Invalid video URL")

    async def stream():
        async with httpx.AsyncClient(timeout=180.0, follow_redirects=True) as client:
            async with client.stream("GET", video_url) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes(64 * 1024):
                    yield chunk

    return StreamingResponse(
        stream(),
        media_type="video/mp4",
        headers={"Content-Disposition": 'attachment; filename="seedance-r2v.mp4"'},
    )
