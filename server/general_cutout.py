"""General (non-portrait) background removal via rembg."""

from __future__ import annotations

import os
from typing import Any, Optional

from fastapi import HTTPException

_session: Any = None


def rembg_available() -> bool:
    try:
        import rembg  # noqa: F401

        return True
    except ImportError:
        return False


def _get_session():
    global _session
    if _session is not None:
        return _session
    try:
        from rembg import new_session
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="General cutout is not available (rembg not installed).",
        ) from exc
    model = (os.environ.get("REMBG_MODEL") or "u2netp").strip() or "u2netp"
    _session = new_session(model)
    return _session


def segment_general(image_bytes: bytes) -> bytes:
    """Remove background for general subjects; returns PNG bytes with alpha."""
    if len(image_bytes) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image is too large (max 8MB)")
    try:
        from rembg import remove
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="General cutout is not available (rembg not installed).",
        ) from exc
    try:
        out: Optional[bytes] = remove(image_bytes, session=_get_session())
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="General cutout failed",
        ) from exc
    if not out:
        raise HTTPException(
            status_code=400,
            detail="Could not separate subject from background",
        )
    return bytes(out)
