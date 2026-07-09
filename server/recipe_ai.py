import base64
import json
import os
import re
from typing import Any, List, Optional, Union

import httpx

# Alibaba Cloud Model Studio (DashScope) — Qwen only
DASHSCOPE_API_KEY = os.environ.get("DASHSCOPE_API_KEY", "") or os.environ.get("QWEN_API_KEY", "")
DASHSCOPE_BASE_URL = os.environ.get(
    "DASHSCOPE_BASE_URL", "https://dashscope-us.aliyuncs.com/compatible-mode/v1"
).rstrip("/")
QWEN_MODEL = os.environ.get("QWEN_MODEL", "qwen3.7-plus-us")

MAX_INGREDIENTS_TEXT_LEN = 2000
HTTP_TIMEOUT = 120.0

RECIPE_SCHEMA_HINT = """
Return ONLY valid JSON (no markdown) with this exact structure:
{
  "title": "string",
  "servings": number,
  "prep_minutes": number,
  "cook_minutes": number,
  "ingredients": [{"name": "string", "amount": "string"}],
  "steps": [{"order": number, "text": "string"}],
  "tips": ["string"],
  "detected_ingredients": ["string"]
}
"""


def _extract_json(text: str) -> dict:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start : end + 1]
    return json.loads(cleaned)


def _normalize_recipe(data: dict, detected: Optional[List[str]] = None) -> dict:
    ingredients = data.get("ingredients") or []
    steps = data.get("steps") or []
    tips = data.get("tips") or []
    detected_list = data.get("detected_ingredients") or detected or []

    norm_ingredients = []
    for item in ingredients:
        if isinstance(item, dict):
            norm_ingredients.append(
                {
                    "name": str(item.get("name") or "").strip(),
                    "amount": str(item.get("amount") or "").strip(),
                }
            )
        elif isinstance(item, str) and item.strip():
            norm_ingredients.append({"name": item.strip(), "amount": ""})

    norm_steps = []
    for idx, step in enumerate(steps, start=1):
        if isinstance(step, dict):
            order = int(step.get("order") or idx)
            text = str(step.get("text") or "").strip()
        else:
            order = idx
            text = str(step).strip()
        if text:
            norm_steps.append({"order": order, "text": text})

    norm_steps.sort(key=lambda s: s["order"])
    for i, step in enumerate(norm_steps, start=1):
        step["order"] = i

    return {
        "title": str(data.get("title") or "Recipe").strip() or "Recipe",
        "servings": max(1, int(data.get("servings") or 2)),
        "prep_minutes": max(0, int(data.get("prep_minutes") or 0)),
        "cook_minutes": max(0, int(data.get("cook_minutes") or 0)),
        "ingredients": norm_ingredients,
        "steps": norm_steps,
        "tips": [str(t).strip() for t in tips if str(t).strip()],
        "detected_ingredients": [str(x).strip() for x in detected_list if str(x).strip()],
    }


def _locale_prompt(locale: str) -> str:
    if locale == "zh-CN":
        return (
            "Write the recipe in Simplified Chinese. Use metric units (克、毫升、个). "
            "Include 1-2 practical tips and a brief food-safety note if relevant."
        )
    return (
        "Write the recipe in English. Use common cooking units. "
        "Include 1-2 practical tips and a brief food-safety note if relevant."
    )


def _mime_for_image(image_bytes: bytes, image_mime: Optional[str]) -> str:
    mime = (image_mime or "").split(";")[0].strip().lower()
    if mime in {"image/jpeg", "image/png", "image/webp"}:
        return mime
    if image_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


def _build_user_content(
    ingredients_text: str,
    image_bytes: Optional[bytes],
    image_mime: Optional[str],
    locale: str,
) -> Union[str, List[dict]]:
    parts: List[str] = []
    if locale == "zh-CN":
        parts.append("请根据以下信息生成一道实用的主菜菜谱。")
        if ingredients_text.strip():
            parts.append(f"用户提供的食材文字：{ingredients_text.strip()}")
        if image_bytes:
            parts.append("用户还上传了一张食材图片，请识别图中可见食材并纳入菜谱。")
        if not ingredients_text.strip() and image_bytes:
            parts.append("用户仅提供了图片，请从图片中识别食材。")
        parts.append("请用 JSON 格式输出菜谱，不要输出 markdown。")
    else:
        parts.append("Generate one practical main dish recipe from the information below.")
        if ingredients_text.strip():
            parts.append(f"User-provided ingredients: {ingredients_text.strip()}")
        if image_bytes:
            parts.append("The user also uploaded an ingredient photo — identify visible items and use them.")
        if not ingredients_text.strip() and image_bytes:
            parts.append("Only a photo was provided — identify ingredients from the image.")
        parts.append("Output the recipe as JSON only, not markdown.")

    text_block = "\n".join(parts)

    if image_bytes:
        b64 = base64.b64encode(image_bytes).decode("ascii")
        mime = _mime_for_image(image_bytes, image_mime)
        # Image first — matches Qwen VL examples and improves recognition
        return [
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
            {"type": "text", "text": text_block},
        ]
    return text_block


def _extract_message_content(message: dict) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        chunks: List[str] = []
        for part in content:
            if isinstance(part, dict):
                if part.get("type") == "text" and part.get("text"):
                    chunks.append(str(part["text"]))
                elif part.get("text"):
                    chunks.append(str(part["text"]))
            elif isinstance(part, str):
                chunks.append(part)
        return "\n".join(chunks).strip()
    if content is None:
        return ""
    return str(content).strip()


async def _call_qwen(messages: List[dict], use_json_mode: bool) -> str:
    if not DASHSCOPE_API_KEY:
        raise RuntimeError("DashScope API key is not configured (set DASHSCOPE_API_KEY)")

    payload: dict = {
        "model": QWEN_MODEL,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 4096,
    }
    if use_json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        resp = await client.post(f"{DASHSCOPE_BASE_URL}/chat/completions", json=payload, headers=headers)
        if resp.status_code >= 400:
            detail = resp.text[:800]
            raise RuntimeError(f"Qwen API error ({resp.status_code}): {detail}")
        data = resp.json()

    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"Qwen returned no choices: {json.dumps(data)[:500]}")

    choice = choices[0]
    message = choice.get("message") or {}
    content = _extract_message_content(message)
    if not content:
        finish = choice.get("finish_reason") or "unknown"
        raise RuntimeError(
            f"Qwen returned empty content (finish_reason={finish}): {json.dumps(data)[:500]}"
        )
    return content


def _parse_text_ingredients(ingredients_text: str) -> List[str]:
    merged: List[str] = []
    seen = set()
    for part in re.split(r"[,，、\n;；]+", ingredients_text or ""):
        part = part.strip()
        if part:
            key = part.lower()
            if key not in seen:
                seen.add(key)
                merged.append(part)
    return merged


async def generate_recipe(
    ingredients_text: str,
    image_bytes: Optional[bytes],
    image_mime: Optional[str],
    locale: str,
) -> dict:
    locale = "zh-CN" if locale == "zh-CN" else "en"
    text_only = _parse_text_ingredients(ingredients_text)

    if not text_only and not image_bytes:
        raise ValueError("No ingredients found. Please enter text or upload a clearer ingredient photo.")

    has_image = bool(image_bytes)
    system_text = (
        "You are a helpful cooking assistant. Generate exactly one complete recipe. "
        "If an image is provided, identify visible food ingredients first. "
        "Put all identified or user-provided ingredient names in detected_ingredients. "
        f"{_locale_prompt(locale)} {RECIPE_SCHEMA_HINT}"
    )
    system_prompt: Union[str, List[dict]] = (
        [{"type": "text", "text": system_text}] if has_image else system_text
    )

    user_content = _build_user_content(ingredients_text, image_bytes, image_mime, locale)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    # Vision + json_object often returns empty on Qwen; text-only works with json mode
    use_json_mode = not has_image
    raw = await _call_qwen(messages, use_json_mode=use_json_mode)
    try:
        parsed = _extract_json(raw)
    except json.JSONDecodeError:
        raw = await _call_qwen(messages, use_json_mode=False)
        parsed = _extract_json(raw)

    fallback_detected = text_only
    recipe = _normalize_recipe(parsed, detected=fallback_detected)
    if not recipe["detected_ingredients"] and fallback_detected:
        recipe["detected_ingredients"] = fallback_detected
    return recipe
