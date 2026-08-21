"""逍遥 AI (lk888) text-to-image.

- GPT Image 2 (`gpt-image-2`): sync OpenAI-compatible POST /images/generations
- Nano Banana Pro (`gemini-3-pro-image-preview`): async POST /media/generate
  then poll GET /media/status?task_id=…
"""

from __future__ import annotations

import asyncio
import base64
import os
import time
from typing import Any, Optional, Tuple

import httpx
from fastapi import HTTPException

LK888_API_KEY = (os.environ.get("LK888_API_KEY") or "").strip()
LK888_BASE_URL = (
    os.environ.get("LK888_BASE_URL") or "https://api.lk888.ai/v1"
).strip().rstrip("/")
LK888_TIMEOUT = float(os.environ.get("LK888_IMAGE_TIMEOUT", "180"))
LK888_POLL_INTERVAL = float(os.environ.get("LK888_MEDIA_POLL_INTERVAL", "2"))

LK888_T2I_MODELS = frozenset(
    {
        "gpt-image-2",
        "gemini-3-pro-image-preview",
        # legacy alias (kept for in-flight clients)
        "gemini-1-pro-image-preview",
    }
)

# Models that reject /images/* and must use /media/generate + status poll
_LK888_MEDIA_MODELS = frozenset(
    {
        "gemini-3-pro-image-preview",
    }
)

# Map UI / legacy ids → upstream model id
_LK888_MODEL_ALIAS: dict[str, str] = {
    "gemini-1-pro-image-preview": "gemini-3-pro-image-preview",
}

# UI size_preset → OpenAI-style size string
_SIZE_MAP: dict[str, str] = {
    "square": "1024x1024",
    "portrait": "1024x1536",
    "landscape": "1536x1024",
    "hd": "1536x1024",
}


def lk888_configured() -> bool:
    return bool(LK888_API_KEY)


def is_lk888_model(model: Optional[str]) -> bool:
    mid = (model or "").strip().lower()
    return mid in LK888_T2I_MODELS


def _api_size(size_preset: Optional[str]) -> str:
    return _SIZE_MAP.get((size_preset or "square").lower(), "1024x1024")


def _auth_headers(*, json_body: bool = True) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {LK888_API_KEY}"}
    if json_body:
        headers["Content-Type"] = "application/json"
    return headers


def _error_detail(data: dict, resp: httpx.Response) -> str:
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict):
        msg = str(err.get("message") or err.get("code") or "").strip()
        if msg:
            return f"逍遥 AI image generation failed: {msg}"
    message = ""
    if isinstance(data, dict):
        message = str(data.get("message") or data.get("msg") or "").strip()
    detail = message or (resp.text or "")[:300] or f"HTTP {resp.status_code}"
    return f"逍遥 AI image generation failed: {detail}"


def _raise_recharge_or_502(data: dict, resp: httpx.Response) -> None:
    detail = _error_detail(data, resp)
    err = data.get("error") if isinstance(data, dict) else None
    code = ""
    if isinstance(err, dict):
        code = str(err.get("code") or "").strip().lower()
    if code == "recharge_required" or "recharge_required" in detail.lower():
        raise HTTPException(
            status_code=402,
            detail=(
                "逍遥 AI 开放 API 需账号至少成功充值一次后才能调用"
                "（网页端聊天不受影响）。请先在逍遥官网完成任意金额充值。"
            ),
        )
    raise HTTPException(status_code=502, detail=detail)


def _extract_output(data: dict) -> Tuple[Optional[str], Optional[str]]:
    """Return (url_or_none, b64_or_none) from OpenAI-style images response."""
    if not isinstance(data, dict):
        return None, None
    items = data.get("data")
    if not isinstance(items, list):
        return None, None
    for item in items:
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        if isinstance(url, str) and url.strip():
            return url.strip(), None
        b64 = item.get("b64_json")
        if isinstance(b64, str) and b64.strip():
            return None, b64.strip()
    return None, None


def _parse_json(resp: httpx.Response) -> dict:
    try:
        data = resp.json() if resp.content else {}
    except Exception:
        data = {}
    return data if isinstance(data, dict) else {}


async def _download_image(client: httpx.AsyncClient, out_url: str) -> Tuple[bytes, str]:
    if out_url.startswith("data:"):
        try:
            header, b64 = out_url.split(",", 1)
            mime = "image/png"
            if "image/" in header:
                mime = header.split(";")[0].split(":")[1] or mime
            return base64.b64decode(b64), mime
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Invalid data-URI image") from exc
    img_resp = await client.get(out_url)
    if img_resp.status_code >= 400 or not img_resp.content:
        raise HTTPException(status_code=502, detail="Failed to download generated image")
    ctype = (img_resp.headers.get("content-type") or "image/png").split(";")[0].strip()
    if not ctype.startswith("image/"):
        ctype = "image/png"
    return img_resp.content, ctype


def _media_task_id(data: dict) -> Optional[int]:
    """Extract task_id from media/generate response."""
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


async def _generate_via_images(
    client: httpx.AsyncClient,
    *,
    model: str,
    prompt: str,
    size: str,
) -> Tuple[bytes, str]:
    payload = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": size,
        "response_format": "b64_json",
    }
    url = f"{LK888_BASE_URL}/images/generations"
    resp = await client.post(url, headers=_auth_headers(), json=payload)
    data = _parse_json(resp)
    if resp.status_code >= 400 or data.get("error"):
        if resp.status_code in (400, 422) and "response_format" in str(data).lower():
            payload.pop("response_format", None)
            resp = await client.post(url, headers=_auth_headers(), json=payload)
            data = _parse_json(resp)
        if resp.status_code >= 400 or data.get("error"):
            _raise_recharge_or_502(data, resp)
    out_url, out_b64 = _extract_output(data)
    if out_b64:
        try:
            return base64.b64decode(out_b64), "image/png"
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Invalid b64_json image") from exc
    if not out_url:
        raise HTTPException(
            status_code=502,
            detail="逍遥 AI returned no image. Check model access / balance.",
        )
    return await _download_image(client, out_url)


async def _generate_via_media(
    client: httpx.AsyncClient,
    *,
    model: str,
    prompt: str,
    size: str,
) -> Tuple[bytes, str]:
    """Async media pipeline used by Nano Banana Pro (and similar Gemini image models)."""
    payload = {
        "model": model,
        "prompt": prompt,
        "size": size,
    }
    create_url = f"{LK888_BASE_URL}/media/generate"
    resp = await client.post(create_url, headers=_auth_headers(), json=payload)
    data = _parse_json(resp)
    if resp.status_code >= 400 or data.get("error"):
        _raise_recharge_or_502(data, resp)
    # Platform may return HTTP 200 with code!=200 in body
    code = data.get("code")
    if code is not None and int(code) != 200:
        msg = str(data.get("msg") or data.get("message") or "media/generate rejected")
        raise HTTPException(status_code=502, detail=f"逍遥 AI image generation failed: {msg}")

    task_id = _media_task_id(data)
    if task_id is None:
        raise HTTPException(
            status_code=502,
            detail="逍遥 AI media/generate returned no task_id.",
        )

    status_url = f"{LK888_BASE_URL}/media/status"
    deadline = time.monotonic() + LK888_TIMEOUT
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
                detail=f"逍遥 AI image generation failed: {err_msg or state}",
            )
        if is_final or state in ("success", "succeeded", "completed", "done"):
            if err_msg and state not in ("success", "succeeded", "completed", "done"):
                raise HTTPException(
                    status_code=502,
                    detail=f"逍遥 AI image generation failed: {err_msg}",
                )
            result_url = str(last.get("result_url") or "").strip()
            if not result_url:
                raise HTTPException(
                    status_code=502,
                    detail="逍遥 AI media task finished without result_url.",
                )
            return await _download_image(client, result_url)

        await asyncio.sleep(LK888_POLL_INTERVAL)

    raise HTTPException(
        status_code=504,
        detail=(
            "逍遥 AI image generation timed out"
            f" (task_id={task_id}, last_state={last.get('state')!s})."
        ),
    )


async def generate_lk888_text_to_image(
    prompt: str,
    *,
    model: str,
    size_preset: Optional[str] = "square",
) -> Tuple[bytes, str]:
    """Text-to-image. Returns (bytes, mime)."""
    if not LK888_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="逍遥 AI is not configured (LK888_API_KEY).",
        )
    text = (prompt or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Please enter a prompt.")
    if len(text) > 4000:
        raise HTTPException(
            status_code=400,
            detail="Prompt is too long (max 4000 characters).",
        )
    use_model = (model or "").strip()
    if not is_lk888_model(use_model):
        raise HTTPException(status_code=400, detail=f"Unsupported lk888 model: {use_model}")
    use_model = _LK888_MODEL_ALIAS.get(use_model.lower(), use_model)
    size = _api_size(size_preset)

    try:
        # Overall budget covers create + poll + download
        async with httpx.AsyncClient(timeout=LK888_TIMEOUT + 30) as client:
            if use_model in _LK888_MEDIA_MODELS:
                return await _generate_via_media(
                    client, model=use_model, prompt=text, size=size
                )
            return await _generate_via_images(
                client, model=use_model, prompt=text, size=size
            )
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="逍遥 AI image generation timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"逍遥 AI image generation failed: {exc}") from exc
