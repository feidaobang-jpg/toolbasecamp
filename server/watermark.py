"""Advanced watermark removal via OpenCV inpaint (ported from composite)."""

from __future__ import annotations

import base64
import json
import os
from typing import Any, Dict, List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

router = APIRouter(prefix="/watermark", tags=["watermark"])

MAX_UPLOAD = 8 * 1024 * 1024
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def _opencv_available() -> bool:
    try:
        import cv2  # noqa: F401
        import numpy  # noqa: F401
        return True
    except Exception:
        return False


def _build_watermark_mask(img, rx: int, ry: int, rw: int, rh: int):
    import cv2
    import numpy as np

    ih, iw = img.shape[:2]
    roi = img[ry : ry + rh, rx : rx + rw]
    if roi.size == 0:
        mask = np.zeros((ih, iw), dtype=np.uint8)
        mask[ry : ry + rh, rx : rx + rw] = 255
        return mask

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (11, 11), 0)
    diff = cv2.subtract(gray, blur)
    _, m1 = cv2.threshold(diff, 8, 255, cv2.THRESH_BINARY)
    _, m2 = cv2.threshold(gray, 125, 255, cv2.THRESH_BINARY)
    local = cv2.bitwise_or(m1, m2)
    local = cv2.morphologyEx(local, cv2.MORPH_CLOSE, np.ones((3, 9), np.uint8), iterations=2)
    local = cv2.dilate(local, np.ones((5, 7), np.uint8), iterations=3)

    if cv2.countNonZero(local) < 40:
        local = np.full((rh, rw), 255, dtype=np.uint8)

    mask = np.zeros((ih, iw), dtype=np.uint8)
    mask[ry : ry + rh, rx : rx + rw] = local
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)
    return mask


def _inpaint_region(img, rx: int, ry: int, rw: int, rh: int):
    import cv2

    mask = _build_watermark_mask(img, rx, ry, rw, rh)
    radius = max(4, int(min(img.shape[:2]) * 0.006))
    return cv2.inpaint(img, mask, radius, cv2.INPAINT_NS)


def _clamp_region(iw: int, ih: int, rx: int, ry: int, rw: int, rh: int) -> Dict[str, int]:
    rw = max(1, min(rw, iw))
    rh = max(1, min(rh, ih))
    rx = max(0, min(rx, iw - rw))
    ry = max(0, min(ry, ih - rh))
    return {"x": rx, "y": ry, "w": rw, "h": rh}


@router.get("/health")
def watermark_health():
    return {"success": True, "opencv": _opencv_available()}


@router.post("/image/process")
async def watermark_image_process(
    image: UploadFile = File(...),
    regions: str = Form(""),
):
    if not _opencv_available():
        raise HTTPException(
            status_code=503,
            detail="OpenCV is not installed on the server (opencv-python-headless / numpy).",
        )

    name = (image.filename or "").lower()
    ext = os.path.splitext(name)[1]
    if ext and ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Please upload an image file")

    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=400, detail="Image is too large (max 8MB)")

    import cv2
    import numpy as np

    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Failed to decode image")

    ih, iw = img.shape[:2]
    region_list: List[Dict[str, int]] = []
    raw = (regions or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Please specify at least one region")

    try:
        parsed: Any = json.loads(raw)
        if not isinstance(parsed, list):
            raise ValueError("not a list")
        for it in parsed:
            if not isinstance(it, dict):
                continue
            rw = int(it.get("w") or 0)
            rh = int(it.get("h") or 0)
            if rw <= 0 or rh <= 0:
                continue
            rx = int(it.get("x") or 0)
            ry = int(it.get("y") or 0)
            region_list.append(_clamp_region(iw, ih, rx, ry, rw, rh))
    except Exception:
        raise HTTPException(
            status_code=400,
            detail='Invalid regions JSON; expected [{x,y,w,h}, ...]',
        )

    if not region_list:
        raise HTTPException(status_code=400, detail="Please specify at least one region")

    out = img
    for r in region_list:
        out = _inpaint_region(out, r["x"], r["y"], r["w"], r["h"])

    ok, enc = cv2.imencode(".png", out)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to encode image")

    b64 = base64.b64encode(enc.tobytes()).decode("utf-8")
    base = os.path.splitext(image.filename or "image")[0]
    return {
        "success": True,
        "filename": f"{base}_clean.png",
        "image_data": f"data:image/png;base64,{b64}",
        "regions": region_list,
        "image_size": {"width": iw, "height": ih},
    }
