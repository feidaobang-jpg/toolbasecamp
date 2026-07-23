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
            row_tl = int(getattr(c, "RowTl", 0) or 0)
            col_tl = int(getattr(c, "ColTl", 0) or 0)
            row_br = int(getattr(c, "RowBr", 0) or 0)
            col_br = int(getattr(c, "ColBr", 0) or 0)
            row_span = int(getattr(c, "RowSpan", 0) or 0)
            col_span = int(getattr(c, "ColSpan", 0) or 0)
            if row_br <= row_tl:
                row_br = row_tl + max(1, row_span or 1)
            if col_br <= col_tl:
                col_br = col_tl + max(1, col_span or 1)
            cells.append(
                {
                    "row": row_tl,
                    "col": col_tl,
                    "rowEnd": row_br,
                    "colEnd": col_br,
                    "rowSpan": max(1, row_br - row_tl),
                    "colSpan": max(1, col_br - col_tl),
                    "text": (getattr(c, "Text", "") or "").strip(),
                }
            )
        tables.append({"cells": cells})

    excel_b64 = getattr(resp, "Data", None) or ""
    tsv = ""
    if excel_b64:
        try:
            tsv = _excel_b64_to_tsv(excel_b64)
        except Exception:
            tsv = ""
    if not (tsv or "").strip():
        tsv = _tables_to_tsv(tables)
    tsv = _cleanup_table_tsv(tsv)
    out: dict[str, Any] = {"tables": tables, "tsv": tsv}
    if excel_b64:
        out["excelBase64"] = excel_b64
    return out


def _excel_b64_to_tsv(b64: str) -> str:
    """Parse Tencent Excel payload into TSV without requiring openpyxl."""
    import io
    import re
    import zipfile
    import xml.etree.ElementTree as ET

    raw = base64.b64decode(b64)
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    shared: list[str] = []
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", ns):
                texts = [
                    (n.text or "")
                    for n in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
                ]
                shared.append("".join(texts))
        sheet_path = next(
            (n for n in zf.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")),
            None,
        )
        if not sheet_path:
            return ""
        root = ET.fromstring(zf.read(sheet_path))

    cell_map: dict[tuple[int, int], str] = {}
    max_r = max_c = -1
    for c in root.findall(".//m:c", ns):
        ref = c.get("r") or ""
        m = re.fullmatch(r"([A-Z]+)(\d+)", ref)
        if not m:
            continue
        col = _excel_col_to_index(m.group(1))
        row = int(m.group(2)) - 1
        val = ""
        v = c.find("m:v", ns)
        if v is not None and v.text is not None:
            if c.get("t") == "s":
                try:
                    val = shared[int(v.text)]
                except (ValueError, IndexError):
                    val = v.text
            else:
                val = v.text
        cell_map[(row, col)] = (val or "").strip()
        max_r = max(max_r, row)
        max_c = max(max_c, col)

    if max_r < 0:
        return ""
    lines = []
    for r in range(max_r + 1):
        lines.append("\t".join(cell_map.get((r, c), "") for c in range(max_c + 1)))
    return "\n".join(lines)


def _excel_col_to_index(letters: str) -> int:
    n = 0
    for ch in letters.upper():
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _index_to_excel_col(idx: int) -> str:
    n = idx + 1
    out = []
    while n:
        n, rem = divmod(n - 1, 26)
        out.append(chr(65 + rem))
    return "".join(reversed(out))


def _tables_to_tsv(tables: list) -> str:
    chunks = []
    for ti, table in enumerate(tables):
        cells = table.get("cells") or []
        if not cells:
            continue
        max_r = max(int(c.get("rowEnd", c.get("row", 0) + 1)) for c in cells)
        max_c = max(int(c.get("colEnd", c.get("col", 0) + 1)) for c in cells)
        grid = [["" for _ in range(max_c)] for _ in range(max_r)]
        for c in cells:
            text = (c.get("text") or "").strip()
            if not text:
                continue
            r0 = int(c.get("row", 0))
            c0 = int(c.get("col", 0))
            r1 = int(c.get("rowEnd", r0 + int(c.get("rowSpan", 1) or 1)))
            c1 = int(c.get("colEnd", c0 + int(c.get("colSpan", 1) or 1)))
            for r in range(max(0, r0), min(max_r, max(r0 + 1, r1))):
                for col in range(max(0, c0), min(max_c, max(c0 + 1, c1))):
                    # Prefer first non-empty fill for merged cells
                    if not grid[r][col]:
                        grid[r][col] = text
        lines = ["\t".join(row) for row in grid]
        body = "\n".join(lines).strip()
        if not body:
            continue
        if len(tables) > 1:
            chunks.append(f"# table {ti + 1}\n{body}")
        else:
            chunks.append(body)
    return "\n\n".join(chunks)


def _cleanup_table_tsv(tsv: str) -> str:
    """Drop empty edges and Excel sheet chrome (row numbers / column letters)."""
    import re

    if not (tsv or "").strip():
        return ""
    blocks = []
    for block in re.split(r"\n\n+", tsv.strip()):
        header = ""
        body = block
        if body.startswith("# table"):
            first, _, rest = body.partition("\n")
            header = first
            body = rest
        rows = [line.split("\t") for line in body.splitlines() if line.strip() or line == ""]
        # Drop fully empty trailing/leading rows
        while rows and all(not (c or "").strip() for c in rows[0]):
            rows.pop(0)
        while rows and all(not (c or "").strip() for c in rows[-1]):
            rows.pop()
        if not rows:
            continue
        # Normalize width
        width = max(len(r) for r in rows)
        rows = [r + [""] * (width - len(r)) for r in rows]
        # Drop trailing empty columns
        while width > 0 and all(not (r[width - 1] or "").strip() for r in rows):
            width -= 1
            rows = [r[:width] for r in rows]
        if not rows or width <= 0:
            continue

        # Drop Excel-like column letter header (A B C D...)
        first = [((c or "").strip()) for c in rows[0]]
        nonempty = [c for c in first if c]
        if len(nonempty) >= 2 and all(re.fullmatch(r"[A-Za-z]{1,3}", c or "") for c in nonempty):
            expected = [_index_to_excel_col(i) for i in range(len(nonempty))]
            if [c.upper() for c in nonempty] == expected:
                # If first cell is junk like "4" before letters, still treat as header row
                rows = rows[1:]

        elif len(first) >= 3 and re.fullmatch(r"\d+", first[0] or ""):
            # Header like "4 A B C D" — drop row-number chrome + letter header
            letters = first[1:]
            nonempty = [c for c in letters if c]
            if len(nonempty) >= 2 and all(re.fullmatch(r"[A-Za-z]{1,3}", c) for c in nonempty):
                expected = [_index_to_excel_col(i) for i in range(len(nonempty))]
                if [c.upper() for c in nonempty] == expected:
                    rows = rows[1:]
                    # and drop first column below
                    rows = [r[1:] for r in rows]

        if not rows:
            continue

        # Drop leading column of consecutive row numbers (1,2,3...)
        first_col = [((r[0] or "").strip()) for r in rows]
        numeric = [c for c in first_col if c]
        if len(numeric) >= 2 and all(re.fullmatch(r"\d+", c) for c in numeric):
            nums = [int(c) for c in numeric]
            if nums == list(range(nums[0], nums[0] + len(nums))):
                rows = [r[1:] for r in rows]

        # Drop trailing empty columns again
        width = max((len(r) for r in rows), default=0)
        while width > 0 and all(len(r) <= width - 1 or not (r[width - 1] or "").strip() for r in rows):
            width -= 1
            rows = [r[:width] for r in rows]

        # Drop rows that are completely empty after cleanup
        rows = [r for r in rows if any((c or "").strip() for c in r)]
        if not rows:
            continue
        body = "\n".join("\t".join(r) for r in rows)
        # Keep multi-table markers only when useful; single table is paste-ready.
        blocks.append(body if not header else f"{header}\n{body}".strip())
    if len(blocks) == 1 and blocks[0].startswith("# table"):
        _, _, rest = blocks[0].partition("\n")
        return rest.strip()
    return "\n\n".join(blocks)


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


def _map_tencent_error(exc: Any) -> str:
    code = getattr(exc, "code", "") or ""
    msg = getattr(exc, "message", "") or str(exc)
    mapping = {
        "FailedOperation.ImageNoText": "No text detected in image",
        "FailedOperation.ImageDecodeFailed": "Image decode failed",
        "FailedOperation.ImageDownloadError": "Image download failed",
        "FailedOperation.ImageFacedetectFailed": "No portrait subject detected",
        "FailedOperation.ImageNotSupported": "Unsupported image format",
        "FailedOperation.ImageResolutionExceed": "Image resolution is too large",
        "FailedOperation.ImageResolutionInsufficient": "Image resolution is too small",
        "FailedOperation.ImageSizeExceed": "Image content is too large",
        "FailedOperation.ProfileNumExceed": "Too many people in the image",
        "FailedOperation.RequestEntityTooLarge": "Image content is too large",
        "FailedOperation.RequestTimeout": "Portrait cutout timed out",
        "FailedOperation.RpcFail": "Portrait cutout service unavailable",
        "FailedOperation.SegmentFailed": "Could not separate subject from background",
        "FailedOperation.ServerError": "Portrait cutout service busy",
        "FailedOperation.InnerError": "Portrait cutout service busy",
        "FailedOperation.UnKnowError": "Portrait cutout failed",
        "FailedOperation.UnOpenError": "Tencent Cloud service is not enabled",
        "LimitExceeded.TooLargeFileError": "Image content is too large",
        "ResourceUnavailable.InArrears": "Tencent Cloud account is in arrears",
        "UnauthorizedOperation": "Tencent Cloud credentials unauthorized",
        "AuthFailure.SecretIdNotFound": "Invalid TENCENT_SECRET_ID",
        "AuthFailure.SignatureFailure": "Invalid TENCENT_SECRET_KEY",
    }
    return mapping.get(code, msg or "Tencent Cloud request failed")


def _segment_http_status(exc: Any) -> int:
    """400 for image/content issues; 502 for infra / account problems."""
    code = getattr(exc, "code", "") or ""
    if code.startswith("AuthFailure") or code in {
        "ResourceUnavailable.InArrears",
        "FailedOperation.UnOpenError",
        "UnauthorizedOperation",
        "FailedOperation.RpcFail",
        "FailedOperation.ServerError",
        "FailedOperation.InnerError",
        "FailedOperation.RequestTimeout",
    }:
        return 502
    if code.startswith("FailedOperation.") or code.startswith("LimitExceeded."):
        return 400
    return 502


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
        raise HTTPException(status_code=_segment_http_status(exc), detail=_map_tencent_error(exc)) from exc
    img_b64 = getattr(resp, "ResultImage", None) or ""
    if not img_b64:
        raise HTTPException(
            status_code=400,
            detail="Could not separate subject from background",
        )
    try:
        return base64.b64decode(img_b64)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Invalid segment image data") from exc


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
