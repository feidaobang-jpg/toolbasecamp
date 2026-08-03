"""Cloud image tools: OCR, enhance, ID photo segment, advanced images→PDF."""

from __future__ import annotations

import asyncio
import base64
import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from tencent_image import (
    image_enhancement,
    images_to_pdf_bytes,
    ocr_general_text,
    ocr_table,
    segment_portrait,
    tencent_configured,
)
from dashscope_image_edit import (
    QWEN_IMAGE_EDIT_MODEL,
    dashscope_image_edit_configured,
    edit_image_with_instruction,
    generate_image_from_text,
    resolve_edit_prompt,
)

# Instruct-edit model menu (Beijing). Order = UI recommendation. Prices indicative.
INSTRUCT_EDIT_MODELS = (
    {
        "id": "wan2.6-image",
        "priceCny": 0.2,
        "labelKey": "tools.instructEdit.modelWan26",
        "default": True,
    },
    {
        "id": "wan2.7-image",
        "priceCny": 0.3,
        "labelKey": "tools.instructEdit.modelWan27",
    },
    {
        "id": "wan2.7-image-pro",
        "priceCny": 0.6,
        "labelKey": "tools.instructEdit.modelWan27pro",
    },
    {
        "id": "qwen-image-2.0",
        "priceCny": 0.2,
        "labelKey": "tools.instructEdit.model20",
    },
    {
        "id": "qwen-image-2.0-pro",
        "priceCny": 0.5,
        "labelKey": "tools.instructEdit.model20pro",
    },
)
INSTRUCT_EDIT_MODEL_IDS = {m["id"] for m in INSTRUCT_EDIT_MODELS}
INSTRUCT_COMPARE_MODELS = ("wan2.6-image", "qwen-image-2.0")
MAX_INSTRUCT_BATCH = 4
INSTRUCT_EDIT_GAP_SEC = float(os.environ.get("IMAGE_EDIT_GAP_SEC", "0.6"))
INSTRUCT_EDIT_RATE_RETRIES = int(os.environ.get("IMAGE_EDIT_RATE_RETRIES", "4"))
INSTRUCT_EDIT_RATE_BACKOFF = float(os.environ.get("IMAGE_EDIT_RATE_BACKOFF", "2.5"))

# Text-to-image models (Beijing). z-image-turbo = cheap/fast default.
TEXT_TO_IMAGE_MODELS = (
    {
        "id": "z-image-turbo",
        "priceCny": 0.04,
        "labelKey": "tools.textToImage.modelZTurbo",
        "default": True,
    },
    {
        "id": "wan2.7-image",
        "priceCny": 0.3,
        "labelKey": "tools.textToImage.modelWan27",
    },
    {
        "id": "wan2.7-image-pro",
        "priceCny": 0.6,
        "labelKey": "tools.textToImage.modelWan27pro",
    },
    {
        "id": "qwen-image-2.0",
        "priceCny": 0.2,
        "labelKey": "tools.textToImage.model20",
    },
)
TEXT_TO_IMAGE_MODEL_IDS = {m["id"] for m in TEXT_TO_IMAGE_MODELS}

try:
    from general_cutout import rembg_available, segment_general
except Exception as exc:  # pragma: no cover — keep image tools up if rembg stack breaks
    print(f"[general_cutout] import failed: {exc}")

    def rembg_available() -> bool:
        return False

    def segment_general(image_bytes: bytes) -> bytes:
        raise HTTPException(
            status_code=503,
            detail="General cutout is not available (rembg not installed).",
        )

security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/image", tags=["image"])

MAX_UPLOAD = 8 * 1024 * 1024
MAX_IMAGES_PDF = 12

# Daily per-user limits (login required). Admins (role=admin or ADMIN_EMAIL) are exempt.
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@toolbasecamp.com").lower()
LIMITS = {
    "ocr_text": int(os.environ.get("IMAGE_LIMIT_OCR_TEXT", "30")),
    "ocr_table": int(os.environ.get("IMAGE_LIMIT_OCR_TABLE", "20")),
    "enhance": int(os.environ.get("IMAGE_LIMIT_ENHANCE", "20")),
    "id_photo": int(os.environ.get("IMAGE_LIMIT_ID_PHOTO", "10")),
    "general_cutout": int(os.environ.get("IMAGE_LIMIT_GENERAL_CUTOUT", "15")),
    "to_pdf": int(os.environ.get("IMAGE_LIMIT_TO_PDF", "20")),
    "instruct_edit": int(os.environ.get("IMAGE_LIMIT_INSTRUCT_EDIT", "8")),
    "text_to_image": int(os.environ.get("IMAGE_LIMIT_TEXT_TO_IMAGE", "10")),
}


def _is_admin(user: dict) -> bool:
    return user.get("role") == "admin" or (user.get("email") or "").lower() == ADMIN_EMAIL


def _unlimited_quota() -> dict:
    return {"used": 0, "limit": 0, "remaining": 0, "unlimited": True}

ENHANCE_TASKS = {
    1: "cutEnhance",
    2: "curvatureCorrection",
    202: "blackAndWhite",
    204: "brightenMode",
    205: "grayScale",
    207: "inkSaving",
    208: "textSharpening",
    301: "removeMoire",
    302: "removeShadow",
    303: "removeBlur",
    304: "removeOverexposure",
}


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


def ensure_image_quota_table(cur):
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


def _consume_quota(user: dict, action: str, amount: int = 1) -> dict:
    if amount < 1:
        amount = 1
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
            ensure_image_quota_table(cur)
            cur.execute(
                """
                SELECT usage_count FROM image_tool_quotas
                WHERE user_id=%s AND action_type=%s AND usage_date=%s
                """,
                (user_id, action, today),
            )
            row = cur.fetchone()
            current = int(row["usage_count"]) if row else 0
            if current + amount > max_count:
                raise HTTPException(
                    status_code=429,
                    detail="Daily limit reached. Please try again tomorrow.",
                )
            if row:
                cur.execute(
                    """
                    UPDATE image_tool_quotas SET usage_count = usage_count + %s
                    WHERE user_id=%s AND action_type=%s AND usage_date=%s
                    """,
                    (amount, user_id, action, today),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO image_tool_quotas (user_id, action_type, usage_date, usage_count)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (user_id, action, today, amount),
                )
            used = current + amount
        return {"used": used, "limit": max_count, "remaining": max(0, max_count - used)}
    finally:
        conn.close()


async def _read_upload(file: UploadFile) -> bytes:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=400, detail="Image is too large (max 8MB)")
    ctype = (file.content_type or "").lower()
    if ctype and not ctype.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")
    return data


def _require_tencent():
    if not tencent_configured():
        raise HTTPException(
            status_code=503,
            detail="Tencent Cloud is not configured (TENCENT_SECRET_ID / TENCENT_SECRET_KEY).",
        )


class QuotaItem(BaseModel):
    action: str
    used: int
    limit: int
    remaining: int


@router.get("/status")
def image_status(user: dict = Depends(_user)):
    admin = _is_admin(user)
    if admin:
        items = [
            {"action": action, "used": 0, "limit": 0, "remaining": 0, "unlimited": True}
            for action in LIMITS
        ]
        return {
            "tencentConfigured": tencent_configured(),
            "generalCutoutAvailable": rembg_available(),
            "instructEditConfigured": dashscope_image_edit_configured(),
            "instructEditModels": list(INSTRUCT_EDIT_MODELS),
            "instructEditPresets": [
                {"id": "manga_to_real", "labelKey": "tools.instructEdit.presetMangaToReal"},
                {"id": "real_to_manga", "labelKey": "tools.instructEdit.presetRealToManga"},
            ],
            "instructEditMaxBatch": MAX_INSTRUCT_BATCH,
            "textToImageConfigured": dashscope_image_edit_configured(),
            "textToImageModels": list(TEXT_TO_IMAGE_MODELS),
            "isAdmin": True,
            "quotas": items,
            "enhanceTasks": [
                {"taskType": k, "id": v} for k, v in sorted(ENHANCE_TASKS.items())
            ],
        }
    today = _today()
    conn = _conn()
    try:
        with conn.cursor() as cur:
            ensure_image_quota_table(cur)
            cur.execute(
                """
                SELECT action_type, usage_count FROM image_tool_quotas
                WHERE user_id=%s AND usage_date=%s
                """,
                (user["id"], today),
            )
            rows = {r["action_type"]: int(r["usage_count"]) for r in (cur.fetchall() or [])}
        items = []
        for action, limit in LIMITS.items():
            used = rows.get(action, 0)
            items.append(
                {
                    "action": action,
                    "used": used,
                    "limit": limit,
                    "remaining": max(0, limit - used),
                }
            )
        return {
            "tencentConfigured": tencent_configured(),
            "generalCutoutAvailable": rembg_available(),
            "instructEditConfigured": dashscope_image_edit_configured(),
            "instructEditModels": list(INSTRUCT_EDIT_MODELS),
            "instructEditPresets": [
                {"id": "manga_to_real", "labelKey": "tools.instructEdit.presetMangaToReal"},
                {"id": "real_to_manga", "labelKey": "tools.instructEdit.presetRealToManga"},
            ],
            "instructEditMaxBatch": MAX_INSTRUCT_BATCH,
            "textToImageConfigured": dashscope_image_edit_configured(),
            "textToImageModels": list(TEXT_TO_IMAGE_MODELS),
            "isAdmin": False,
            "quotas": items,
            "enhanceTasks": [
                {"taskType": k, "id": v} for k, v in sorted(ENHANCE_TASKS.items())
            ],
        }
    finally:
        conn.close()


@router.post("/ocr-text")
async def api_ocr_text(
    file: UploadFile = File(...),
    user: dict = Depends(_user),
):
    _require_tencent()
    quota = _consume_quota(user, "ocr_text")
    data = await _read_upload(file)
    text = ocr_general_text(data)
    return {"text": text, "quota": quota}


@router.post("/ocr-table")
async def api_ocr_table(
    file: UploadFile = File(...),
    user: dict = Depends(_user),
):
    _require_tencent()
    quota = _consume_quota(user, "ocr_table")
    data = await _read_upload(file)
    result = ocr_table(data)
    result["quota"] = quota
    return result


@router.post("/enhance")
async def api_enhance(
    file: UploadFile = File(...),
    task_type: int = Form(...),
    user: dict = Depends(_user),
):
    _require_tencent()
    if int(task_type) not in ENHANCE_TASKS:
        raise HTTPException(status_code=400, detail="Invalid enhance task type")
    quota = _consume_quota(user, "enhance")
    data = await _read_upload(file)
    out = image_enhancement(data, int(task_type))
    return {
        "imageBase64": base64.b64encode(out).decode("ascii"),
        "contentType": "image/png",
        "quota": quota,
        "taskType": int(task_type),
    }


@router.post("/id-photo/segment")
async def api_id_photo_segment(
    file: UploadFile = File(...),
    user: dict = Depends(_user),
):
    _require_tencent()
    quota = _consume_quota(user, "id_photo")
    data = await _read_upload(file)
    out = segment_portrait(data)
    return {
        "imageBase64": base64.b64encode(out).decode("ascii"),
        "contentType": "image/png",
        "quota": quota,
    }


@router.post("/general-cutout/segment")
async def api_general_cutout_segment(
    file: UploadFile = File(...),
    user: dict = Depends(_user),
):
    if not rembg_available():
        raise HTTPException(
            status_code=503,
            detail="General cutout is not available (rembg not installed).",
        )
    quota = _consume_quota(user, "general_cutout")
    data = await _read_upload(file)
    out = segment_general(data)
    return {
        "imageBase64": base64.b64encode(out).decode("ascii"),
        "contentType": "image/png",
        "quota": quota,
    }


def _resolve_instruct_models(
    model: Optional[str],
    models: Optional[List[str]],
    compare: bool,
) -> list[str]:
    raw: list[str] = []
    if models:
        for item in models:
            if not item:
                continue
            for part in str(item).replace(";", ",").split(","):
                p = part.strip()
                if p:
                    raw.append(p)
    if not raw and compare:
        raw = list(INSTRUCT_COMPARE_MODELS)
    if not raw and model:
        raw = [(model or "").strip()]
    if not raw:
        raw = [(QWEN_IMAGE_EDIT_MODEL or "qwen-image-2.0").strip()]
    out: list[str] = []
    seen: set[str] = set()
    for mid in raw:
        if mid not in INSTRUCT_EDIT_MODEL_IDS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported model '{mid}'. Use one of: {', '.join(sorted(INSTRUCT_EDIT_MODEL_IDS))}",
            )
        if mid in seen:
            continue
        seen.add(mid)
        out.append(mid)
    return out


def _price_for(model_id: str) -> float:
    for m in INSTRUCT_EDIT_MODELS:
        if m["id"] == model_id:
            return float(m["priceCny"])
    return 0.0


def _exc_detail(exc: BaseException) -> str:
    detail = getattr(exc, "detail", None)
    if detail is None:
        return str(exc)
    return str(detail)


@router.post("/instruct-edit")
async def api_instruct_edit(
    prompt: str = Form(""),
    preset: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    models: List[str] = Form(default=[]),
    compare: str = Form("0"),
    file: Optional[UploadFile] = File(None),
    files: List[UploadFile] = File(default=[]),
    user: dict = Depends(_user),
):
    if not dashscope_image_edit_configured():
        raise HTTPException(
            status_code=503,
            detail="DashScope is not configured (DASHSCOPE_API_KEY).",
        )
    text = resolve_edit_prompt(prompt, preset)
    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="Please enter an edit instruction or choose a style preset.",
        )
    uploads: list[UploadFile] = []
    if files:
        uploads.extend([f for f in files if f is not None and getattr(f, "filename", None)])
    if file is not None and getattr(file, "filename", None):
        uploads.append(file)
    if not uploads:
        raise HTTPException(status_code=400, detail="No images")
    if len(uploads) > MAX_INSTRUCT_BATCH:
        raise HTTPException(
            status_code=400,
            detail=f"Too many images (max {MAX_INSTRUCT_BATCH})",
        )

    do_compare = str(compare or "").strip().lower() in ("1", "true", "yes", "on")
    model_ids = _resolve_instruct_models(model, models, do_compare)
    blobs: list[bytes] = []
    for up in uploads:
        blobs.append(await _read_upload(up))

    amount = len(blobs) * len(model_ids)
    quota = _consume_quota(user, "instruct_edit", amount=amount)
    est_price = round(sum(_price_for(m) for m in model_ids) * len(blobs), 2)

    def _is_rate_limit(exc: BaseException) -> bool:
        detail = _exc_detail(exc).lower()
        return (
            "rate limit" in detail
            or "throttl" in detail
            or "too many request" in detail
            or "timed out" in detail
            or "timeout" in detail
        )

    async def _one(idx: int, blob: bytes, mid: str) -> dict:
        out, ctype = await edit_image_with_instruction(blob, text, model=mid)
        return {
            "index": idx,
            "model": mid,
            "priceCny": _price_for(mid),
            "imageBase64": base64.b64encode(out).decode("ascii"),
            "contentType": ctype or "image/png",
        }

    async def _one_with_retry(idx: int, blob: bytes, mid: str) -> dict:
        last: Optional[BaseException] = None
        for attempt in range(INSTRUCT_EDIT_RATE_RETRIES + 1):
            try:
                return await _one(idx, blob, mid)
            except HTTPException as exc:
                last = exc
                if _is_rate_limit(exc) and attempt < INSTRUCT_EDIT_RATE_RETRIES:
                    await asyncio.sleep(INSTRUCT_EDIT_RATE_BACKOFF * (attempt + 1))
                    continue
                raise
            except Exception as exc:
                last = exc
                if _is_rate_limit(exc) and attempt < INSTRUCT_EDIT_RATE_RETRIES:
                    await asyncio.sleep(INSTRUCT_EDIT_RATE_BACKOFF * (attempt + 1))
                    continue
                raise
        assert last is not None
        raise last

    # Serial calls + gap to avoid DashScope rate limits on multi image × multi model.
    images: list[dict] = []
    errors: list[str] = []
    first_job = True
    for i, blob in enumerate(blobs):
        for mid in model_ids:
            if not first_job and INSTRUCT_EDIT_GAP_SEC > 0:
                await asyncio.sleep(INSTRUCT_EDIT_GAP_SEC)
            first_job = False
            try:
                images.append(await _one_with_retry(i, blob, mid))
            except Exception as exc:
                errors.append(f"{mid}#{i + 1}: {_exc_detail(exc)}")
    if not images:
        raise HTTPException(
            status_code=502,
            detail="Image edit failed: " + "; ".join(errors) if errors else "no images",
        )
    order = {m: i for i, m in enumerate(model_ids)}
    images.sort(key=lambda x: (int(x.get("index") or 0), order.get(x.get("model") or "", 99)))
    first = images[0]
    out = {
        "model": first["model"],
        "models": model_ids,
        "priceCny": first["priceCny"],
        "estimatedPriceCny": est_price,
        "imageBase64": first["imageBase64"],
        "contentType": first["contentType"],
        "images": images,
        "quota": quota,
        "preset": (preset or "").strip() or None,
        "batch": len(blobs),
        "compare": len(model_ids) > 1,
    }
    if errors:
        out["partialErrors"] = errors
    return out


def _resolve_t2i_models(model: Optional[str], models: Optional[List[str]]) -> list[str]:
    raw: list[str] = []
    if models:
        for item in models:
            if not item:
                continue
            for part in str(item).replace(";", ",").split(","):
                p = part.strip()
                if p:
                    raw.append(p)
    if not raw and model:
        raw = [(model or "").strip()]
    if not raw:
        raw = ["z-image-turbo"]
    out: list[str] = []
    seen: set[str] = set()
    for mid in raw:
        if mid not in TEXT_TO_IMAGE_MODEL_IDS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported model '{mid}'. Use one of: {', '.join(sorted(TEXT_TO_IMAGE_MODEL_IDS))}",
            )
        if mid in seen:
            continue
        seen.add(mid)
        out.append(mid)
    return out


def _t2i_price_for(model_id: str) -> float:
    for m in TEXT_TO_IMAGE_MODELS:
        if m["id"] == model_id:
            return float(m["priceCny"])
    return 0.0


@router.post("/text-to-image")
async def api_text_to_image(
    prompt: str = Form(...),
    model: Optional[str] = Form(None),
    models: List[str] = Form(default=[]),
    size: str = Form("square"),
    user: dict = Depends(_user),
):
    if not dashscope_image_edit_configured():
        raise HTTPException(
            status_code=503,
            detail="DashScope is not configured (DASHSCOPE_API_KEY).",
        )
    text = (prompt or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Please enter a prompt.")
    model_ids = _resolve_t2i_models(model, models)
    size_preset = (size or "square").strip().lower() or "square"
    if size_preset not in ("square", "portrait", "landscape", "hd"):
        size_preset = "square"

    amount = len(model_ids)
    quota = _consume_quota(user, "text_to_image", amount=amount)
    est_price = round(sum(_t2i_price_for(m) for m in model_ids), 2)

    def _is_retryable(exc: BaseException) -> bool:
        detail = _exc_detail(exc).lower()
        return (
            "rate limit" in detail
            or "throttl" in detail
            or "too many request" in detail
            or "timed out" in detail
            or "timeout" in detail
        )

    async def _one(mid: str) -> dict:
        out, ctype = await generate_image_from_text(text, model=mid, size_preset=size_preset)
        return {
            "model": mid,
            "priceCny": _t2i_price_for(mid),
            "imageBase64": base64.b64encode(out).decode("ascii"),
            "contentType": ctype or "image/png",
        }

    async def _one_with_retry(mid: str) -> dict:
        last: Optional[BaseException] = None
        for attempt in range(INSTRUCT_EDIT_RATE_RETRIES + 1):
            try:
                return await _one(mid)
            except HTTPException as exc:
                last = exc
                if _is_retryable(exc) and attempt < INSTRUCT_EDIT_RATE_RETRIES:
                    await asyncio.sleep(INSTRUCT_EDIT_RATE_BACKOFF * (attempt + 1))
                    continue
                raise
            except Exception as exc:
                last = exc
                if _is_retryable(exc) and attempt < INSTRUCT_EDIT_RATE_RETRIES:
                    await asyncio.sleep(INSTRUCT_EDIT_RATE_BACKOFF * (attempt + 1))
                    continue
                raise
        assert last is not None
        raise last

    images: list[dict] = []
    errors: list[str] = []
    first_job = True
    for mid in model_ids:
        if not first_job and INSTRUCT_EDIT_GAP_SEC > 0:
            await asyncio.sleep(INSTRUCT_EDIT_GAP_SEC)
        first_job = False
        try:
            images.append(await _one_with_retry(mid))
        except Exception as exc:
            errors.append(f"{mid}: {_exc_detail(exc)}")
    if not images:
        raise HTTPException(
            status_code=502,
            detail="Image generation failed: " + "; ".join(errors) if errors else "no images",
        )
    order = {m: i for i, m in enumerate(model_ids)}
    images.sort(key=lambda x: order.get(x.get("model") or "", 99))
    first = images[0]
    out = {
        "model": first["model"],
        "models": model_ids,
        "priceCny": first["priceCny"],
        "estimatedPriceCny": est_price,
        "imageBase64": first["imageBase64"],
        "contentType": first["contentType"],
        "images": images,
        "quota": quota,
        "size": size_preset,
    }
    if errors:
        out["partialErrors"] = errors
    return out


@router.post("/to-pdf-advanced")
async def api_to_pdf_advanced(
    files: List[UploadFile] = File(...),
    remove_shadow: bool = Form(False),
    user: dict = Depends(_user),
):
    if not files:
        raise HTTPException(status_code=400, detail="No images")
    if len(files) > MAX_IMAGES_PDF:
        raise HTTPException(status_code=400, detail=f"Too many images (max {MAX_IMAGES_PDF})")
    if remove_shadow:
        _require_tencent()
    quota = _consume_quota(user, "to_pdf")
    images: list[bytes] = []
    for f in files:
        raw = await _read_upload(f)
        if remove_shadow:
            raw = image_enhancement(raw, 302)
        images.append(raw)
    pdf = images_to_pdf_bytes(images)
    headers = {
        "Content-Disposition": 'attachment; filename="images_advanced.pdf"',
        "X-Quota-Remaining": str(quota["remaining"]),
        "X-Quota-Limit": str(quota["limit"]),
    }
    return Response(content=pdf, media_type="application/pdf", headers=headers)
