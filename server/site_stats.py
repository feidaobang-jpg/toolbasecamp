"""Site-wide PV / UV counters (replaces third-party Busuanzi)."""

from __future__ import annotations

import re
import uuid
from typing import Any, Callable, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/stats", tags=["stats"])

_get_conn: Optional[Callable[[], Any]] = None
_require_db: Optional[Callable[[], None]] = None

_VISITOR_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def wire(get_conn: Callable[[], Any], require_db: Callable[[], None]) -> None:
    global _get_conn, _require_db
    _get_conn = get_conn
    _require_db = require_db


def ensure_site_stats_tables(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS site_stats (
            id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
            site_pv BIGINT NOT NULL DEFAULT 0,
            site_uv BIGINT NOT NULL DEFAULT 0,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS site_stats_visitors (
            visitor_id CHAR(36) NOT NULL PRIMARY KEY,
            first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    cur.execute(
        "INSERT IGNORE INTO site_stats (id, site_pv, site_uv) VALUES (1, 0, 0)"
    )


class HitBody(BaseModel):
    visitor_id: Optional[str] = Field(default=None, max_length=36)


def _normalize_visitor_id(raw: Optional[str]) -> str:
    vid = (raw or "").strip()
    if vid and _VISITOR_RE.fullmatch(vid):
        return vid.lower()
    return str(uuid.uuid4())


def _read_totals(cur) -> dict:
    cur.execute("SELECT site_pv, site_uv FROM site_stats WHERE id = 1")
    row = cur.fetchone() or {}
    return {
        "site_pv": int(row.get("site_pv") or 0),
        "site_uv": int(row.get("site_uv") or 0),
    }


@router.get("")
def get_stats():
    if _require_db is None or _get_conn is None:
        raise HTTPException(status_code=503, detail="Stats unavailable")
    _require_db()
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            return _read_totals(cur)
    finally:
        conn.close()


@router.post("/hit")
def record_hit(body: Optional[HitBody] = None):
    """Increment PV; increment UV once per visitor_id."""
    if _require_db is None or _get_conn is None:
        raise HTTPException(status_code=503, detail="Stats unavailable")
    _require_db()
    payload = body or HitBody()
    visitor_id = _normalize_visitor_id(payload.visitor_id)
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT IGNORE INTO site_stats (id, site_pv, site_uv) VALUES (1, 0, 0)"
            )
            cur.execute("UPDATE site_stats SET site_pv = site_pv + 1 WHERE id = 1")
            cur.execute(
                "INSERT IGNORE INTO site_stats_visitors (visitor_id) VALUES (%s)",
                (visitor_id,),
            )
            if cur.rowcount == 1:
                cur.execute(
                    "UPDATE site_stats SET site_uv = site_uv + 1 WHERE id = 1"
                )
            totals = _read_totals(cur)
        totals["visitor_id"] = visitor_id
        return totals
    finally:
        conn.close()
