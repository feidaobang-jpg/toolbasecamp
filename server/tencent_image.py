"""Tencent Cloud OCR / BDA helpers for image tools."""

from __future__ import annotations

import base64
import os
from typing import Any, Optional

from fastapi import HTTPException


def tencent_configured() -> bool:
    return bool(
        (os.environ.get("TENCENT_SECRET_ID") or "").strip()
        and (os.environ.get("TENCENT_SECRET_KEY") or "").strip()
    )


def _region() -> str:
    return (os.environ.get("TENCENT_REGION") or "ap-guangzhou").strip()


def _cred():
    from tencentcloud.common import credential

    sid = (os.environ.get("TENCENT_SECRET_ID") or "").strip()
    skey = (os.environ.get("TENCENT_SECRET_KEY") or "").strip()
    if not sid or not skey:
        raise HTTPException(
            status_code=503,
            detail="Tencent Cloud is not configured (TENCENT_SECRET_ID / TENCENT_SECRET_KEY).",
        )
    return credential.Credential(sid, skey)


def _ocr_client():
    from tencentcloud.common.profile.client_profile import ClientProfile
    from tencentcloud.common.profile.http_profile import HttpProfile
    from tencentcloud.ocr.v20181119 import ocr_client

    http_profile = HttpProfile(endpoint="ocr.tencentcloudapi.com", reqTimeout=60)
    client_profile = ClientProfile(httpProfile=http_profile, signMethod="TC3-HMAC-SHA256")
    return ocr_client.OcrClient(_cred(), _region(), client_profile)


def _bda_client():
    from tencentcloud.common.profile.client_profile import ClientProfile
    from tencentcloud.common.profile.http_profile import HttpProfile
    from tencentcloud.bda.v20200324 import bda_client

    http_profile = HttpProfile(endpoint="bda.tencentcloudapi.com", reqTimeout=60)
    client_profile = ClientProfile(httpProfile=http_profile, signMethod="TC3-HMAC-SHA256")
    return bda_client.BdaClient(_cred(), _region(), client_profile)


def _b64(data: bytes) -> str:
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image is too large (max 8MB)")
    return base64.b64encode(data).decode("ascii")


def ocr_general_text(image_bytes: bytes) -> str:
    from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
    from tencentcloud.ocr.v20181119 import models

    client = _ocr_client()
    req = models.GeneralAccurateOCRRequest()
    req.ImageBase64 = _b64(image_bytes)
    try:
        resp = client.GeneralAccurateOCR(req)
    except TencentCloudSDKException as exc:
        raise HTTPException(status_code=502, detail=_map_tencent_error(exc)) from exc
    detections = getattr(resp, "TextDetections", None) or []
    if not detections:
        return ""
    items = []
    for d in detections:
        poly = getattr(d, "ItemPolygon", None)
        y = getattr(poly, "Y", 0) if poly else 0
        x = getattr(poly, "X", 0) if poly else 0
        items.append((y, x, getattr(d, "DetectedText", "") or ""))
    items.sort(key=lambda t: (t[0] // 12, t[1]))
    return "\n".join(t[2] for t in items if t[2])


def ocr_table(image_bytes: bytes) -> dict:
    from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
    from tencentcloud.ocr.v20181119 import models

    client = _ocr_client()
    req = models.RecognizeTableAccurateOCRRequest()
    req.ImageBase64 = _b64(image_bytes)
    try:
        resp = client.RecognizeTableAccurateOCR(req)
    except TencentCloudSDKException as exc:
        raise HTTPException(status_code=502, detail=_map_tencent_error(exc)) from exc

    tables = []
    for td in getattr(resp, "TableDetections", None) or []:
        cells = []
        for c in getattr(td, "Cells", None) or []:
            cells.append(
                {
                    "row": int(getattr(c, "RowTl", 0) or 0),
                    "col": int(getattr(c, "ColTl", 0) or 0),
                    "rowSpan": int(getattr(c, "RowSpan", 1) or 1),
                    "colSpan": int(getattr(c, "ColSpan", 1) or 1),
                    "text": getattr(c, "Text", "") or "",
                }
            )
        tables.append({"cells": cells})
    return {"tables": tables, "tsv": _tables_to_tsv(tables)}


def _tables_to_tsv(tables: list) -> str:
    chunks = []
    for ti, table in enumerate(tables):
        grid: dict[tuple[int, int], str] = {}
        max_r = max_c = 0
        for c in table.get("cells") or []:
            r, col = c["row"], c["col"]
            grid[(r, col)] = c.get("text") or ""
            max_r = max(max_r, r)
            max_c = max(max_c, col)
        lines = []
        for r in range(max_r + 1):
            row = [grid.get((r, c), "") for c in range(max_c + 1)]
            lines.append("\t".join(row))
        chunks.append(f"# table {ti + 1}\n" + "\n".join(lines))
    return "\n\n".join(chunks)


def image_enhancement(image_bytes: bytes, task_type: int) -> bytes:
    from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
    from tencentcloud.ocr.v20181119 import models

    client = _ocr_client()
    req = models.ImageEnhancementRequest()
    req.ImageBase64 = _b64(image_bytes)
    req.TaskType = int(task_type)
    req.ReturnImage = "preprocess"
    try:
        resp = client.ImageEnhancement(req)
    except TencentCloudSDKException as exc:
        raise HTTPException(status_code=502, detail=_map_tencent_error(exc)) from exc
    img_b64 = getattr(resp, "Image", None) or ""
    if not img_b64:
        raise HTTPException(status_code=502, detail="Enhancement returned empty image")
    try:
        return base64.b64decode(img_b64)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Invalid enhancement image data") from exc


def segment_portrait(image_bytes: bytes) -> bytes:
    from tencentcloud.bda.v20200324 import models
    from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException

    if len(image_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image is too large for portrait segment (max 5MB)")
    client = _bda_client()
    req = models.SegmentPortraitPicRequest()
    req.Image = _b64(image_bytes)
    try:
        resp = client.SegmentPortraitPic(req)
    except TencentCloudSDKException as exc:
        raise HTTPException(status_code=502, detail=_map_tencent_error(exc)) from exc
    img_b64 = getattr(resp, "ResultImage", None) or ""
    if not img_b64:
        raise HTTPException(status_code=502, detail="Portrait segment returned empty image")
    try:
        return base64.b64decode(img_b64)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Invalid segment image data") from exc


def _map_tencent_error(exc: Any) -> str:
    code = getattr(exc, "code", "") or ""
    msg = getattr(exc, "message", "") or str(exc)
    mapping = {
        "FailedOperation.ImageNoText": "No text detected in image",
        "FailedOperation.ImageDecodeFailed": "Image decode failed",
        "LimitExceeded.TooLargeFileError": "Image content is too large",
        "ResourceUnavailable.InArrears": "Tencent Cloud account is in arrears",
        "FailedOperation.UnOpenError": "Tencent Cloud service is not enabled",
        "UnauthorizedOperation": "Tencent Cloud credentials unauthorized",
        "AuthFailure.SecretIdNotFound": "Invalid TENCENT_SECRET_ID",
        "AuthFailure.SignatureFailure": "Invalid TENCENT_SECRET_KEY",
    }
    return mapping.get(code, msg or "Tencent Cloud request failed")


def images_to_pdf_bytes(image_list: list[bytes]) -> bytes:
    """Build a multi-page PDF from image bytes (JPEG/PNG/WebP)."""
    from io import BytesIO

    from PIL import Image

    if not image_list:
        raise HTTPException(status_code=400, detail="No images")
    pages = []
    for raw in image_list:
        try:
            im = Image.open(BytesIO(raw))
            im.load()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid image file") from exc
        if im.mode in ("RGBA", "P"):
            bg = Image.new("RGB", im.size, (255, 255, 255))
            if im.mode == "P":
                im = im.convert("RGBA")
            bg.paste(im, mask=im.split()[-1] if im.mode == "RGBA" else None)
            im = bg
        elif im.mode != "RGB":
            im = im.convert("RGB")
        pages.append(im)
    out = BytesIO()
    first, rest = pages[0], pages[1:]
    first.save(out, format="PDF", save_all=bool(rest), append_images=rest, resolution=150.0)
    return out.getvalue()
