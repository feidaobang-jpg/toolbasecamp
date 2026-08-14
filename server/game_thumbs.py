"""Admin upload for games hub thumbnail JPEGs."""

from __future__ import annotations

import base64
import os
import re
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

router = APIRouter(prefix="/admin/game-thumbs", tags=["game-thumbs"])
security = HTTPBearer(auto_error=False)

_get_current_user: Optional[Callable[..., Any]] = None
_require_admin: Optional[Callable[[dict], None]] = None

_SLUG_RE = re.compile(r"^[a-z0-9_-]+$")
_MAX_BYTES = 512 * 1024


def wire(get_current_user: Callable[..., Any], require_admin: Callable[[dict], None]) -> None:
    global _get_current_user, _require_admin
    _get_current_user = get_current_user
    _require_admin = require_admin


def _admin_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if _get_current_user is None:
        raise HTTPException(status_code=503, detail="Auth not configured")
    user = _get_current_user(creds)
    if _require_admin is not None:
        _require_admin(user)
    return user


def thumbs_dir() -> str:
    env = (os.environ.get("GAME_THUMBS_DIR") or "").strip()
    if env:
        return env
    local = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "public", "assets", "game", "thumbs")
    )
    if os.path.isdir(os.path.dirname(local)):
        return local
    return "/var/www/toolbasecamp/assets/game/thumbs"


class UploadBody(BaseModel):
    slug: str = Field(..., min_length=1, max_length=64)
    image_b64: str = Field(..., min_length=32, description="JPEG base64 without data: prefix")


@router.get("/status")
def game_thumbs_status(_admin: dict = Depends(_admin_user)):
    root = thumbs_dir()
    items = []
    if os.path.isdir(root):
        for name in sorted(os.listdir(root)):
            if not name.lower().endswith(".jpg"):
                continue
            path = os.path.join(root, name)
            if not os.path.isfile(path):
                continue
            st = os.stat(path)
            items.append(
                {
                    "slug": name[:-4],
                    "bytes": st.st_size,
                    "updated_at": int(st.st_mtime),
                }
            )
    return {"dir": root, "writable": os.access(root, os.W_OK), "items": items}


@router.post("/upload")
def game_thumbs_upload(body: UploadBody, _admin: dict = Depends(_admin_user)):
    slug = body.slug.strip()
    if not _SLUG_RE.match(slug):
        raise HTTPException(status_code=400, detail="Invalid slug")
    raw = body.image_b64.strip()
    if raw.startswith("data:"):
        raw = raw.split(",", 1)[-1]
    try:
        data = base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image") from exc
    if len(data) < 800:
        raise HTTPException(status_code=400, detail="Image too small")
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image too large")
    if data[:3] != b"\xff\xd8\xff":
        raise HTTPException(status_code=400, detail="JPEG only")

    out_dir = thumbs_dir()
    try:
        os.makedirs(out_dir, exist_ok=True)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Cannot create thumbs dir: {exc}") from exc
    if not os.access(out_dir, os.W_OK):
        raise HTTPException(status_code=500, detail=f"Thumbs dir not writable: {out_dir}")

    path = os.path.join(out_dir, f"{slug}.jpg")
    tmp = path + ".tmp"
    try:
        with open(tmp, "wb") as fh:
            fh.write(data)
        os.replace(tmp, path)
    except OSError as exc:
        try:
            if os.path.isfile(tmp):
                os.remove(tmp)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    st = os.stat(path)
    return {"ok": True, "slug": slug, "path": path, "bytes": st.st_size}
