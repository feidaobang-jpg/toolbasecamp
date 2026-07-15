"""Cloud image tools: OCR, enhance, ID photo segment, advanced images→PDF."""

from __future__ import annotations

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
    "to_pdf": int(os.environ.get("IMAGE_LIMIT_TO_PDF", "20")),
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
