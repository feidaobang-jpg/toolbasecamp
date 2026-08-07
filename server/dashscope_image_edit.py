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
        "输出必须为全彩照片风格，禁止黑白或灰度。"
    ),
    "real_to_manga": (
        "将这张真人照片转换为日式动漫/漫画风格插画。"
        "保持人物面部特征、发型、服装、姿态、构图与主体身份一致。"
        "使用清晰线稿、彩色赛璐璐上色、干净阴影与动漫角色质感；"
        "不要写成实摄影，不要过度写实。"
        "输出必须为全彩上色插画，禁止纯黑白线稿、灰度素描或未上色线稿。"
    ),
    "restore_old_photo": (
        "修复这张老照片：去除折痕、污渍、霉斑、噪点与严重划痕，"
        "补全破损边缘与轻微缺失区域，提升清晰度与细节。"
        "保持人物五官、发型、服装与整体构图身份一致，不要换成另一个人。"
        "修正曝光与对比度，恢复自然肤色与合理光影；"
        "若原图为黑白或严重褪色，可自然上色为真实彩色照片；"
        "避免过度磨皮、网红滤镜或塑料感；输出全彩修复成品。"
    ),
    "id_photo_white": (
        "将这张人像处理成标准证件照风格："
        "纯白色干净背景，无阴影杂物；正面或近正面半身/大头照构图，"
        "人物居中，表情自然端正；保留真实五官与发型身份，不要换成他人。"
        "光线均匀柔和，服装保持原样或整理为得体正装感；"
        "禁止夸张美颜、网红滤镜与虚化背景；输出全彩证件照。"
    ),
    "remove_watermark": (
        "去除画面中的水印、Logo、字幕条、角标、日期戳与明显文字贴纸，"
        "并清除无关杂物、污点与遮挡物；用周围纹理与内容自然填补。"
        "保持主体人物或商品、构图、光影与风格一致，不要改脸或换人。"
        "不要新增加其他水印或文字；输出干净全彩成品。"
    ),
    "beauty_light": (
        "对人像做轻度美颜修饰：均匀肤色、淡化明显瑕疵与黑眼圈，"
        "略微提亮眼神与气色，保持真实皮肤质感与毛孔，"
        "五官、脸型、发型与身份必须一致，禁止整容级改脸、过度磨皮、假睫毛夸张或塑料感。"
        "背景与服装基本保持；输出自然全彩人像。"
    ),
    "colorize_bw": (
        "将这张黑白、灰度或严重褪色的照片自然上色为真实彩色照片。"
        "肤色、头发、服装与环境颜色要合理真实，光影与材质一致；"
        "保持人物五官、姿态与构图身份不变，不要换成他人。"
        "避免荧光假色与过度饱和；输出全彩照片。"
    ),
    "product_white_bg": (
        "将商品主体抠出并置于纯白简洁电商背景上，去除杂乱桌面与背景干扰。"
        "保持商品外形、材质、颜色、Logo 与比例真实准确，不要变形或换款。"
        "光线干净均匀，轻微自然投影即可，适合电商主图；"
        "禁止添加多余道具或文字水印；输出全彩商品图。"
    ),
    "lineart_colorize": (
        "为这张线稿/草图进行全彩上色：保留清晰线稿结构，"
        "填充合理的服装、肤色、头发与环境色彩，阴影干净分层。"
        "保持角色设计与姿态一致；输出全彩上色插画，"
        "禁止只输出未上色线稿或纯灰度。"
    ),
    "expand_edges": (
        "在保持主体与构图风格一致的前提下，自然补全画面破损边缘，"
        "并适度向外扩展场景内容（外扩约 10%～20% 视野），"
        "新生成的背景与光影要与原图连贯，不要改变人物身份或主体比例。"
        "避免重复纹理与扭曲肢体；输出全彩完整画面。"
    ),
}

# Prepended unless the user clearly asks for B&W / line art / grayscale.
# Put at the start: short turbo models often ignore trailing constraints.
_COLOR_FULL_HINT = (
    "【画面要求】必须输出全彩上色成品（full color），"
    "有自然肤色、服装色彩与环境色彩；"
    "禁止黑白、灰度、单色、未上色线稿、纯线描、素描或只有轮廓的漫画线稿。"
)

_MONO_MARKERS = (
    "黑白",
    "灰度",
    "单色",
    "线稿",
    "素描",
    "铅笔画",
    "炭笔",
    "墨线",
    "未上色",
    "black and white",
    "black & white",
    "b&w",
    "bw ",
    "grayscale",
    "greyscale",
    "monochrome",
    "line art",
    "lineart",
    "line-art",
    "sketch only",
    "pencil sketch",
)


def _wants_monochrome(prompt: str) -> bool:
    low = (prompt or "").lower()
    for m in _MONO_MARKERS:
        if m.lower() in low:
            return True
    return False


def apply_color_hint(prompt: str) -> str:
    """Prefer full-color output unless the user asked for mono/line-art."""
    text = (prompt or "").strip()
    if not text or _wants_monochrome(text):
        return text
    if "全彩" in text or "彩色" in text or "full color" in text.lower():
        return text
    if "【画面要求】" in text:
        return text
    return f"{_COLOR_FULL_HINT}\n{text}"


def _default_edit_model() -> str:
    """Default instruct-edit model: 万相 Wan 2.6 (Beijing DashScope)."""
    explicit = (
        os.environ.get("WAN_IMAGE_EDIT_MODEL")
        or os.environ.get("QWEN_IMAGE_EDIT_MODEL")
        or ""
    ).strip()
    if explicit:
        return explicit
    return "wan2.6-image"


QWEN_IMAGE_EDIT_MODEL = _default_edit_model()
EDIT_TIMEOUT = float(os.environ.get("QWEN_IMAGE_EDIT_TIMEOUT", "180"))
EDIT_PRO_TIMEOUT = float(os.environ.get("QWEN_IMAGE_EDIT_PRO_TIMEOUT", "360"))


def dashscope_image_edit_configured() -> bool:
    return bool(DASHSCOPE_API_KEY)


def resolve_edit_prompt(prompt: Optional[str], preset: Optional[str]) -> str:
    text = (prompt or "").strip()
    key = (preset or "").strip()
    if key and key in INSTRUCT_EDIT_PRESETS:
        base = INSTRUCT_EDIT_PRESETS[key]
        if not text:
            return apply_color_hint(base)
        # User added notes after picking a preset.
        return apply_color_hint(f"{base}\n补充要求：{text}")
    return apply_color_hint(text)


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
    return "https://dashscope.aliyuncs.com/api/v1"


def _guess_mime(image_bytes: bytes) -> str:
    if image_bytes.startswith(b"\x89PNG"):
        return "image/png"
    if image_bytes.startswith(b"RIFF") and b"WEBP" in image_bytes[:16]:
        return "image/webp"
    if image_bytes.startswith(b"\xff\xd8"):
        return "image/jpeg"
    return "image/jpeg"


def _data_uri(image_bytes: bytes, mime: Optional[str] = None) -> str:
    use_mime = mime or _guess_mime(image_bytes)
    b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{use_mime};base64,{b64}"


def _is_wan_model(model: str) -> bool:
    return model.lower().startswith("wan")


def _is_qwen_image_model(model: str) -> bool:
    return model.lower().startswith("qwen-image")


def _edit_prompt_max_len(model: str) -> int:
    low = (model or "").lower()
    if _is_wan_model(low):
        return 2000
    if low.startswith("qwen-image-3"):
        return 2000
    return 1300


def _normalize_edit_image(image_bytes: bytes, *, for_wan: bool) -> tuple[bytes, str]:
    """
    Prepare image for DashScope edit APIs.
    Wan rejects PNG with alpha; also enforce width/height in [240, 8000].
    """
    from io import BytesIO

    from PIL import Image

    try:
        im = Image.open(BytesIO(image_bytes))
        im.load()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Image decode failed") from exc

    w, h = im.size
    if w < 240 or h < 240:
        raise HTTPException(status_code=400, detail="Image resolution is too small")
    if w > 8000 or h > 8000:
        raise HTTPException(status_code=400, detail="Image resolution is too large")

    src_mime = _guess_mime(image_bytes)
    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in (im.info or {}))
    force_jpeg = for_wan or has_alpha or src_mime == "image/png"

    if has_alpha:
        rgba = im.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        im = bg
    elif im.mode != "RGB":
        im = im.convert("RGB")

    if not force_jpeg:
        return image_bytes, src_mime

    # Keep mobile-friendly size for Wan (still within API limits).
    max_edge = 2048 if for_wan else 4096
    scale = min(1.0, max_edge / float(max(w, h)))
    if scale < 1.0:
        nw = max(240, int(round(w * scale)))
        nh = max(240, int(round(h * scale)))
        im = im.resize((nw, nh), Image.LANCZOS)

    buf = BytesIO()
    im.save(buf, format="JPEG", quality=92, optimize=True)
    out = buf.getvalue()
    if not out:
        raise HTTPException(status_code=400, detail="Image decode failed")
    return out, "image/jpeg"


def _parse_dashscope_response(resp: httpx.Response) -> dict:
    """Parse DashScope body; surface plain-text InvalidParameter cleanly."""
    raw = (resp.content or b"").decode("utf-8", errors="replace").strip()
    if not raw:
        return {}
    try:
        data = resp.json()
        return data if isinstance(data, dict) else {}
    except Exception:
        low = raw.lower()
        if "invalidparameter" in low.replace(" ", ""):
            return {"code": "InvalidParameter", "message": raw[:300]}
        return {"message": raw[:300]}


def _dashscope_error_detail(data: dict, resp: httpx.Response, *, action: str) -> str:
    code = str((data or {}).get("code") or "").strip()
    message = str((data or {}).get("message") or "").strip()
    if code == "InvalidParameter" or "invalidparameter" in (message or "").lower().replace(" ", ""):
        return (
            f"{action} failed: InvalidParameter "
            "(image may have transparency / unsupported format / bad size). "
            "Try JPG without alpha, 240–8000px."
        )
    detail = message or code or (resp.text or "")[:300] or f"HTTP {resp.status_code}"
    return f"{action} failed: {detail}"


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
    max_len = _edit_prompt_max_len(use_model)
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

    for_wan = _is_wan_model(use_model)
    norm_refs: list[tuple[bytes, str]] = [_normalize_edit_image(b, for_wan=for_wan) for b in refs]

    image_parts = [{"image": _data_uri(b, mime)} for b, mime in norm_refs]
    # Qwen Image: images then text; Wan official examples use text first.
    if _is_qwen_image_model(use_model):
        content: list[dict[str, str]] = image_parts + [{"text": text}]
    else:
        content = [{"text": text}] + image_parts

    parameters: dict[str, Any] = {"n": 1, "watermark": False}
    low_model = use_model.lower()
    if low_model.startswith("qwen-image-3"):
        parameters["prompt_extend"] = True
    elif low_model.startswith("wan2.6"):
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
    timeout = EDIT_PRO_TIMEOUT if "pro" in use_model.lower() else EDIT_TIMEOUT
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, headers=headers, json=payload)
            data = _parse_dashscope_response(resp)
            if resp.status_code >= 400 or data.get("code"):
                raise HTTPException(
                    status_code=502,
                    detail=_dashscope_error_detail(data, resp, action="Image edit"),
                )
            out_ref = _extract_image_url(data)
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


async def generate_image_from_text(
    prompt: str,
    *,
    model: Optional[str] = None,
    size_preset: Optional[str] = None,
) -> Tuple[bytes, str]:
    """Text-to-image via DashScope multimodal generation. Returns (bytes, mime)."""
    if not DASHSCOPE_API_KEY:
        raise HTTPException(status_code=503, detail="DashScope is not configured (DASHSCOPE_API_KEY).")
    text = (prompt or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Please enter a prompt.")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="Prompt is too long (max 2000 characters).")
    text = apply_color_hint(text)
    use_model = (model or "z-image-turbo").strip() or "z-image-turbo"
    preset = (size_preset or "square").strip().lower() or "square"

    parameters: dict[str, Any] = {"n": 1, "watermark": False}
    low = use_model.lower()
    if low.startswith("z-image"):
        size_map = {
            "square": "1024*1024",
            "portrait": "1024*1536",
            "landscape": "1536*1024",
        }
        parameters["size"] = size_map.get(preset, "1024*1024")
        parameters["prompt_extend"] = False
    elif low.startswith("wan2.7") or low.startswith("wan2.6"):
        # Wan text-to-image uses 1K/2K/4K (pro only for 4K)
        if preset == "hd" and "pro" in low:
            parameters["size"] = "4K"
        elif preset in ("landscape", "portrait", "hd"):
            parameters["size"] = "2K"
        else:
            parameters["size"] = "2K"
    else:
        parameters["size"] = "1024*1024"

    url = _api_root().rstrip("/") + "/services/aigc/multimodal-generation/generation"
    payload: dict[str, Any] = {
        "model": use_model,
        "input": {"messages": [{"role": "user", "content": [{"text": text}]}]},
        "parameters": parameters,
    }
    headers = {
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }
    timeout = EDIT_PRO_TIMEOUT if "pro" in low else EDIT_TIMEOUT
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, headers=headers, json=payload)
            data = _parse_dashscope_response(resp)
            if resp.status_code >= 400 or data.get("code"):
                raise HTTPException(
                    status_code=502,
                    detail=_dashscope_error_detail(data, resp, action="Image generation"),
                )
            out_ref = _extract_image_url(data)
            if not out_ref:
                raise HTTPException(
                    status_code=502,
                    detail="Image generation returned no image. Check model access on DashScope.",
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
                raise HTTPException(status_code=502, detail="Failed to download generated image")
            ctype = (img_resp.headers.get("content-type") or "image/png").split(";")[0].strip()
            if not ctype.startswith("image/"):
                ctype = "image/png"
            return img_resp.content, ctype
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Image generation timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Image generation failed: {exc}") from exc
