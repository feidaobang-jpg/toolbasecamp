"""Volcengine Ark (豆包 Seedream) image-to-image via OpenAI-compatible generations API."""

from __future__ import annotations

import base64
import os
from typing import Any, Optional, Sequence, Tuple

import httpx
from fastapi import HTTPException

from dashscope_image_edit import _data_uri, _normalize_edit_image

VOLC_ARK_API_KEY = (os.environ.get("VOLC_ARK_API_KEY") or "").strip()
VOLC_ARK_BASE_URL = (
    os.environ.get("VOLC_ARK_BASE_URL")
    or "https://ark.cn-beijing.volces.com/api/v3"
).strip().rstrip("/")
SEEDREAM_IMAGE_MODEL = (
    os.environ.get("SEEDREAM_IMAGE_MODEL") or "doubao-seedream-5-0-260128"
).strip()
SEEDREAM_TIMEOUT = float(os.environ.get("SEEDREAM_IMAGE_TIMEOUT", "180"))
SEEDREAM_PRO_TIMEOUT = float(os.environ.get("SEEDREAM_PRO_TIMEOUT", "240"))
SEEDREAM_SIZE = (os.environ.get("SEEDREAM_IMAGE_SIZE") or "2K").strip() or "2K"
# Official docs: up to 14 refs; we still clamp via instruct-edit batch max.
SEEDREAM_MAX_REFS = int(os.environ.get("SEEDREAM_MAX_REFS", "14"))


def volc_ark_configured() -> bool:
    return bool(VOLC_ARK_API_KEY)


def is_seedream_model(model: Optional[str]) -> bool:
    mid = (model or "").strip().lower()
    return mid.startswith("doubao-seedream") or mid.startswith("seedream")


def _default_model() -> str:
    return SEEDREAM_IMAGE_MODEL or "doubao-seedream-5-0-260128"


def _extract_output(data: dict) -> Tuple[Optional[str], Optional[str]]:
    """Return (url_or_none, b64_or_none) from Ark images/generations response."""
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


def _error_detail(data: dict, resp: httpx.Response) -> str:
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict):
        msg = str(err.get("message") or err.get("code") or "").strip()
        if msg:
            return f"Seedream image edit failed: {msg}"
    message = ""
    if isinstance(data, dict):
        message = str(data.get("message") or data.get("msg") or "").strip()
    detail = message or (resp.text or "")[:300] or f"HTTP {resp.status_code}"
    return f"Seedream image edit failed: {detail}"


async def edit_image_with_seedream(
    image_bytes: bytes,
    prompt: str,
    *,
    model: Optional[str] = None,
    images: Optional[Sequence[bytes]] = None,
) -> Tuple[bytes, str]:
    """
    Image-to-image via POST /images/generations.
    `image` is a data-URI string (single) or list (multi-ref).
    Returns (image_bytes, mime_type).
    """
    if not VOLC_ARK_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Volcengine Ark is not configured (VOLC_ARK_API_KEY).",
        )
    text = (prompt or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Please enter an edit instruction.")
    if len(text) > 2000:
        raise HTTPException(
            status_code=400,
            detail="Instruction is too long (max 2000 characters).",
        )

    refs: list[bytes] = []
    if images:
        refs = [b for b in images if b]
    if not refs and image_bytes:
        refs = [image_bytes]
    if not refs:
        raise HTTPException(status_code=400, detail="Empty image")
    if len(refs) > SEEDREAM_MAX_REFS:
        raise HTTPException(
            status_code=400,
            detail=f"Seedream supports at most {SEEDREAM_MAX_REFS} reference images.",
        )

    use_model = (model or _default_model()).strip() or _default_model()
    norm_refs = [_normalize_edit_image(b, for_wan=False) for b in refs]
    data_uris = [_data_uri(b, mime) for b, mime in norm_refs]
    image_field: Any = data_uris[0] if len(data_uris) == 1 else data_uris
    is_pro = "pro" in use_model.lower()

    payload: dict[str, Any] = {
        "model": use_model,
        "prompt": text,
        "image": image_field,
        "response_format": "url",
        "size": SEEDREAM_SIZE,
        "stream": False,
        "watermark": False,
    }
    # Pro does not support sequential / group generation; lite accepts disabled.
    if not is_pro:
        payload["sequential_image_generation"] = "disabled"

    url = f"{VOLC_ARK_BASE_URL}/images/generations"
    headers = {
        "Authorization": f"Bearer {VOLC_ARK_API_KEY}",
        "Content-Type": "application/json",
    }
    timeout = SEEDREAM_PRO_TIMEOUT if is_pro else SEEDREAM_TIMEOUT

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
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
                return raw, "image/jpeg"
            if not out_url:
                raise HTTPException(
                    status_code=502,
                    detail="Image edit returned no image. Check Seedream model access on Volcengine Ark.",
                )
            if out_url.startswith("data:"):
                try:
                    header, b64 = out_url.split(",", 1)
                    mime = "image/jpeg"
                    if "image/" in header:
                        mime = header.split(";")[0].split(":")[1] or mime
                    return base64.b64decode(b64), mime
                except Exception as exc:
                    raise HTTPException(status_code=502, detail="Invalid data-URI image") from exc
            img_resp = await client.get(out_url)
            if img_resp.status_code >= 400 or not img_resp.content:
                raise HTTPException(status_code=502, detail="Failed to download edited image")
            ctype = (img_resp.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
            if not ctype.startswith("image/"):
                ctype = "image/jpeg"
            return img_resp.content, ctype
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Image edit timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Image edit failed: {exc}") from exc
