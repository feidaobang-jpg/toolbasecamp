"""Alibaba Fun Music (DashScope / Model Studio) — sync generate + charge on success.

Uses the same DASHSCOPE_API_KEY as image tools. Fun Music is invite-only in 华北2（北京）.

Billing: vendor list ¥0.002/s (fun-music-v1) × AI_PRICE_MARKUP; charge actual usage.duration.
"""

from __future__ import annotations

import os
import secrets
import time
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ai_wallet import (
    AI_MARKUP,
    money,
    require_can_afford,
    try_charge,
    user_price_cny,
    wallet_public,
)
from recipe_ai import DASHSCOPE_API_KEY

security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/music", tags=["music"])

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@toolbasecamp.com").lower()
FUN_MUSIC_TIMEOUT = float(os.environ.get("FUN_MUSIC_TIMEOUT", "360"))
FUN_MUSIC_MODEL = (os.environ.get("FUN_MUSIC_MODEL") or "fun-music-v1").strip() or "fun-music-v1"
# Vendor list CNY per output second (百炼刊例)
LIST_RATE_PER_SEC = {
    "fun-music-v1": Decimal("0.002"),
    "fun-music-preview": Decimal("0.005"),
}
# Pre-check estimate when duration unknown
EST_SECONDS = int(os.environ.get("FUN_MUSIC_EST_SECONDS", "120"))
RESULT_TTL_SEC = 24 * 3600
TMP_DIR = Path(os.environ.get("FUN_MUSIC_TMP_DIR") or (Path(__file__).resolve().parent / "tmp_music"))
TMP_DIR.mkdir(parents=True, exist_ok=True)

# result_id -> meta
_results: Dict[str, Dict[str, Any]] = {}


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


def fun_music_configured() -> bool:
    return bool(DASHSCOPE_API_KEY)


def _api_url() -> str:
    explicit = (os.environ.get("FUN_MUSIC_API_URL") or "").strip().rstrip("/")
    if explicit:
        return explicit
    ws = (
        os.environ.get("FUN_MUSIC_WORKSPACE_ID")
        or os.environ.get("DASHSCOPE_WORKSPACE_ID")
        or ""
    ).strip()
    if ws:
        return f"https://{ws}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/music/generation"
    return "https://dashscope.aliyuncs.com/api/v1/services/audio/music/generation"


def _list_rate(model: str) -> Decimal:
    return LIST_RATE_PER_SEC.get((model or "").strip(), LIST_RATE_PER_SEC["fun-music-v1"])


def _list_price_for_seconds(model: str, seconds: int) -> Decimal:
    sec = max(1, int(seconds or 1))
    return money(_list_rate(model) * sec)


def pricing_public() -> dict:
    model = FUN_MUSIC_MODEL
    rate = float(_list_rate(model))
    est = max(30, EST_SECONDS)
    list_est = float(_list_price_for_seconds(model, est))
    return {
        "model": model,
        "listRatePerSecCny": rate,
        "estSeconds": est,
        "listEstCny": list_est,
        "userEstCny": float(user_price_cny(list_est)),
        "markup": float(AI_MARKUP),
    }


def get_fun_music_config() -> dict:
    return {
        "configured": fun_music_configured(),
        "model": FUN_MUSIC_MODEL,
        "apiUrl": _api_url(),
        "pricing": pricing_public(),
    }


def _wallet_for(user: dict) -> dict:
    conn = _conn()
    try:
        return wallet_public(conn, user, is_admin=_is_admin(user))
    finally:
        conn.close()


def _assert_can_afford(user: dict, list_price: Decimal) -> None:
    if _is_admin(user):
        return
    conn = _conn()
    try:
        require_can_afford(conn, int(user["id"]), list_price)
    finally:
        conn.close()


def _charge_success(user: dict, list_price: Decimal, *, meta: dict) -> Optional[float]:
    if _is_admin(user):
        return None
    charge = user_price_cny(list_price)
    conn = _conn()
    try:
        new_bal = try_charge(
            conn,
            int(user["id"]),
            charge,
            reason="ai_music",
            meta={
                **meta,
                "listPriceCny": float(list_price),
                "chargedCny": float(charge),
            },
        )
        if new_bal is None:
            raise HTTPException(status_code=402, detail="Insufficient AI balance")
        return float(new_bal)
    finally:
        conn.close()


def _purge_old_results() -> None:
    now = time.time()
    dead = [rid for rid, meta in _results.items() if now - float(meta.get("created") or 0) > RESULT_TTL_SEC]
    for rid in dead:
        meta = _results.pop(rid, None) or {}
        path = meta.get("path")
        if path:
            try:
                Path(path).unlink(missing_ok=True)
            except Exception:
                pass


def _parse_bool(value: Any, *, default: bool = False) -> bool:
    if value is None:
        return default
    s = str(value).strip().lower()
    if s in ("1", "true", "yes", "on", "y"):
        return True
    if s in ("0", "false", "no", "off", "n", ""):
        return False
    return default


@router.get("/status")
def music_status(user: dict = Depends(_user)):
    return {
        "configured": fun_music_configured(),
        "isAdmin": _is_admin(user),
        "wallet": _wallet_for(user),
        "pricing": pricing_public(),
        "apiUrlHost": _api_url().split("/")[2] if "://" in _api_url() else "",
        "inviteNote": True,
    }


@router.post("/generate")
async def music_generate(
    prompt: str = Form(""),
    lyrics: str = Form(""),
    gender: str = Form("female"),
    instrumental: str = Form("0"),
    format: str = Form("mp3"),
    model: str = Form(""),
    user: dict = Depends(_user),
):
    if not fun_music_configured():
        raise HTTPException(
            status_code=503,
            detail="DashScope is not configured (DASHSCOPE_API_KEY).",
        )

    use_model = (model or FUN_MUSIC_MODEL).strip() or FUN_MUSIC_MODEL
    if use_model not in LIST_RATE_PER_SEC:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model. Use one of: {', '.join(sorted(LIST_RATE_PER_SEC))}",
        )

    prompt_text = (prompt or "").strip()
    lyrics_text = (lyrics or "").strip()
    is_instrumental = _parse_bool(instrumental, default=False)
    fmt = (format or "mp3").strip().lower()
    if fmt not in ("mp3", "wav"):
        fmt = "mp3"
    g = (gender or "female").strip().lower()
    if g not in ("male", "female"):
        g = "female"

    if is_instrumental:
        if not prompt_text:
            raise HTTPException(status_code=400, detail="Please enter a music prompt for instrumental.")
        if len(prompt_text) > 2000:
            raise HTTPException(status_code=400, detail="Prompt is too long (max 2000 characters).")
    else:
        if not prompt_text and not lyrics_text:
            raise HTTPException(status_code=400, detail="Please enter a prompt or lyrics.")
        if lyrics_text and len(lyrics_text) > 3500:
            raise HTTPException(status_code=400, detail="Lyrics are too long.")
        if prompt_text and len(prompt_text) > 2000:
            raise HTTPException(status_code=400, detail="Prompt is too long (max 2000 characters).")

    est_list = _list_price_for_seconds(use_model, EST_SECONDS)
    _assert_can_afford(user, est_list)

    input_obj: Dict[str, Any] = {
        "format": fmt,
        "enable_aigc_watermark": False,
    }
    if is_instrumental:
        input_obj["is_instrumental"] = True
        input_obj["prompt"] = prompt_text
    else:
        input_obj["is_instrumental"] = False
        if lyrics_text:
            input_obj["lyrics"] = lyrics_text
        elif prompt_text:
            input_obj["prompt"] = prompt_text
        if use_model == "fun-music-v1":
            input_obj["gender"] = g

    payload = {"model": use_model, "input": input_obj}
    headers = {
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }
    url = _api_url()

    try:
        async with httpx.AsyncClient(timeout=FUN_MUSIC_TIMEOUT) as client:
            resp = await client.post(url, headers=headers, json=payload)
            try:
                data = resp.json() if resp.content else {}
            except Exception:
                data = {}
            if resp.status_code >= 400 or data.get("code"):
                msg = (
                    data.get("message")
                    or data.get("code")
                    or (resp.text[:400] if resp.text else resp.reason_phrase)
                )
                raise HTTPException(status_code=502, detail=f"Fun Music API error: {msg}")

            output = data.get("output") if isinstance(data, dict) else None
            if not isinstance(output, dict):
                raise HTTPException(status_code=502, detail="Fun Music returned no output.")
            audio = output.get("audio") if isinstance(output.get("audio"), dict) else {}
            audio_url = str(audio.get("url") or "").strip()
            if not audio_url:
                raise HTTPException(
                    status_code=502,
                    detail="Fun Music returned no audio URL. Check invite access on Model Studio.",
                )

            usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
            duration = int(usage.get("duration") or 0)
            if duration < 1:
                duration = EST_SECONDS

            extra = output.get("extra_info") if isinstance(output.get("extra_info"), dict) else {}
            out_lyrics = str(extra.get("lyrics") or lyrics_text or "")

            audio_resp = await client.get(audio_url)
            if audio_resp.status_code >= 400 or not audio_resp.content:
                raise HTTPException(status_code=502, detail="Failed to download generated audio.")
            ctype = (audio_resp.headers.get("content-type") or "").split(";")[0].strip()
            if fmt == "wav":
                ctype = ctype or "audio/wav"
                ext = ".wav"
            else:
                ctype = ctype if ctype.startswith("audio/") else "audio/mpeg"
                ext = ".mp3"

            _purge_old_results()
            result_id = secrets.token_hex(16)
            path = TMP_DIR / f"{result_id}{ext}"
            path.write_bytes(audio_resp.content)

            list_price = _list_price_for_seconds(use_model, duration)
            charged_cny = 0.0
            try:
                bal_after = _charge_success(
                    user,
                    list_price,
                    meta={
                        "model": use_model,
                        "duration": duration,
                        "instrumental": is_instrumental,
                        "resultId": result_id,
                    },
                )
                if not _is_admin(user):
                    charged_cny = float(user_price_cny(list_price))
            except HTTPException:
                try:
                    path.unlink(missing_ok=True)
                except Exception:
                    pass
                raise

            _results[result_id] = {
                "user_id": int(user["id"]),
                "created": time.time(),
                "path": str(path),
                "content_type": ctype,
                "ext": ext,
                "model": use_model,
                "duration": duration,
                "list_price": float(list_price),
                "charged": charged_cny,
                "lyrics": out_lyrics,
                "balance_after": bal_after,
            }
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Music generation timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Music generation failed: {exc}") from exc

    wallet = _wallet_for(user)
    return {
        "success": True,
        "resultId": result_id,
        "model": use_model,
        "duration": duration,
        "listPriceCny": float(list_price),
        "userPriceCny": float(user_price_cny(list_price)),
        "chargedCny": charged_cny,
        "lyrics": out_lyrics,
        "contentType": ctype,
        "proxyUrl": f"/music/result/{result_id}",
        "downloadUrl": f"/music/result/{result_id}?download=1",
        "wallet": wallet,
        "aiWallet": wallet,
        "balanceCny": wallet.get("balanceCny"),
    }


@router.get("/result/{result_id}")
def music_result(
    result_id: str,
    download: int = 0,
    user: dict = Depends(_user),
):
    _purge_old_results()
    meta = _results.get(result_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Music result expired or not found")
    if int(meta.get("user_id") or 0) != int(user["id"]) and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    path = Path(str(meta.get("path") or ""))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Music file missing")
    filename = f"fun-music-{result_id}{meta.get('ext') or '.mp3'}"
    headers = {}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    else:
        headers["Content-Disposition"] = f'inline; filename="{filename}"'
    return FileResponse(
        path,
        media_type=str(meta.get("content_type") or "audio/mpeg"),
        headers=headers,
        filename=filename if download else None,
    )
