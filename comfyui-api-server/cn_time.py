"""Beijing time helpers — Windows-safe ZoneInfo with UTC+8 fallback."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo

    try:
        CN_TZ = ZoneInfo("Asia/Shanghai")
    except Exception:
        # Windows without tzdata package
        CN_TZ = timezone(timedelta(hours=8))
except Exception:
    CN_TZ = timezone(timedelta(hours=8))


def cn_now() -> datetime:
    return datetime.now(CN_TZ)


def cn_now_str(fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    return cn_now().strftime(fmt)


def cn_stamp_dir() -> str:
    """Folder stamp like 2026-09-08_21-30"""
    return cn_now().strftime("%Y-%m-%d_%H-%M")
