"""DashScope Qwen image instruction edit (sync multimodal generation)."""

from __future__ import annotations

import base64
import os
from typing import Any, Optional, Tuple

import httpx
from fastapi import HTTPException

from recipe_ai import DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL

QWEN_IMAGE_EDIT_MODEL = os.environ.get("QWEN_IMAGE_EDIT_MODEL", "qwen-image-edit")
EDIT_TIMEOUT = float(os.environ.get("QWEN_IMAGE_EDIT_TIMEOUT", "120"))


def dashscope_image_edit_configured() -> bool:
    return bool(DASHSCOPE_API_KEY)


def _api_root() -> str:
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
    low = base.lower()
    if "dashscope-us" in low:
        return "https://dashscope-us.aliyuncs.com/api/v1"
    if "dashscope-intl" in low:
        return "https://dashscope-intl.aliyuncs.com/api/v1"
    return "https://dashscope.aliyuncs.com/api/v1"


def _guess_mime(image_bytes: bytes) -> str:
    if image_bytes.startswith(b"\x89PNG"):
        return "image/png"
    if image_bytes.startswith(b"RIFF") and b"WEBP" in image_bytes[:16]:
        return "image/webp"
    if image_bytes.startswith(b"\xff\xd8"):
        return "image/jpeg"
    return "image/jpeg"


def _data_uri(image_bytes: bytes) -> str:
    mime = _guess_mime(image_bytes)
    b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _extract_image_url(data: dict) -> Optional[str]:
    """Pull first output image URL or data-URI from DashScope response shapes."""
    if not isinstance(data, dict):
        return None
    # Common: output.choices[0].message.content[{image|image_url}]
    out = data.get("output") or {}
    choices = out.get("choices") or data.get("choices") or []
    for ch in choices:
        if not isinstance(ch, dict):
            continue
        msg = ch.get("message") or {}
        content = msg.get("content")
        if isinstance(content, str) and content.startswith("http"):
            return content
        if isinstance(content, list):
            for part in content:
                if not isinstance(part, dict):
                    continue
                for key in ("image", "image_url", "url"):
                    val = part.get(key)
                    if isinstance(val, str) and val.strip():
                        return val.strip()
                    if isinstance(val, dict):
                        u = val.get("url")
                        if isinstance(u, str) and u.strip():
                            return u.strip()
    # results[].url
    for item in out.get("results") or []:
        if isinstance(item, dict):
            u = item.get("url") or item.get("image")
            if isinstance(u, str) and u.strip():
                return u.strip()
    return None


async def edit_image_with_instruction(
    image_bytes: bytes,
    prompt: str,
    *,
    model: Optional[str] = None,
) -> Tuple[bytes, str]:
    """
    Returns (image_bytes, mime_type).
    Downloads remote URL result when needed.
    """
    if not DASHSCOPE_API_KEY:
        raise HTTPException(status_code=503, detail="DashScope is not configured (DASHSCOPE_API_KEY).")
    text = (prompt or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Please enter an edit instruction.")
    if len(text) > 800:
        raise HTTPException(status_code=400, detail="Instruction is too long (max 800 characters).")
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image")

    use_model = (model or QWEN_IMAGE_EDIT_MODEL).strip() or "qwen-image-edit"
    url = _api_root().rstrip("/") + "/services/aigc/multimodal-generation/generation"
    payload: dict[str, Any] = {
        "model": use_model,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"image": _data_uri(image_bytes)},
                        {"text": text},
                    ],
                }
            ]
        },
        "parameters": {"n": 1},
    }
    headers = {
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=EDIT_TIMEOUT) as client:
            resp = await client.post(url, headers=headers, json=payload)
            data = resp.json() if resp.content else {}
            if resp.status_code >= 400:
                detail = (
                    (data.get("message") if isinstance(data, dict) else None)
                    or (data.get("code") if isinstance(data, dict) else None)
                    or resp.text[:300]
                    or f"HTTP {resp.status_code}"
                )
                raise HTTPException(status_code=502, detail=f"Image edit failed: {detail}")
            out_ref = _extract_image_url(data if isinstance(data, dict) else {})
            if not out_ref:
                raise HTTPException(
                    status_code=502,
                    detail="Image edit returned no image. Check model access on DashScope.",
                )
            if out_ref.startswith("data:"):
                # data:image/png;base64,....
                try:
                    header, b64 = out_ref.split(",", 1)
                    mime = "image/png"
                    if "image/" in header:
                        mime = header.split(";")[0].split(":")[1] or mime
                    return base64.b64decode(b64), mime
                except Exception as exc:
                    raise HTTPException(status_code=502, detail="Invalid data-URI image") from exc
            # remote URL
            img_resp = await client.get(out_ref)
            if img_resp.status_code >= 400 or not img_resp.content:
                raise HTTPException(status_code=502, detail="Failed to download edited image")
            ctype = (img_resp.headers.get("content-type") or "image/png").split(";")[0].strip()
            if not ctype.startswith("image/"):
                ctype = "image/png"
            return img_resp.content, ctype
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Image edit timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Image edit failed: {exc}") from exc
