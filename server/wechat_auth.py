"""WeChat OAuth login (网页授权) for Tool Basecamp.

Flow:
1) Frontend sends user to GET /api/auth/wechat/start?next=...
2) Server redirects to WeChat OAuth authorize endpoint.
3) WeChat redirects back to GET /api/auth/wechat/callback with `code` (+ `state`).
4) Server exchanges code for access_token/openid, then binds/creates a local user.
5) Server redirects to /html/auth/wechat-callback.html?token=...&next=...
"""

from __future__ import annotations

import base64
import json
import os
import secrets
from typing import Any, Optional

import httpx
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse


router = APIRouter(prefix="/auth/wechat", tags=["auth-wechat"])


WECHAT_APPID = os.environ.get("WECHAT_APPID", "").strip()
WECHAT_SECRET = os.environ.get("WECHAT_SECRET", "").strip()

AUTHORIZE_URL = "https://open.weixin.qq.com/connect/oauth2/authorize"
ACCESS_TOKEN_URL = "https://api.weixin.qq.com/sns/oauth2/access_token"


def _hash_password(password: str) -> str:
    # Keep consistent with server/main.py bcrypt settings.
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


_get_conn = None
_create_access_token = None


def _wire(get_conn, create_access_token):
    global _get_conn, _create_access_token
    _get_conn = get_conn
    _create_access_token = create_access_token


def ensure_wechat_tables(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS wechat_openid_bindings (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            openid VARCHAR(128) NOT NULL,
            unionid VARCHAR(128) NULL,
            user_id BIGINT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_wechat_openid (openid),
            INDEX idx_wechat_user (user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )


def _is_configured() -> bool:
    return bool(WECHAT_APPID and WECHAT_SECRET)


@router.get("/config")
def wechat_config():
    """Public, non-sensitive config for frontend capability gating."""
    return {"success": True, "configured": _is_configured()}


def _safe_next(next_path: str) -> str:
    s = (next_path or "").strip()
    # Only allow local relative redirects to avoid open-redirect issues.
    if not s:
        return ""
    if s.startswith("/") and not s.startswith("//"):
        return s
    return ""


def _encode_state(obj: dict) -> str:
    raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_state(s: str) -> dict[str, Any]:
    try:
        pad = "=" * (-len(s) % 4)
        raw = base64.urlsafe_b64decode(s + pad)
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return {}


def _require_wire():
    if _get_conn is None or _create_access_token is None:
        raise RuntimeError("wechat_auth not wired")


async def _exchange_code_for_openid(code: str) -> dict[str, Any]:
    if not _is_configured():
        raise HTTPException(status_code=503, detail="WeChat login is not configured.")

    async with httpx.AsyncClient(timeout=12) as client:
        resp = await client.get(
            ACCESS_TOKEN_URL,
            params={
                "appid": WECHAT_APPID,
                "secret": WECHAT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        data = resp.json()

    # WeChat error format: { "errcode": "...", "errmsg": "..." }
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="WeChat OAuth failed.")
    if data.get("errcode"):
        raise HTTPException(status_code=400, detail=f"WeChat OAuth error: {data.get('errmsg') or data.get('errcode')}")
    if not data.get("openid"):
        raise HTTPException(status_code=400, detail="WeChat OAuth failed (openid missing).")
    return data


@router.get("/start")
def wechat_start(request: Request, next: str = ""):
    _require_wire()
    if not _is_configured():
        raise HTTPException(status_code=503, detail="WeChat login is not configured (WECHAT_APPID/WECHAT_SECRET).")

    safe_next = _safe_next(next)
    state = _encode_state({"next": safe_next})

    # Redirect back into this API: /api/auth/wechat/callback
    redirect_uri = str(request.url_for("wechat_callback"))

    # WeChat requires scope and state.
    params = {
        "appid": WECHAT_APPID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        # In WeChat in-app browser, oauth2 scope should be snsapi_base/userinfo.
        "scope": "snsapi_base",
        "state": state,
    }

    # `#wechat_redirect` is required for WeChat official OAuth redirection.
    url = AUTHORIZE_URL + "?" + httpx.QueryParams(params).urlencode() + "#wechat_redirect"
    return RedirectResponse(url)


@router.get("/callback", name="wechat_callback")
async def wechat_callback(request: Request, code: Optional[str] = None, state: str = ""):
    _require_wire()
    if not code:
        raise HTTPException(status_code=400, detail="Missing OAuth code")

    state_obj = _decode_state(state or "")
    safe_next = _safe_next(state_obj.get("next") or "")

    data = await _exchange_code_for_openid(code)
    openid = str(data.get("openid") or "")
    unionid = data.get("unionid")

    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id FROM wechat_openid_bindings WHERE openid=%s",
                (openid,),
            )
            row = cur.fetchone()
            if row and row.get("user_id"):
                user_id = int(row["user_id"])
            else:
                # Create a user without phone/email. It will still have an auth_token.
                pw = secrets.token_urlsafe(24)
                pw_hash = _hash_password(pw)
                cur.execute(
                    "INSERT INTO users (email, phone, password_hash, role) VALUES (%s, %s, %s, %s)",
                    (None, None, pw_hash, "user"),
                )
                user_id = int(cur.lastrowid)
                cur.execute(
                    """
                    INSERT INTO wechat_openid_bindings (openid, unionid, user_id)
                    VALUES (%s, %s, %s)
                    """,
                    (openid, unionid, user_id),
                )

    finally:
        conn.close()

    # Fetch user to include email/phone fields in token payload (optional).
    # Keep it simple: token only needs sub, but create_access_token requires args.
    # We'll re-open a connection to read the user.
    conn2 = _get_conn()
    try:
        with conn2.cursor() as cur:
            cur.execute("SELECT email, phone FROM users WHERE id=%s", (user_id,))
            urow = cur.fetchone() or {}
            email = urow.get("email")
            phone = urow.get("phone")
    finally:
        conn2.close()

    token = _create_access_token(user_id, email=email, phone=phone)  # type: ignore[misc]

    # Redirect to a lightweight page that stores token into localStorage.
    qs = httpx.QueryParams({"token": token, "next": safe_next or ""})
    return RedirectResponse(url=f"/html/auth/wechat-callback.html?{qs.urlencode()}")

