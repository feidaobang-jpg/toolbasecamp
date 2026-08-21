"""逍遥 AI (lk888) OpenAI-compatible text-to-image.

POST {LK888_BASE_URL}/images/generations — models gpt-image-2, gemini-1-pro-image-preview.
"""

from __future__ import annotations

import base64
import os
from typing import Optional, Tuple

import httpx
from fastapi import HTTPException

LK888_API_KEY = (os.environ.get("LK888_API_KEY") or "").strip()
LK888_BASE_URL = (
    os.environ.get("LK888_BASE_URL") or "https://api.lk888.ai/v1"
).strip().rstrip("/")
LK888_TIMEOUT = float(os.environ.get("LK888_IMAGE_TIMEOUT", "180"))

LK888_T2I_MODELS = frozenset(
    {
        "gpt-image-2",
        "gemini-1-pro-image-preview",
    }
)

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


async def generate_lk888_text_to_image(
    prompt: str,
    *,
    model: str,
    size_preset: Optional[str] = "square",
) -> Tuple[bytes, str]:
    """Text-to-image via POST /images/generations. Returns (bytes, mime)."""
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

    payload = {
        "model": use_model,
        "prompt": text,
        "n": 1,
        "size": _api_size(size_preset),
        "response_format": "b64_json",
    }
    url = f"{LK888_BASE_URL}/images/generations"
    headers = {
        "Authorization": f"Bearer {LK888_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=LK888_TIMEOUT) as client:
            resp = await client.post(url, headers=headers, json=payload)
            try:
                data = resp.json() if resp.content else {}
            except Exception:
                data = {}
            if not isinstance(data, dict):
                data = {}
            if resp.status_code >= 400 or data.get("error"):
                # Some gateways reject response_format; retry once without it / with url.
                if resp.status_code in (400, 422) and "response_format" in str(data).lower():
                    payload.pop("response_format", None)
                    resp = await client.post(url, headers=headers, json=payload)
                    try:
                        data = resp.json() if resp.content else {}
                    except Exception:
                        data = {}
                    if not isinstance(data, dict):
                        data = {}
                if resp.status_code >= 400 or data.get("error"):
                    raise HTTPException(
                        status_code=502,
                        detail=_error_detail(data, resp),
                    )
            out_url, out_b64 = _extract_output(data)
            if out_b64:
                try:
                    raw = base64.b64decode(out_b64)
                except Exception as exc:
                    raise HTTPException(status_code=502, detail="Invalid b64_json image") from exc
                return raw, "image/png"
            if not out_url:
                raise HTTPException(
                    status_code=502,
                    detail="逍遥 AI returned no image. Check model access / balance.",
                )
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
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="逍遥 AI image generation timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"逍遥 AI image generation failed: {exc}") from exc
