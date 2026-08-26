"""逍遥 AI (lk888) text-to-image + image-to-image.

- GPT Image 2 (`gpt-image-2` / `tt-image-2`):
  T2I POST /images/generations · I2I multipart POST /images/edits
- Nano Banana 2 (`banana-2`) / Pro (`banana-pro`):
  async POST /media/generate (+ optional images[]) then GET /media/status
"""

from __future__ import annotations

import asyncio
import base64
import os
import time
from typing import Any, Optional, Sequence, Tuple

import httpx
from fastapi import HTTPException

LK888_API_KEY = (os.environ.get("LK888_API_KEY") or "").strip()
LK888_BASE_URL = (
    os.environ.get("LK888_BASE_URL") or "https://api.lk888.ai/v1"
).strip().rstrip("/")
LK888_TIMEOUT = float(os.environ.get("LK888_IMAGE_TIMEOUT", "180"))
LK888_POLL_INTERVAL = float(os.environ.get("LK888_MEDIA_POLL_INTERVAL", "2"))
LK888_MAX_REFS = int(os.environ.get("LK888_MAX_REFS", "10"))

# Catalog / UI ids (also accept upstream aliases)
LK888_T2I_MODELS = frozenset(
    {
        "gpt-image-2",
        "tt-image-2",
        "banana-2",
        "banana-pro",
        "gemini-3-pro-image-preview",
        "gemini-3.1-flash-image-preview",
        "gemini-1-pro-image-preview",
    }
)

# Reject /images/* — must use /media/generate
_LK888_MEDIA_MODELS = frozenset(
    {
        "banana-2",
        "banana-pro",
        "gemini-3-pro-image-preview",
        "gemini-3.1-flash-image-preview",
        "gemini-1-pro-image-preview",
    }
)

# Normalize to preferred upstream id
_LK888_MODEL_ALIAS: dict[str, str] = {
    "tt-image-2": "gpt-image-2",
    "gemini-1-pro-image-preview": "banana-pro",
    "gemini-3-pro-image-preview": "banana-pro",
    "gemini-3.1-flash-image-preview": "banana-2",
}

# UI size_preset → OpenAI-style WxH (GPT Image 2)
_SIZE_MAP: dict[str, str] = {
    "square": "1024x1024",
    "portrait": "1024x1536",
    "landscape": "1536x1024",
    "hd": "1536x1024",
    "1k": "1024x1024",
    "2k": "2048x2048",
}

# instruct-edit 1K/2K → Banana aspectRatio + imageSize
_MEDIA_SIZE: dict[str, tuple[str, str]] = {
    "1k": ("1:1", "1K"),
    "2k": ("1:1", "2K"),
    "square": ("1:1", "1K"),
    "portrait": ("2:3", "1K"),
    "landscape": ("3:2", "1K"),
    "hd": ("3:2", "2K"),
}


def lk888_configured() -> bool:
    return bool(LK888_API_KEY)


def is_lk888_model(model: Optional[str]) -> bool:
    mid = (model or "").strip().lower()
    return mid in LK888_T2I_MODELS


def _resolve_model(model: Optional[str]) -> str:
    mid = (model or "").strip()
    if not is_lk888_model(mid):
        raise HTTPException(status_code=400, detail=f"Unsupported lk888 model: {mid}")
    return _LK888_MODEL_ALIAS.get(mid.lower(), mid)


def _api_size(size_preset: Optional[str]) -> str:
    return _SIZE_MAP.get((size_preset or "square").lower(), "1024x1024")


def _media_aspect_and_size(size_preset: Optional[str]) -> tuple[str, str]:
    key = (size_preset or "1k").lower()
    return _MEDIA_SIZE.get(key, ("1:1", "1K"))


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


def _bytes_to_data_url(raw: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def _sniff_mime(raw: bytes) -> str:
    if raw.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw.startswith(b"RIFF") and b"WEBP" in raw[:16]:
        return "image/webp"
    return "image/png"


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


def _require_prompt(prompt: str) -> str:
    text = (prompt or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Please enter a prompt.")
    if len(text) > 4000:
        raise HTTPException(
            status_code=400,
            detail="Prompt is too long (max 4000 characters).",
        )
    return text


async def _result_from_openai_images(data: dict, client: httpx.AsyncClient) -> Tuple[bytes, str]:
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
    return await _result_from_openai_images(data, client)


async def _edit_via_images(
    client: httpx.AsyncClient,
    *,
    model: str,
    prompt: str,
    size: str,
    refs: Sequence[bytes],
) -> Tuple[bytes, str]:
    """OpenAI-compatible multipart /images/edits (GPT Image 2)."""
    if not refs:
        raise HTTPException(status_code=400, detail="Please upload at least one reference image.")
    url = f"{LK888_BASE_URL}/images/edits"
    # Primary ref as `image`; extras as `image[]` when supported.
    files: list[tuple[str, tuple[str, bytes, str]]] = [
        ("image", ("ref0.png", refs[0], _sniff_mime(refs[0]))),
    ]
    for i, raw in enumerate(refs[1:LK888_MAX_REFS], start=1):
        files.append((f"image", (f"ref{i}.png", raw, _sniff_mime(raw))))
    data = {
        "model": model,
        "prompt": prompt,
        "size": size,
        "n": "1",
        "response_format": "b64_json",
    }
    resp = await client.post(
        url,
        headers=_auth_headers(json_body=False),
        data=data,
        files=files,
    )
    parsed = _parse_json(resp)
    if resp.status_code >= 400 or parsed.get("error"):
        # Retry without response_format if gateway rejects it.
        if resp.status_code in (400, 422) and "response_format" in str(parsed).lower():
            data.pop("response_format", None)
            resp = await client.post(
                url,
                headers=_auth_headers(json_body=False),
                data=data,
                files=files,
            )
            parsed = _parse_json(resp)
        if resp.status_code >= 400 or parsed.get("error"):
            _raise_recharge_or_502(parsed, resp)
    return await _result_from_openai_images(parsed, client)


async def _poll_media_task(
    client: httpx.AsyncClient,
    task_id: int,
) -> Tuple[bytes, str]:
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


async def _generate_via_media(
    client: httpx.AsyncClient,
    *,
    model: str,
    prompt: str,
    size_preset: Optional[str],
    refs: Optional[Sequence[bytes]] = None,
) -> Tuple[bytes, str]:
    """Async media pipeline for Banana 2 / Banana Pro (Gemini image)."""
    aspect, image_size = _media_aspect_and_size(size_preset)
    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "aspectRatio": aspect,
        "imageSize": image_size,
    }
    if refs:
        payload["images"] = [
            _bytes_to_data_url(raw, _sniff_mime(raw)) for raw in list(refs)[:LK888_MAX_REFS]
        ]

    create_url = f"{LK888_BASE_URL}/media/generate"
    resp = await client.post(create_url, headers=_auth_headers(), json=payload)
    data = _parse_json(resp)
    if resp.status_code >= 400 or data.get("error"):
        _raise_recharge_or_502(data, resp)
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
    return await _poll_media_task(client, task_id)


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
    text = _require_prompt(prompt)
    use_model = _resolve_model(model)

    try:
        async with httpx.AsyncClient(timeout=LK888_TIMEOUT + 30) as client:
            if use_model in _LK888_MEDIA_MODELS:
                return await _generate_via_media(
                    client,
                    model=use_model,
                    prompt=text,
                    size_preset=size_preset,
                )
            return await _generate_via_images(
                client, model=use_model, prompt=text, size=_api_size(size_preset)
            )
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="逍遥 AI image generation timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"逍遥 AI image generation failed: {exc}") from exc


async def generate_lk888_image_to_image(
    image_bytes: bytes,
    prompt: str,
    *,
    model: str,
    images: Optional[Sequence[bytes]] = None,
    output_size: Optional[str] = "2K",
) -> Tuple[bytes, str]:
    """Image-to-image / instruct edit. Returns (bytes, mime)."""
    if not LK888_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="逍遥 AI is not configured (LK888_API_KEY).",
        )
    text = _require_prompt(prompt)
    use_model = _resolve_model(model)
    refs: list[bytes] = []
    if image_bytes:
        refs.append(image_bytes)
    if images:
        for raw in images:
            if raw and raw not in refs:
                refs.append(raw)
    if not refs:
        raise HTTPException(status_code=400, detail="Please upload at least one reference image.")

    size_key = (output_size or "2K").strip().lower()
    try:
        async with httpx.AsyncClient(timeout=LK888_TIMEOUT + 30) as client:
            if use_model in _LK888_MEDIA_MODELS:
                return await _generate_via_media(
                    client,
                    model=use_model,
                    prompt=text,
                    size_preset=size_key,
                    refs=refs,
                )
            return await _edit_via_images(
                client,
                model=use_model,
                prompt=text,
                size=_api_size(size_key),
                refs=refs,
            )
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="逍遥 AI image generation timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"逍遥 AI image generation failed: {exc}") from exc
