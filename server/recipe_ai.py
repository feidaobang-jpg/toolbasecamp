import base64
import json
import os
import re
from typing import List, Optional, Tuple, Union

import httpx

# Alibaba Cloud Model Studio (DashScope) — Qwen only
DASHSCOPE_API_KEY = os.environ.get("DASHSCOPE_API_KEY", "") or os.environ.get("QWEN_API_KEY", "")
DASHSCOPE_BASE_URL = os.environ.get(
    "DASHSCOPE_BASE_URL", "https://dashscope-us.aliyuncs.com/compatible-mode/v1"
).rstrip("/")
QWEN_MODEL = os.environ.get("QWEN_MODEL", "qwen3.7-plus-us")
# Vision step: dedicated VL model is more reliable than one-shot image+recipe
QWEN_VL_MODEL = os.environ.get("QWEN_VL_MODEL", "qwen3-vl-plus")

MAX_INGREDIENTS_TEXT_LEN = 2000
MAX_RECIPE_IMAGES = 5
HTTP_TIMEOUT = 120.0
RECIPE_MAX_TOKENS = 1800
RECIPE_TEMPERATURE = 0.5

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


def _image_data_url(image_bytes: bytes, image_mime: Optional[str]) -> str:
    mime = _mime_for_image(image_bytes, image_mime)
    b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _extract_message_content(message: dict) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        chunks: List[str] = []
        for part in content:
            if isinstance(part, dict):
                if part.get("text"):
                    chunks.append(str(part["text"]))
            elif isinstance(part, str):
                chunks.append(part)
        return "\n".join(chunks).strip()
    if content is None:
        return ""
    return str(content).strip()


async def _call_qwen(
    messages: List[dict],
    *,
    model: str,
    use_json_mode: bool = False,
    max_tokens: int = 4096,
    temperature: float = 0.7,
) -> str:
    if not DASHSCOPE_API_KEY:
        raise RuntimeError("DashScope API key is not configured (set DASHSCOPE_API_KEY)")

    payload: dict = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
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
            raise RuntimeError(f"Qwen API error ({resp.status_code}) model={model}: {detail}")
        data = resp.json()

    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"Qwen returned no choices (model={model}): {json.dumps(data)[:500]}")

    choice = choices[0]
    message = choice.get("message") or {}
    content = _extract_message_content(message)
    if not content:
        finish = choice.get("finish_reason") or "unknown"
        raise RuntimeError(
            f"Qwen returned empty content (model={model}, finish_reason={finish}): "
            f"{json.dumps(data)[:500]}"
        )
    return content


def _parse_text_ingredients(ingredients_text: str) -> List[str]:
    merged: List[str] = []
    seen = set()
    for part in re.split(r"[,，、\n;；\s]+", ingredients_text or ""):
        part = part.strip()
        if part:
            key = part.lower()
            if key not in seen:
                seen.add(key)
                merged.append(part)
    return merged


def _merge_ingredient_lists(text_list: List[str], vision_list: List[str]) -> List[str]:
    merged: List[str] = []
    seen = set()
    for name in text_list + vision_list:
        key = (name or "").strip().lower()
        if key and key not in seen:
            seen.add(key)
            merged.append(name.strip())
    return merged


async def _vision_extract_ingredients(
    image_bytes: bytes,
    image_mime: Optional[str],
    locale: str,
) -> Tuple[List[str], str]:
    if locale == "zh-CN":
        prompt = (
            "请识别这张图片中可见的食材（食物原料）。"
            '只输出 JSON：{"ingredients":["食材1","食材2"],"notes":"可选简短备注"}。'
            "不要输出 markdown 或其他说明。"
        )
    else:
        prompt = (
            "Identify visible food ingredients in this image. "
            'Output JSON only: {"ingredients":["item1","item2"],"notes":"optional"}'
        )

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": _image_data_url(image_bytes, image_mime)}},
                {"type": "text", "text": prompt},
            ],
        }
    ]

    models_to_try = []
    for m in (QWEN_VL_MODEL, QWEN_MODEL, "qwen-vl-plus", "qwen3-vl-plus"):
        if m and m not in models_to_try:
            models_to_try.append(m)

    last_err: Optional[Exception] = None
    for model in models_to_try:
        try:
            raw = await _call_qwen(messages, model=model, use_json_mode=False)
            data = _extract_json(raw)
            items = data.get("ingredients") or []
            names = [str(x).strip() for x in items if str(x).strip()]
            notes = str(data.get("notes") or "").strip()
            if names:
                return names, notes
            last_err = RuntimeError(f"Vision model {model} returned no ingredients")
        except Exception as exc:
            last_err = exc
            print(f"[recipe/vision] model={model} failed: {exc}")

    raise RuntimeError(f"Could not identify ingredients from image: {last_err}")


async def _generate_recipe_from_text(
    ingredients: List[str],
    locale: str,
    extra_notes: str = "",
) -> dict:
    ingredient_list = ", ".join(ingredients)
    if locale == "zh-CN":
        user_text = f"可用食材：{ingredient_list}。请生成一道实用的主菜菜谱。"
    else:
        user_text = f"Available ingredients: {ingredient_list}. Create one practical main dish recipe."

    system_text = (
        "You are a helpful cooking assistant. Generate exactly one complete recipe. "
        "Put all used ingredient names in detected_ingredients. "
        f"{_locale_prompt(locale)} {RECIPE_SCHEMA_HINT}"
    )
    messages = [
        {"role": "system", "content": system_text},
        {"role": "user", "content": user_text},
    ]

    raw = await _call_qwen(
        messages,
        model=QWEN_MODEL,
        use_json_mode=True,
        max_tokens=RECIPE_MAX_TOKENS,
        temperature=RECIPE_TEMPERATURE,
    )
    parsed = _extract_json(raw)

    recipe = _normalize_recipe(parsed, detected=ingredients)
    if not recipe["detected_ingredients"]:
        recipe["detected_ingredients"] = ingredients
    return recipe


def _build_ingredient_catalog(
    text_list: List[str],
    vision_lists: List[List[str]],
) -> List[dict]:
    catalog: dict = {}
    for name in text_list:
        key = name.strip().lower()
        if not key:
            continue
        if key not in catalog:
            catalog[key] = {"name": name.strip(), "sources": ["text"]}
        elif "text" not in catalog[key]["sources"]:
            catalog[key]["sources"].append("text")

    for names in vision_lists:
        for name in names:
            key = (name or "").strip().lower()
            if not key:
                continue
            if key not in catalog:
                catalog[key] = {"name": name.strip(), "sources": ["image"]}
            elif "image" not in catalog[key]["sources"]:
                catalog[key]["sources"].append("image")

    return list(catalog.values())


async def detect_ingredients(
    ingredients_text: str,
    images: List[Tuple[bytes, Optional[str]]],
    locale: str,
) -> dict:
    locale = "zh-CN" if locale == "zh-CN" else "en"
    text_ingredients = _parse_text_ingredients(ingredients_text)

    vision_lists: List[List[str]] = []
    vision_notes: List[str] = []

    for image_bytes, image_mime in images:
        try:
            names, notes = await _vision_extract_ingredients(image_bytes, image_mime, locale)
            if names:
                vision_lists.append(names)
            if notes:
                vision_notes.append(notes)
        except RuntimeError as exc:
            print(f"[recipe/detect] vision step failed: {exc}")
            if not text_ingredients and len(images) == 1:
                raise ValueError(
                    "Could not identify ingredients from the photo. "
                    "Try a clearer image or enter ingredients as text."
                ) from exc

    catalog = _build_ingredient_catalog(text_ingredients, vision_lists)
    if not catalog:
        raise ValueError("No ingredients found. Please enter text or upload clearer ingredient photos.")

    return {
        "ingredients": catalog,
        "notes": " ".join(vision_notes).strip(),
    }


async def generate_recipe_from_selection(
    ingredients: List[str],
    locale: str,
) -> dict:
    locale = "zh-CN" if locale == "zh-CN" else "en"
    cleaned: List[str] = []
    seen = set()
    for name in ingredients:
        key = (name or "").strip().lower()
        if key and key not in seen:
            seen.add(key)
            cleaned.append(name.strip())

    if not cleaned:
        raise ValueError("Please select at least one ingredient.")

    return await _generate_recipe_from_text(cleaned, locale)


async def generate_recipe(
    ingredients_text: str,
    image_bytes: Optional[bytes],
    image_mime: Optional[str],
    locale: str,
) -> dict:
    locale = "zh-CN" if locale == "zh-CN" else "en"
    text_ingredients = _parse_text_ingredients(ingredients_text)

    if not text_ingredients and not image_bytes:
        raise ValueError("No ingredients found. Please enter text or upload a clearer ingredient photo.")

    vision_ingredients: List[str] = []
    vision_notes = ""

    if image_bytes:
        try:
            vision_ingredients, vision_notes = await _vision_extract_ingredients(
                image_bytes, image_mime, locale
            )
        except RuntimeError as exc:
            print(f"[recipe/generate] vision step failed: {exc}")
            if not text_ingredients:
                raise ValueError(
                    "Could not identify ingredients from the photo. "
                    "Try a clearer image or enter ingredients as text."
                ) from exc

    merged = _merge_ingredient_lists(text_ingredients, vision_ingredients)
    if not merged:
        raise ValueError("No ingredients found. Please enter text or upload a clearer ingredient photo.")

    return await _generate_recipe_from_text(merged, locale, vision_notes)
