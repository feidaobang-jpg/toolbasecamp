"""MiniMax image-01 / image-01-live — text-to-image and image-to-image."""

from __future__ import annotations

import base64
import os
from typing import Optional, Tuple

import httpx
from fastapi import HTTPException

MINIMAX_API_KEY = (os.environ.get("MINIMAX_API_KEY") or "").strip()
MINIMAX_API_URL = (
    os.environ.get("MINIMAX_API_URL") or "https://api.minimax.io/v1/image_generation"
).strip().rstrip("/")
MINIMAX_TIMEOUT = float(os.environ.get("MINIMAX_IMAGE_TIMEOUT", "120"))

# size_preset → aspect_ratio mapping (image-01-live does not support 21:9)
_SIZE_MAP: dict[str, str] = {
    "square":    "1:1",
    "portrait":  "9:16",
    "landscape": "16:9",
    "hd":        "16:9",
}


def minimax_configured() -> bool:
    return bool(MINIMAX_API_KEY)


def is_minimax_model(model: Optional[str]) -> bool:
    mid = (model or "").strip().lower()
    return mid in ("image-01", "image-01-live")


def _aspect_ratio(size_preset: Optional[str], model: str) -> str:
    ar = _SIZE_MAP.get((size_preset or "square").lower(), "1:1")
    # image-01-live does not support 21:9; portrait/landscape both fine.
    return ar


def _data_url_from_bytes(data: bytes, content_type: str = "image/jpeg") -> str:
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{content_type};base64,{b64}"


def _raise_minimax_error(data: dict, resp: httpx.Response) -> None:
    base_msg = "MiniMax image generation failed"
    if isinstance(data, dict):
        # MiniMax error shape: { "base_resp": { "status_code": N, "status_msg": "..." } }
        base_resp = data.get("base_resp") or {}
        if isinstance(base_resp, dict):
            code = base_resp.get("status_code")
            msg = str(base_resp.get("status_msg") or "").strip()
            if msg:
                detail = f"{base_msg}: [{code}] {msg}"
                status = 429 if code == 1002 else 502
                raise HTTPException(status_code=status, detail=detail)
        err = data.get("error")
        if isinstance(err, dict):
            msg = str(err.get("message") or err.get("code") or "").strip()
            if msg:
                raise HTTPException(status_code=502, detail=f"{base_msg}: {msg}")
    raise HTTPException(
        status_code=502,
        detail=f"{base_msg}: HTTP {resp.status_code} — {(resp.text or '')[:300]}",
    )


def _extract_image(data: dict) -> Tuple[bytes, str]:
    """Extract (image_bytes, content_type) from MiniMax response."""
    # Shape: { "data": { "image_urls": ["..."] } }  or  { "data": { "images": [{"b64_json": "..."}] } }
    d = data.get("data") or {}
    if isinstance(d, dict):
        # base64 response
        images = d.get("images") or []
        if isinstance(images, list) and images:
            b64 = (images[0] or {}).get("b64_json") or ""
            if b64:
                return base64.b64decode(b64), "image/png"
        # url response — download it
        urls = d.get("image_urls") or []
        if isinstance(urls, list) and urls:
            url = urls[0]
            if isinstance(url, str) and url.startswith("http"):
                try:
                    r = httpx.get(url, timeout=60, follow_redirects=True)
                    r.raise_for_status()
                    ctype = r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
                    return r.content, ctype
                except Exception as exc:
                    raise HTTPException(status_code=502, detail=f"Failed to download MiniMax image: {exc}") from exc
    raise HTTPException(status_code=502, detail="MiniMax returned no image data.")


async def generate_minimax_text_to_image(
    prompt: str,
    *,
    model: str = "image-01",
    size_preset: str = "square",
) -> Tuple[bytes, str]:
    """Generate image from text using MiniMax image-01 / image-01-live."""
    if not minimax_configured():
        raise HTTPException(status_code=503, detail="MiniMax is not configured (MINIMAX_API_KEY).")

    ar = _aspect_ratio(size_preset, model)
    payload: dict = {
        "model": model,
        "prompt": prompt[:1500],
        "aspect_ratio": ar,
        "response_format": "base64",
        "prompt_optimizer": False,
    }

    async with httpx.AsyncClient(timeout=MINIMAX_TIMEOUT) as client:
        resp = await client.post(
            MINIMAX_API_URL,
            headers={"Authorization": f"Bearer {MINIMAX_API_KEY}", "Content-Type": "application/json"},
            json=payload,
        )

    try:
        data = resp.json()
    except Exception:
        data = {}

    if resp.status_code != 200 or not isinstance(data, dict):
        _raise_minimax_error(data, resp)

    base_resp = (data.get("base_resp") or {})
    if isinstance(base_resp, dict) and base_resp.get("status_code") not in (None, 0):
        _raise_minimax_error(data, resp)

    return _extract_image(data)


async def generate_minimax_image_to_image(
    ref_image_bytes: bytes,
    prompt: str,
    *,
    model: str = "image-01",
    size_preset: str = "square",
    ref_content_type: str = "image/jpeg",
) -> Tuple[bytes, str]:
    """Image-to-image using subject_reference (single reference image)."""
    if not minimax_configured():
        raise HTTPException(status_code=503, detail="MiniMax is not configured (MINIMAX_API_KEY).")

    ar = _aspect_ratio(size_preset, model)
    image_file = _data_url_from_bytes(ref_image_bytes, ref_content_type)

    payload: dict = {
        "model": model,
        "prompt": prompt[:1500],
        "aspect_ratio": ar,
        "response_format": "base64",
        "prompt_optimizer": False,
        "subject_reference": [
            {"type": "character", "image_file": image_file}
        ],
    }

    async with httpx.AsyncClient(timeout=MINIMAX_TIMEOUT) as client:
        resp = await client.post(
            MINIMAX_API_URL,
            headers={"Authorization": f"Bearer {MINIMAX_API_KEY}", "Content-Type": "application/json"},
            json=payload,
        )

    try:
        data = resp.json()
    except Exception:
        data = {}

    if resp.status_code != 200 or not isinstance(data, dict):
        _raise_minimax_error(data, resp)

    base_resp = (data.get("base_resp") or {})
    if isinstance(base_resp, dict) and base_resp.get("status_code") not in (None, 0):
        _raise_minimax_error(data, resp)

    return _extract_image(data)
