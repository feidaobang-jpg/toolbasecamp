"""逍遥 AI (lk888) Suno music via async media API.

POST /media/generate { model: suno-v4.5, prompt, params }
GET  /media/status?task_id=… → result_url (audio)
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any, Optional, Tuple

import httpx
from fastapi import HTTPException

LK888_API_KEY = (os.environ.get("LK888_API_KEY") or "").strip()
LK888_BASE_URL = (
    os.environ.get("LK888_BASE_URL") or "https://api.lk888.ai/v1"
).strip().rstrip("/")
LK888_MUSIC_TIMEOUT = float(os.environ.get("LK888_MUSIC_TIMEOUT", "420"))
LK888_POLL_INTERVAL = float(os.environ.get("LK888_MEDIA_POLL_INTERVAL", "3"))

SUNO_MODELS = frozenset({"suno-v4.5"})


def lk888_music_configured() -> bool:
    return bool(LK888_API_KEY)


def is_suno_model(model: Optional[str]) -> bool:
    return (model or "").strip().lower() in SUNO_MODELS


def _auth_headers(*, json_body: bool = True) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {LK888_API_KEY}"}
    if json_body:
        headers["Content-Type"] = "application/json"
    return headers


def _parse_json(resp: httpx.Response) -> dict:
    try:
        data = resp.json() if resp.content else {}
    except Exception:
        data = {}
    return data if isinstance(data, dict) else {}


def _error_detail(data: dict, resp: httpx.Response) -> str:
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict):
        msg = str(err.get("message") or err.get("code") or "").strip()
        if msg:
            return f"逍遥 Suno failed: {msg}"
    message = ""
    if isinstance(data, dict):
        message = str(data.get("message") or data.get("msg") or "").strip()
    detail = message or (resp.text or "")[:300] or f"HTTP {resp.status_code}"
    return f"逍遥 Suno failed: {detail}"


def _raise_recharge_or_502(data: dict, resp: httpx.Response) -> None:
    detail = _error_detail(data, resp)
    err = data.get("error") if isinstance(data, dict) else None
    code = ""
    if isinstance(err, dict):
        code = str(err.get("code") or "").strip().lower()
    low = detail.lower()
    if code == "recharge_required" or "recharge_required" in low:
        raise HTTPException(
            status_code=402,
            detail=(
                "逍遥 AI 开放 API 需账号至少成功充值一次后才能调用。"
                "请先在逍遥官网完成任意金额充值。"
            ),
        )
    raise HTTPException(status_code=502, detail=detail)


def _media_task_id(data: dict) -> Optional[int]:
    if not isinstance(data, dict):
        return None
    inner: Any = data.get("data")
    if isinstance(inner, dict):
        tid = inner.get("task_id")
        if tid is not None:
            try:
                return int(tid)
            except (TypeError, ValueError):
                pass
        ids = inner.get("task_ids")
        if isinstance(ids, list) and ids:
            try:
                return int(ids[0])
            except (TypeError, ValueError):
                pass
    tid = data.get("task_id")
    if tid is not None:
        try:
            return int(tid)
        except (TypeError, ValueError):
            pass
    return None


def _sniff_audio_mime(raw: bytes, url: str = "") -> Tuple[str, str]:
    """Return (content_type, ext)."""
    low = (url or "").lower()
    if raw.startswith(b"ID3") or raw[:2] == b"\xff\xfb" or raw[:2] == b"\xff\xf3":
        return "audio/mpeg", ".mp3"
    if raw.startswith(b"RIFF") and b"WAVE" in raw[:16]:
        return "audio/wav", ".wav"
    if raw.startswith(b"OggS"):
        return "audio/ogg", ".ogg"
    if ".wav" in low:
        return "audio/wav", ".wav"
    if ".ogg" in low:
        return "audio/ogg", ".ogg"
    return "audio/mpeg", ".mp3"


async def _download_audio(client: httpx.AsyncClient, out_url: str) -> Tuple[bytes, str, str]:
    if out_url.startswith("data:"):
        try:
            header, b64 = out_url.split(",", 1)
            import base64

            raw = base64.b64decode(b64)
            mime = "audio/mpeg"
            if "audio/" in header:
                mime = header.split(";")[0].split(":")[1] or mime
            ext = ".mp3"
            if "wav" in mime:
                ext = ".wav"
            elif "ogg" in mime:
                ext = ".ogg"
            return raw, mime, ext
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Invalid data-URI audio") from exc
    resp = await client.get(out_url)
    if resp.status_code >= 400 or not resp.content:
        raise HTTPException(status_code=502, detail="Failed to download Suno audio")
    ctype = (resp.headers.get("content-type") or "").split(";")[0].strip()
    mime, ext = _sniff_audio_mime(resp.content, out_url)
    if ctype.startswith("audio/"):
        mime = ctype
        if "wav" in mime:
            ext = ".wav"
        elif "ogg" in mime:
            ext = ".ogg"
        else:
            ext = ".mp3"
    return resp.content, mime, ext


def _pick_result_url(last: dict) -> str:
    url = str(last.get("result_url") or "").strip()
    if url:
        return url
    # Some gateways return a list of clips
    for key in ("result_urls", "audio_urls", "urls"):
        arr = last.get(key)
        if isinstance(arr, list):
            for item in arr:
                if isinstance(item, str) and item.strip():
                    return item.strip()
                if isinstance(item, dict):
                    u = item.get("url") or item.get("audio_url") or item.get("result_url")
                    if isinstance(u, str) and u.strip():
                        return u.strip()
    data = last.get("data")
    if isinstance(data, dict):
        return _pick_result_url(data)
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                u = _pick_result_url(item)
                if u:
                    return u
    return ""


async def _poll_media_task(client: httpx.AsyncClient, task_id: int) -> Tuple[bytes, str, str]:
    status_url = f"{LK888_BASE_URL}/media/status"
    deadline = time.monotonic() + LK888_MUSIC_TIMEOUT
    last: dict = {}
    while time.monotonic() < deadline:
        st = await client.get(
            status_url,
            headers=_auth_headers(json_body=False),
            params={"task_id": task_id},
        )
        last = _parse_json(st)
        if st.status_code >= 400 or last.get("error"):
            _raise_recharge_or_502(last, st)

        state = str(last.get("state") or "").strip().lower()
        is_final = bool(last.get("is_final"))
        err_msg = str(last.get("error") or "").strip()

        if state in ("failed", "error", "cancelled", "canceled"):
            raise HTTPException(
                status_code=502,
                detail=f"逍遥 Suno failed: {err_msg or state}",
            )
        if is_final or state in ("success", "succeeded", "completed", "done"):
            if err_msg and state not in ("success", "succeeded", "completed", "done"):
                raise HTTPException(status_code=502, detail=f"逍遥 Suno failed: {err_msg}")
            result_url = _pick_result_url(last)
            if not result_url:
                raise HTTPException(
                    status_code=502,
                    detail="逍遥 Suno finished without result_url.",
                )
            return await _download_audio(client, result_url)

        await asyncio.sleep(LK888_POLL_INTERVAL)

    raise HTTPException(
        status_code=504,
        detail=(
            "逍遥 Suno timed out"
            f" (task_id={task_id}, last_state={last.get('state')!s})."
        ),
    )


async def generate_suno_music(
    *,
    prompt: str,
    lyrics: str = "",
    instrumental: bool = False,
    vocal_gender: str = "auto",
    mv: str = "chirp-v4-5",
) -> Tuple[bytes, str, str, int]:
    """Generate via Suno. Returns (bytes, content_type, ext, duration_sec_estimate)."""
    if not LK888_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="逍遥 AI is not configured (LK888_API_KEY).",
        )
    text = (prompt or "").strip()
    ly = (lyrics or "").strip()
    if instrumental:
        if not text:
            raise HTTPException(status_code=400, detail="Please enter a music prompt for instrumental.")
        ly = ""
    else:
        if not text and not ly:
            raise HTTPException(
                status_code=400,
                detail="Please enter a style prompt and/or lyrics for Suno.",
            )
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="Prompt is too long (max 2000 characters).")
    if len(ly) > 3500:
        raise HTTPException(status_code=400, detail="Lyrics are too long.")

    gender = (vocal_gender or "auto").strip().lower()
    if gender not in ("auto", "m", "f"):
        gender = "auto"
    mv_id = (mv or "chirp-v4-5").strip() or "chirp-v4-5"

    params: dict[str, Any] = {
        "mv": mv_id,
        "make_instrumental": "instrumental" if instrumental else "song",
        "vocal_gender": gender,
        "sample_rate": "44100",
        "bitrate": "192000",
    }
    if ly:
        params["lyrics"] = ly

    # Top-level prompt required by platform; for lyrics-only song still send a short style hint.
    top_prompt = text or "pop song"
    payload = {
        "model": "suno-v4.5",
        "prompt": top_prompt,
        "params": params,
    }

    try:
        async with httpx.AsyncClient(timeout=LK888_MUSIC_TIMEOUT + 60) as client:
            create_url = f"{LK888_BASE_URL}/media/generate"
            resp = await client.post(create_url, headers=_auth_headers(), json=payload)
            data = _parse_json(resp)
            if resp.status_code >= 400 or data.get("error"):
                _raise_recharge_or_502(data, resp)
            code = data.get("code")
            if code is not None and int(code) != 200:
                msg = str(data.get("msg") or data.get("message") or "media/generate rejected")
                raise HTTPException(status_code=502, detail=f"逍遥 Suno failed: {msg}")
            task_id = _media_task_id(data)
            if task_id is None:
                raise HTTPException(status_code=502, detail="逍遥 Suno returned no task_id.")
            raw, mime, ext = await _poll_media_task(client, task_id)
            # Rough duration from bitrate≈192kbps if unknown
            duration = max(1, int(len(raw) * 8 / 192000)) if raw else 1
            return raw, mime, ext, duration
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="逍遥 Suno timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"逍遥 Suno failed: {exc}") from exc
