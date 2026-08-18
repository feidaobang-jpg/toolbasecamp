import os
import time
from typing import Optional

import httpx


SITE_BASE_URL = os.environ.get("SITE_BASE_URL", "https://zhengxiaohui.cn").rstrip("/")
FEISHU_WEBHOOK_URL = os.environ.get("FEISHU_WEBHOOK_URL") or os.environ.get("ALERT_WEBHOOK_URL") or ""

FEISHU_NOTIFY_ENABLE = os.environ.get("FEISHU_NOTIFY_ENABLE", "1").strip().lower() not in (
    "0",
    "false",
    "no",
    "off",
    "",
)

NOTIFY_WINDOW_SEC = float(os.environ.get("FEISHU_NOTIFY_WINDOW_SEC", "60"))
NOTIFY_TIMEOUT_SEC = float(os.environ.get("FEISHU_NOTIFY_TIMEOUT_SEC", "8"))

_LAST_NOTIFY: dict[str, float] = {}


def _rate_limited(key: Optional[str]) -> bool:
    if not key or NOTIFY_WINDOW_SEC <= 0:
        return False
    now = time.time()
    prev = _LAST_NOTIFY.get(key)
    if prev is not None and now - prev < NOTIFY_WINDOW_SEC:
        return True
    _LAST_NOTIFY[key] = now
    return False


def mask_contact(*, email: Optional[str] = None, phone: Optional[str] = None, guest_name: Optional[str] = None) -> str:
    em = str(email or "").strip()
    ph = str(phone or "").strip()
    if ph:
        digits = "".join(ch for ch in ph if ch.isdigit())
        if len(digits) <= 3:
            return "User"
        # Keep only last 3-4 digits
        tail = digits[-4:] if len(digits) >= 7 else digits[-3:]
        return f"***{tail}"
    if em and "@" in em:
        local, domain = em.split("@", 1)
        local = local or "u"
        if len(local) <= 2:
            return f"{local[0]}***@{domain}"
        return f"{local[:2]}***@{domain}"
    if guest_name:
        return str(guest_name).strip()[:20] or "Guest"
    return "User"


def _build_payload(text: str) -> dict:
    # Keep compatible with existing deploy script's format.
    url = FEISHU_WEBHOOK_URL.lower()
    if "feishu.cn" in url or "larksuite.com" in url:
        return {"msg_type": "text", "content": {"text": text}}
    return {"text": text}


def notify_feishu_text_sync(text: str, *, key: Optional[str] = None) -> None:
    if not FEISHU_NOTIFY_ENABLE or not FEISHU_WEBHOOK_URL:
        return
    if _rate_limited(key):
        return

    payload = _build_payload(text)
    try:
        with httpx.Client(timeout=NOTIFY_TIMEOUT_SEC) as client:
            client.post(FEISHU_WEBHOOK_URL, json=payload)
    except Exception:
        # Notification must not affect user flow.
        return


async def notify_feishu_text_async(text: str, *, key: Optional[str] = None) -> None:
    if not FEISHU_NOTIFY_ENABLE or not FEISHU_WEBHOOK_URL:
        return
    if _rate_limited(key):
        return

    payload = _build_payload(text)
    try:
        async with httpx.AsyncClient(timeout=NOTIFY_TIMEOUT_SEC) as client:
            await client.post(FEISHU_WEBHOOK_URL, json=payload)
    except Exception:
        # Notification must not affect user flow.
        return

