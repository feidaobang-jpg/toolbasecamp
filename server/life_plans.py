"""Life plan generators (DeepSeek) + drug-label large-print (OCR + LLM)."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from recipe_ai import (
    DEEPSEEK_API_KEY,
    _call_deepseek,
    _extract_json,
)
from tencent_image import ocr_general_text, tencent_configured

security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/life-plans", tags=["life-plans"])

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@toolbasecamp.com").lower()
LIMITS = {
    "life_plan": int(os.environ.get("LIFE_PLAN_LIMIT", "20")),
    "drug_label": int(os.environ.get("DRUG_LABEL_LIMIT", "10")),
}
MAX_UPLOAD = 8 * 1024 * 1024
# Bump when Chinese prompt / locale logic changes — also exposed on /health.
LIFE_PLANS_PROMPT_REV = 4

PLAN_KINDS = frozenset(
    {
        "weight_loss",
        "study",
        "road_trip",
        "pc_upgrade",
        "seasonal_food",
        "outfit",
        "day_trip",
        "savings",
        "interview",
        "family_meal",
    }
)


def deepseek_configured() -> bool:
    return bool(DEEPSEEK_API_KEY)


def _wire(get_conn, require_db, get_current_user):
    router.get_conn = get_conn  # type: ignore[attr-defined]
    router.require_db = require_db  # type: ignore[attr-defined]
    router.get_current_user = get_current_user  # type: ignore[attr-defined]


def _user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    return router.get_current_user(creds)  # type: ignore[attr-defined]


def _conn():
    router.require_db()  # type: ignore[attr-defined]
    return router.get_conn()  # type: ignore[attr-defined]


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _is_admin(user: dict) -> bool:
    return user.get("role") == "admin" or (user.get("email") or "").lower() == ADMIN_EMAIL


def _unlimited_quota() -> dict:
    return {"used": 0, "limit": 0, "remaining": 0, "unlimited": True}


def ensure_quota_table(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS image_tool_quotas (
            user_id BIGINT NOT NULL,
            action_type VARCHAR(32) NOT NULL,
            usage_date CHAR(10) NOT NULL,
            usage_count INT NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, action_type, usage_date),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )


def _consume_quota(user: dict, action: str) -> dict:
    if _is_admin(user):
        return _unlimited_quota()
    user_id = int(user["id"])
    max_count = LIMITS.get(action, 0)
    if max_count <= 0:
        raise HTTPException(status_code=503, detail="This action is disabled")
    today = _today()
    conn = _conn()
    try:
        with conn.cursor() as cur:
            ensure_quota_table(cur)
            cur.execute(
                """
                SELECT usage_count FROM image_tool_quotas
                WHERE user_id=%s AND action_type=%s AND usage_date=%s
                """,
                (user_id, action, today),
            )
            row = cur.fetchone()
            current = int(row["usage_count"]) if row else 0
            if current >= max_count:
                raise HTTPException(
                    status_code=429,
                    detail="Daily limit reached. Please try again tomorrow.",
                )
            if row:
                cur.execute(
                    """
                    UPDATE image_tool_quotas SET usage_count = usage_count + 1
                    WHERE user_id=%s AND action_type=%s AND usage_date=%s
                    """,
                    (user_id, action, today),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO image_tool_quotas (user_id, action_type, usage_date, usage_count)
                    VALUES (%s, %s, %s, 1)
                    """,
                    (user_id, action, today),
                )
            used = current + 1
        return {"used": used, "limit": max_count, "remaining": max(0, max_count - used)}
    finally:
        conn.close()


def _peek_quota(user: dict, action: str) -> dict:
    if _is_admin(user):
        return _unlimited_quota()
    max_count = LIMITS.get(action, 0)
    today = _today()
    conn = _conn()
    try:
        with conn.cursor() as cur:
            ensure_quota_table(cur)
            cur.execute(
                """
                SELECT usage_count FROM image_tool_quotas
                WHERE user_id=%s AND action_type=%s AND usage_date=%s
                """,
                (int(user["id"]), action, today),
            )
            row = cur.fetchone()
            used = int(row["usage_count"]) if row else 0
        return {
            "used": used,
            "limit": max_count,
            "remaining": max(0, max_count - used),
            "action": action,
        }
    finally:
        conn.close()


class PlanGenerateBody(BaseModel):
    kind: str = Field(..., min_length=2, max_length=32)
    locale: str = Field(default="zh-CN", max_length=16)
    fields: dict[str, Any] = Field(default_factory=dict)


def _locale_is_zh(locale: str) -> bool:
    return (locale or "").lower().startswith("zh")


def _current_season(month: Optional[int] = None) -> str:
    m = month if month is not None else datetime.now().month
    if m in (3, 4, 5):
        return "spring"
    if m in (6, 7, 8):
        return "summer"
    if m in (9, 10, 11):
        return "autumn"
    return "winter"


async def _fetch_temperature(city: str) -> Optional[dict]:
    """Open-Meteo geocode + current temp. No API key required."""
    name = (city or "").strip()
    if not name:
        return None
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            geo = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": name, "count": 1, "language": "zh"},
            )
            if geo.status_code >= 400:
                return None
            results = (geo.json() or {}).get("results") or []
            if not results:
                return None
            place = results[0]
            lat = place.get("latitude")
            lon = place.get("longitude")
            wx = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,weather_code",
                    "timezone": "auto",
                },
            )
            if wx.status_code >= 400:
                return None
            current = (wx.json() or {}).get("current") or {}
            temp = current.get("temperature_2m")
            if temp is None:
                return None
            return {
                "city": place.get("name") or name,
                "country": place.get("country") or "",
                "temperature_c": float(temp),
                "weather_code": current.get("weather_code"),
            }
    except Exception:
        return None


def _text_has_cjk(s: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in (s or ""))


def _plan_looks_mostly_english(plan: dict) -> bool:
    parts = [str(plan.get("title") or ""), str(plan.get("summary") or "")]
    for sec in plan.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        parts.append(str(sec.get("heading") or ""))
        for b in sec.get("bullets") or []:
            parts.append(str(b))
    sample = " ".join(parts)
    cjk = sum(1 for ch in sample if "\u4e00" <= ch <= "\u9fff")
    ascii_letters = sum(1 for ch in sample if ("A" <= ch <= "Z") or ("a" <= ch <= "z"))
    if ascii_letters < 24:
        return False
    return cjk * 3 < ascii_letters


def _resolve_plan_locale(locale: str, fields: dict) -> str:
    """Prefer zh-CN. Only keep English when client explicitly asks and no CJK input."""
    raw = (locale or "").strip() or "zh-CN"
    low = raw.lower()
    blob = " ".join(str(v) for v in (fields or {}).values())
    if _text_has_cjk(blob):
        return "zh-CN"
    if low == "en" or low.startswith("en-"):
        return "en"
    # Default Chinese for this product (UI zh, numeric-only forms, etc.)
    return "zh-CN"


def _plan_system_prompt(kind: str, locale: str) -> str:
    zh = _locale_is_zh(locale)
    if zh:
        hints = {
            "weight_loss": "根据身高体重与目标，生成减肥周计划：热量/运动要点、示例一日三餐、进度检查。非医疗建议。",
            "study": "根据年级与成绩生成自学计划：每周安排、薄弱科练习、阶段检测。",
            "road_trip": "生成自驾行程文案（按天、途经点、打包、提示）。仅文字行程，不含实时路况。",
            "pc_upgrade": "根据现有电脑配置与预算，给出升级/配件建议。注明价格会变动。",
            "seasonal_food": "按季节与地区给出一周青菜/水果/肉类参考及采购提示。",
            "outfit": "按气温/天气与场合给出穿搭建议：分层搭配与鞋履。",
            "day_trip": "生成半天或一天本地出行安排：时段行程、交通提示、餐饮、携带物品。不含实时预订。",
            "savings": "按收入、固定支出与攒钱目标生成本月预算与可砍项。非理财建议，不荐股。",
            "interview": "根据岗位说明与背景，生成可能面试题、经历故事骨架（STAR）与准备清单。不保证结果。",
            "family_meal": "按人数与忌口生成一周家庭菜单与采购清单，菜品要家常可做。",
        }
        task = hints.get(kind, "生成一份实用的中文计划。")
        example = (
            "输出示例（仅示意结构，请按用户输入改写）："
            '{"title":"三人口一周家常菜单","summary":"以家常快手菜为主，并附采购清单。",'
            '"sections":[{"heading":"周一","bullets":["早餐：白粥配鸡蛋","午餐：番茄炒蛋配米饭","晚餐：清炒时蔬"]}],'
            '"disclaimer":"仅供参考。","markdown":"# 三人口一周家常菜单\\n\\n…"}'
            "。禁止输出类似 English title：7-Day Family Meal Plan。"
        )
        return (
            "你是面向中国用户的生活计划助手。\n"
            f"任务：{task}\n"
            '顶层 JSON：{"title":"…","summary":"…","sections":[{"heading":"…","bullets":["…"]}],'
            '"disclaimer":"…","markdown":"…"}。只输出 JSON。\n'
            f"{example}\n"
            "【最后强调】title、summary、heading、bullets、disclaimer、markdown 必须全部是简体中文。"
        )

    lang = "Reply in English. Output valid JSON only, no markdown code fences."
    common = (
        f"{lang}\n"
        "You are a practical planning assistant for everyday life tools. "
        "Be specific and actionable. Include a short disclaimer that this is not professional medical, "
        "legal, or financial advice when relevant.\n"
        'Always use this top-level shape: {"title":"string","summary":"string","sections":[{"heading":"string","bullets":["string"]}],'
        '"disclaimer":"string","markdown":"string"}. '
        "Put a full readable markdown document in markdown (same content as sections)."
    )
    hints_en = {
        "weight_loss": "Create a weight-loss plan with weekly calorie/activity outline, sample day meals, and progress checks. Not medical advice.",
        "study": "Create a self-study plan from grade and scores: weekly schedule, weak-subject drills, checkpoint tests.",
        "road_trip": "Create a driving-trip itinerary (days, stops, packing, tips). Text itinerary only; no real-time traffic.",
        "pc_upgrade": "Suggest PC upgrade/accessory options from current specs and optional budget. Note prices change.",
        "seasonal_food": "Suggest a weekly produce/meat plan for the season and region. Practical shopping list.",
        "outfit": "Suggest outfits for the temperature/weather and optional occasion. List layers and footwear.",
        "day_trip": "Create a half-day or one-day local outing plan: timed stops, transport tips, food, packing. Not real-time booking.",
        "savings": "Create a monthly savings/budget outline from income, fixed costs, and a savings goal. Not financial advice; no investment picks.",
        "interview": "From a job description and background, produce likely interview questions, STAR story outlines, and prep checklist. Not a guarantee of outcomes.",
        "family_meal": "Create a 7-day family meal plan with simple dishes plus a grocery shopping list. Respect people count, allergies, and kitchen constraints.",
    }
    return common + "\nTask: " + hints_en.get(kind, "Create a helpful plan.")


def _plan_user_message(kind: str, locale: str, user_payload: dict) -> str:
    zh = _locale_is_zh(locale)
    payload = json.dumps(user_payload, ensure_ascii=False)
    if zh:
        return (
            f"请用简体中文生成 kind={kind} 的计划。locale={locale}。"
            "JSON 中所有面向用户的字符串必须是中文，不要用英文写菜名或标题。\n输入：\n"
            + payload
        )
    return (
        f"Generate the plan in English for kind={kind}. locale={locale}.\nInput JSON:\n"
        + payload
    )


def _normalize_plan(data: dict) -> dict:
    sections_in = data.get("sections") or []
    sections = []
    for sec in sections_in:
        if not isinstance(sec, dict):
            continue
        heading = str(sec.get("heading") or "").strip()
        bullets = sec.get("bullets") or []
        if isinstance(bullets, str):
            bullets = [bullets]
        clean = [str(b).strip() for b in bullets if str(b).strip()]
        if heading or clean:
            sections.append({"heading": heading or "—", "bullets": clean})
    markdown = str(data.get("markdown") or "").strip()
    if not markdown and sections:
        parts = [f"# {data.get('title') or 'Plan'}", "", str(data.get("summary") or "").strip(), ""]
        for sec in sections:
            parts.append(f"## {sec['heading']}")
            for b in sec["bullets"]:
                parts.append(f"- {b}")
            parts.append("")
        disc = str(data.get("disclaimer") or "").strip()
        if disc:
            parts.extend(["> " + disc, ""])
        markdown = "\n".join(parts).strip()
    return {
        "title": str(data.get("title") or "Plan").strip() or "Plan",
        "summary": str(data.get("summary") or "").strip(),
        "sections": sections,
        "disclaimer": str(data.get("disclaimer") or "").strip(),
        "markdown": markdown,
    }


def _clean_fields(fields: dict) -> dict:
    out: dict[str, Any] = {}
    for k, v in (fields or {}).items():
        key = str(k).strip()[:64]
        if not key:
            continue
        if isinstance(v, (int, float, bool)):
            out[key] = v
        elif v is None:
            continue
        else:
            s = str(v).strip()
            if s:
                out[key] = s[:2000]
    return out


@router.get("/status")
def life_plans_status(user: dict = Depends(_user)):
    return {
        "deepseekConfigured": deepseek_configured(),
        "tencentConfigured": tencent_configured(),
        "isAdmin": _is_admin(user),
        "quotas": {
            "life_plan": _peek_quota(user, "life_plan"),
            "drug_label": _peek_quota(user, "drug_label"),
        },
        "kinds": sorted(PLAN_KINDS),
    }


@router.post("/generate")
async def life_plans_generate(body: PlanGenerateBody, user: dict = Depends(_user)):
    if not deepseek_configured():
        raise HTTPException(
            status_code=503,
            detail="DeepSeek is not configured (DEEPSEEK_API_KEY).",
        )
    kind = (body.kind or "").strip()
    if kind not in PLAN_KINDS:
        raise HTTPException(status_code=400, detail="Invalid plan kind")
    fields = _clean_fields(body.fields)
    if not fields:
        raise HTTPException(status_code=400, detail="Please fill in the form fields")

    weather = None
    if kind == "outfit":
        city = str(fields.get("city") or "").strip()
        if city and fields.get("temperature_c") in (None, ""):
            weather = await _fetch_temperature(city)
            if weather:
                fields["resolved_temperature_c"] = weather["temperature_c"]
                fields["resolved_city"] = weather["city"]
        if kind == "outfit" and not fields.get("temperature_c") and not fields.get("resolved_temperature_c"):
            if not city:
                raise HTTPException(
                    status_code=400,
                    detail="Provide a city or temperature for outfit advice",
                )

    if kind == "seasonal_food" and not fields.get("season"):
        fields["season"] = _current_season()

    quota = _consume_quota(user, "life_plan")
    locale = _resolve_plan_locale(body.locale or "zh-CN", fields)
    user_payload = {
        "kind": kind,
        "locale": locale,
        "fields": fields,
        "weather": weather,
    }
    messages = [
        {"role": "system", "content": _plan_system_prompt(kind, locale)},
        {
            "role": "user",
            "content": _plan_user_message(kind, locale, user_payload),
        },
    ]
    try:
        raw = await _call_deepseek(
            messages,
            use_json_mode=True,
            max_tokens=3500,
            temperature=0.35 if _locale_is_zh(locale) else 0.55,
            timeout=90.0,
        )
        parsed = _extract_json(raw)
        plan = _normalize_plan(parsed)
        if _locale_is_zh(locale) and _plan_looks_mostly_english(plan):
            retry_messages = messages + [
                {
                    "role": "user",
                    "content": (
                        "上一次结果几乎全是英文，不合格。请重新输出，"
                        "title/summary/sections/disclaimer/markdown 必须全部是简体中文。"
                    ),
                }
            ]
            raw2 = await _call_deepseek(
                retry_messages,
                use_json_mode=True,
                max_tokens=3500,
                temperature=0.2,
                timeout=90.0,
            )
            plan = _normalize_plan(_extract_json(raw2))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Plan generation failed: {exc}") from exc

    return {
        "success": True,
        "kind": kind,
        "plan": plan,
        "meta": {"weather": weather, "fields": fields, "locale": locale},
        "quota": quota,
    }


DRUG_SCHEMA = """
Return ONLY valid JSON:
{
  "drug_name": "string",
  "common_name": "string",
  "sections": [
    {"heading": "用法用量|注意事项|禁忌|不良反应|贮藏|其他", "body": "plain text large-print friendly"}
  ],
  "disclaimer": "string",
  "large_print_text": "full plain text for large-print view"
}
"""


@router.post("/drug-label")
async def life_plans_drug_label(
    file: UploadFile = File(...),
    locale: str = "zh-CN",
    user: dict = Depends(_user),
):
    if not tencent_configured():
        raise HTTPException(
            status_code=503,
            detail="Tencent Cloud is not configured (TENCENT_SECRET_ID / TENCENT_SECRET_KEY).",
        )
    if not deepseek_configured():
        raise HTTPException(
            status_code=503,
            detail="DeepSeek is not configured (DEEPSEEK_API_KEY).",
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=400, detail="Image is too large (max 8MB)")
    ctype = (file.content_type or "").lower()
    if ctype and not ctype.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")

    quota = _consume_quota(user, "drug_label")
    try:
        ocr_text = ocr_general_text(data)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OCR failed: {exc}") from exc

    if not (ocr_text or "").strip():
        raise HTTPException(status_code=400, detail="No text detected in image")

    zh = _locale_is_zh(locale)
    sys = (
        "你是药品说明书整理助手。根据 OCR 文本提取关键信息，改写成老年人易读的大字版短句。"
        "不要编造 OCR 中没有的用法或剂量。不做诊断。只输出 JSON。"
        if zh
        else "You reformat drug leaflet OCR into large-print friendly sections. "
        "Do not invent dosages not present in OCR. No diagnosis. JSON only."
    )
    messages = [
        {"role": "system", "content": sys + "\n" + DRUG_SCHEMA},
        {
            "role": "user",
            "content": "OCR text:\n" + ocr_text[:12000],
        },
    ]
    try:
        raw = await _call_deepseek(
            messages,
            use_json_mode=True,
            max_tokens=2800,
            temperature=0.2,
            timeout=90.0,
        )
        parsed = _extract_json(raw)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Structuring failed: {exc}") from exc

    sections = []
    for sec in parsed.get("sections") or []:
        if isinstance(sec, dict):
            heading = str(sec.get("heading") or "").strip()
            body = str(sec.get("body") or "").strip()
            if heading or body:
                sections.append({"heading": heading or "—", "body": body})
    large = str(parsed.get("large_print_text") or "").strip()
    if not large:
        parts = []
        name = str(parsed.get("drug_name") or "").strip()
        if name:
            parts.append(name)
        for sec in sections:
            parts.append(sec["heading"])
            parts.append(sec["body"])
        large = "\n\n".join(p for p in parts if p)

    return {
        "success": True,
        "ocrText": ocr_text,
        "label": {
            "drug_name": str(parsed.get("drug_name") or "").strip(),
            "common_name": str(parsed.get("common_name") or "").strip(),
            "sections": sections,
            "disclaimer": str(parsed.get("disclaimer") or "").strip(),
            "large_print_text": large,
        },
        "quota": quota,
    }
