"""DashScope Qwen / Wan image instruction edit (sync multimodal generation)."""

from __future__ import annotations

import base64
import os
from typing import Any, Optional, Sequence, Tuple

import httpx
from fastapi import HTTPException

from recipe_ai import DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL

# Style presets (server-side fallback when client sends preset id).
INSTRUCT_EDIT_PRESETS: dict[str, str] = {
    "manga_to_real": (
        "将这张图片从日式动漫/漫画风格转换为真实摄影人像风格。"
        "保持人物面部特征、发型、服装、姿态、构图与主体身份一致。"
        "使用真实皮肤质感、毛孔与自然光影，真实环境背景；"
        "去掉赛璐璐平涂、夸张线稿与二次元阴影。"
    ),
    "real_to_manga": (
        "将这张真人照片转换为日式动漫/漫画风格插画。"
        "保持人物面部特征、发型、服装、姿态、构图与主体身份一致。"
        "使用清晰线稿、赛璐璐上色、干净阴影与动漫角色质感；"
        "不要写成实摄影，不要过度写实。"
    ),
}


def _default_edit_model() -> str:
    """US Virginia: wan2.6-image; Beijing: qwen-image-2.0 (successor to qwen-image-edit)."""
    explicit = (os.environ.get("QWEN_IMAGE_EDIT_MODEL") or "").strip()
    if explicit:
        return explicit
    blob = " ".join(
        [
            DASHSCOPE_BASE_URL or "",
            os.environ.get("IMAGE_EDIT_DASHSCOPE_API_URL") or "",
            os.environ.get("DASHSCOPE_HTTP_API_URL") or "",
        ]
    ).lower()
    if "dashscope-us" in blob:
        return "wan2.6-image"
    return "qwen-image-2.0"


QWEN_IMAGE_EDIT_MODEL = _default_edit_model()
EDIT_TIMEOUT = float(os.environ.get("QWEN_IMAGE_EDIT_TIMEOUT", "180"))


def dashscope_image_edit_configured() -> bool:
    return bool(DASHSCOPE_API_KEY)


def resolve_edit_prompt(prompt: Optional[str], preset: Optional[str]) -> str:
    text = (prompt or "").strip()
    key = (preset or "").strip()
    if key and key in INSTRUCT_EDIT_PRESETS:
        base = INSTRUCT_EDIT_PRESETS[key]
        if not text:
            return base
        # User added notes after picking a preset.
        return f"{base}\n补充要求：{text}"
    return text


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


def _is_wan_model(model: str) -> bool:
    return model.lower().startswith("wan")


def _extract_image_url(data: dict) -> Optional[str]:
    """Pull first output image URL or data-URI from DashScope response shapes."""
    if not isinstance(data, dict):
        return None
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
    images: Optional[Sequence[bytes]] = None,
) -> Tuple[bytes, str]:
    """
    Returns (image_bytes, mime_type).
    `images` optional multi-ref (Wan edit supports 1–4); defaults to single image_bytes.
    """
    if not DASHSCOPE_API_KEY:
        raise HTTPException(status_code=503, detail="DashScope is not configured (DASHSCOPE_API_KEY).")
    text = (prompt or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Please enter an edit instruction.")
    use_model = (model or QWEN_IMAGE_EDIT_MODEL or _default_edit_model()).strip() or _default_edit_model()
    max_len = 2000 if _is_wan_model(use_model) else 1300
    if len(text) > max_len:
        raise HTTPException(
            status_code=400,
            detail=f"Instruction is too long (max {max_len} characters).",
        )

    refs: list[bytes] = []
    if images:
        refs = [b for b in images if b]
    if not refs and image_bytes:
        refs = [image_bytes]
    if not refs:
        raise HTTPException(status_code=400, detail="Empty image")
    if _is_wan_model(use_model) and len(refs) > 4:
        raise HTTPException(status_code=400, detail="Wan edit supports at most 4 reference images.")
    if not _is_wan_model(use_model) and len(refs) > 3:
        raise HTTPException(status_code=400, detail="This model supports at most 3 reference images.")

    content: list[dict[str, str]] = [{"image": _data_uri(b)} for b in refs]
    content.append({"text": text})

    parameters: dict[str, Any] = {"n": 1, "watermark": False}
    low_model = use_model.lower()
    if low_model.startswith("wan2.6"):
        parameters["enable_interleave"] = False
        parameters["prompt_extend"] = True
        parameters["size"] = "1K"
    elif low_model.startswith("wan2.7"):
        # Wan 2.7 / 2.7-pro edit: size + n
        parameters["size"] = "2K" if "pro" in low_model else "1K"
    elif _is_wan_model(use_model):
        parameters["enable_interleave"] = False
        parameters["size"] = "1K"

    url = _api_root().rstrip("/") + "/services/aigc/multimodal-generation/generation"
    payload: dict[str, Any] = {
        "model": use_model,
        "input": {"messages": [{"role": "user", "content": content}]},
        "parameters": parameters,
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
                try:
                    header, b64 = out_ref.split(",", 1)
                    mime = "image/png"
                    if "image/" in header:
                        mime = header.split(";")[0].split(":")[1] or mime
                    return base64.b64decode(b64), mime
                except Exception as exc:
                    raise HTTPException(status_code=502, detail="Invalid data-URI image") from exc
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
