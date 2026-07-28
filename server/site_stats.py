"""Site-wide PV / UV and anonymous feature event counters."""

from __future__ import annotations

import re
import uuid
from datetime import date, timedelta
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

router = APIRouter(prefix="/stats", tags=["stats"])
security = HTTPBearer(auto_error=False)

_get_conn: Optional[Callable[[], Any]] = None
_require_db: Optional[Callable[[], None]] = None
_get_current_user: Optional[Callable[..., Any]] = None
_require_admin: Optional[Callable[[dict], None]] = None

_VISITOR_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
_EVENT_RE = re.compile(r"^[a-z][a-z0-9._-]{1,95}$")


def wire(
    get_conn: Callable[[], Any],
    require_db: Callable[[], None],
    get_current_user: Optional[Callable[..., Any]] = None,
    require_admin: Optional[Callable[[dict], None]] = None,
) -> None:
    global _get_conn, _require_db, _get_current_user, _require_admin
    _get_conn = get_conn
    _require_db = require_db
    if get_current_user is not None:
        _get_current_user = get_current_user
    if require_admin is not None:
        _require_admin = require_admin


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
        """
        CREATE TABLE IF NOT EXISTS site_stats_events (
            stat_date DATE NOT NULL,
            event_name VARCHAR(96) NOT NULL,
            hit_count BIGINT NOT NULL DEFAULT 0,
            PRIMARY KEY (stat_date, event_name),
            KEY idx_events_name_date (event_name, stat_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    cur.execute(
        "INSERT IGNORE INTO site_stats (id, site_pv, site_uv) VALUES (1, 0, 0)"
    )


class HitBody(BaseModel):
    visitor_id: Optional[str] = Field(default=None, max_length=36)


class EventBody(BaseModel):
    name: str = Field(..., min_length=2, max_length=96)


def _normalize_visitor_id(raw: Optional[str]) -> str:
    vid = (raw or "").strip()
    if vid and _VISITOR_RE.fullmatch(vid):
        return vid.lower()
    return str(uuid.uuid4())


def _normalize_event_name(raw: str) -> str:
    name = (raw or "").strip().lower()
    if not _EVENT_RE.fullmatch(name):
        raise HTTPException(status_code=400, detail="Invalid event name")
    return name


def _read_totals(cur) -> dict:
    cur.execute("SELECT site_pv, site_uv FROM site_stats WHERE id = 1")
    row = cur.fetchone() or {}
    return {
        "site_pv": int(row.get("site_pv") or 0),
        "site_uv": int(row.get("site_uv") or 0),
    }


def _admin_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if _get_current_user is None or _require_admin is None:
        raise HTTPException(status_code=503, detail="Stats admin unavailable")
    user = _get_current_user(creds)
    _require_admin(user)
    return user


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


@router.post("/event")
def record_event(body: EventBody):
    """Anonymous feature/page counter (daily bucket)."""
    if _require_db is None or _get_conn is None:
        raise HTTPException(status_code=503, detail="Stats unavailable")
    _require_db()
    name = _normalize_event_name(body.name)
    today = date.today().isoformat()
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO site_stats_events (stat_date, event_name, hit_count)
                VALUES (%s, %s, 1)
                ON DUPLICATE KEY UPDATE hit_count = hit_count + 1
                """,
                (today, name),
            )
        return {"ok": True, "name": name, "date": today}
    finally:
        conn.close()


@router.get("/overview")
def stats_overview(
    days: int = Query(default=7, ge=1, le=366),
    _admin: dict = Depends(_admin_user),
):
    """Admin-only: totals + event ranking for the last N days."""
    if _require_db is None or _get_conn is None:
        raise HTTPException(status_code=503, detail="Stats unavailable")
    _require_db()
    end = date.today()
    start = end - timedelta(days=days - 1)
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            totals = _read_totals(cur)
            cur.execute(
                """
                SELECT event_name AS name, SUM(hit_count) AS count
                FROM site_stats_events
                WHERE stat_date >= %s AND stat_date <= %s
                GROUP BY event_name
                ORDER BY count DESC, name ASC
                LIMIT 100
                """,
                (start.isoformat(), end.isoformat()),
            )
            top = [
                {"name": r["name"], "count": int(r["count"] or 0)}
                for r in (cur.fetchall() or [])
            ]
            cur.execute(
                """
                SELECT stat_date AS d, event_name AS name, hit_count AS count
                FROM site_stats_events
                WHERE stat_date >= %s AND stat_date <= %s
                ORDER BY stat_date ASC, hit_count DESC, event_name ASC
                """,
                (start.isoformat(), end.isoformat()),
            )
            daily_rows = cur.fetchall() or []
            daily = [
                {
                    "date": str(r["d"]),
                    "name": r["name"],
                    "count": int(r["count"] or 0),
                }
                for r in daily_rows
            ]

            # Aggregate by first segment (page / tool) and module path prefix.
            by_module: dict[str, int] = {}
            for item in top:
                parts = item["name"].split(".")
                if parts[0] == "tool" and len(parts) >= 2:
                    key = "tool." + parts[1]
                else:
                    key = parts[0]
                by_module[key] = by_module.get(key, 0) + item["count"]
            modules = [
                {"name": k, "count": v}
                for k, v in sorted(by_module.items(), key=lambda x: (-x[1], x[0]))
            ]

        return {
            "site_pv": totals["site_pv"],
            "site_uv": totals["site_uv"],
            "days": days,
            "from": start.isoformat(),
            "to": end.isoformat(),
            "events_top": top,
            "events_daily": daily,
            "modules": modules,
        }
    finally:
        conn.close()
