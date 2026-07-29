"""Site-wide PV / UV and anonymous feature event counters."""

from __future__ import annotations

import os
import re
import uuid
from datetime import date, timedelta
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

router = APIRouter(prefix="/stats", tags=["stats"])
security = HTTPBearer(auto_error=False)

# Bumped when geo daily write/overview fields change — health must expose this so
# deploy can detect a stale orphan process still serving pre-geo site_stats.
STATS_GEO_REV = 1

_get_conn: Optional[Callable[[], Any]] = None
_require_db: Optional[Callable[[], None]] = None
_get_current_user: Optional[Callable[..., Any]] = None
_get_optional_user: Optional[Callable[..., Any]] = None
_require_admin: Optional[Callable[[dict], None]] = None
_is_admin: Optional[Callable[[dict], bool]] = None
_client_ip: Optional[Callable[[Request], str]] = None
_tables_ready = False

_VISITOR_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
_EVENT_RE = re.compile(r"^[a-z][a-z0-9._-]{1,95}$")


def _exclude_ips() -> set[str]:
    raw = os.environ.get("STATS_EXCLUDE_IPS", "") or ""
    return {p.strip() for p in raw.split(",") if p.strip()}


def wire(
    get_conn: Callable[[], Any],
    require_db: Callable[[], None],
    get_current_user: Optional[Callable[..., Any]] = None,
    require_admin: Optional[Callable[[dict], None]] = None,
    get_optional_user: Optional[Callable[..., Any]] = None,
    is_admin: Optional[Callable[[dict], bool]] = None,
    client_ip: Optional[Callable[[Request], str]] = None,
) -> None:
    global _get_conn, _require_db, _get_current_user, _get_optional_user
    global _require_admin, _is_admin, _client_ip
    _get_conn = get_conn
    _require_db = require_db
    if get_current_user is not None:
        _get_current_user = get_current_user
    if require_admin is not None:
        _require_admin = require_admin
    if get_optional_user is not None:
        _get_optional_user = get_optional_user
    if is_admin is not None:
        _is_admin = is_admin
    if client_ip is not None:
        _client_ip = client_ip


def ensure_site_stats_tables(cur) -> None:
    global _tables_ready
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
            first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            region VARCHAR(16) NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    # Older installs may miss region column.
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'site_stats_visitors'
          AND COLUMN_NAME = 'region'
        """
    )
    if int((cur.fetchone() or {}).get("c") or 0) == 0:
        try:
            cur.execute(
                "ALTER TABLE site_stats_visitors ADD COLUMN region VARCHAR(16) NULL"
            )
        except Exception:
            pass
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
        """
        CREATE TABLE IF NOT EXISTS site_stats_geo_daily (
            stat_date DATE NOT NULL,
            region VARCHAR(16) NOT NULL,
            pv BIGINT NOT NULL DEFAULT 0,
            uv BIGINT NOT NULL DEFAULT 0,
            PRIMARY KEY (stat_date, region)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS site_stats_ip_country (
            ip VARCHAR(64) NOT NULL PRIMARY KEY,
            country CHAR(2) NOT NULL DEFAULT '',
            region VARCHAR(16) NOT NULL DEFAULT 'unknown',
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    cur.execute(
        "INSERT IGNORE INTO site_stats (id, site_pv, site_uv) VALUES (1, 0, 0)"
    )
    _tables_ready = True


def _ensure_tables(cur) -> None:
    """Idempotent; used on hit so geo tables exist even if startup missed them."""
    global _tables_ready
    if _tables_ready:
        return
    ensure_site_stats_tables(cur)


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


def _country_to_region(country: str) -> str:
    cc = (country or "").strip().upper()
    if cc == "CN":
        return "cn"
    if cc and cc not in ("XX", "T1", "A1", "A2"):
        return "overseas"
    return "unknown"


def _is_private_ip(ip: str) -> bool:
    ip = (ip or "").strip()
    if not ip or ip in ("unknown", "127.0.0.1", "::1"):
        return True
    if ip.startswith("10.") or ip.startswith("192.168.") or ip.startswith("127."):
        return True
    if ip.startswith("172."):
        try:
            second = int(ip.split(".")[1])
            if 16 <= second <= 31:
                return True
        except Exception:
            pass
    return False


def _lookup_country_online(ip: str) -> str:
    """Best-effort country code; empty on failure."""
    try:
        import httpx

        with httpx.Client(timeout=2.0) as client:
            resp = client.get(f"https://api.country.is/{ip}")
            if resp.status_code >= 400:
                return ""
            data = resp.json() if resp.content else {}
            return str((data or {}).get("country") or "").upper()[:2]
    except Exception:
        return ""


def _resolve_region(request: Request, cur, ip: str) -> str:
    # 1) CDN / proxy headers (Cloudflare etc.)
    for header in ("cf-ipcountry", "x-country-code", "x-appengine-country"):
        raw = (request.headers.get(header) or "").strip().upper()
        if raw and raw not in ("XX", "T1"):
            return _country_to_region(raw)

    if _is_private_ip(ip):
        return "unknown"

    # 2) Cached IP → country
    cur.execute(
        "SELECT country, region FROM site_stats_ip_country WHERE ip=%s",
        (ip,),
    )
    row = cur.fetchone()
    if row:
        return (row.get("region") or _country_to_region(row.get("country") or "")).strip() or "unknown"

    # 3) Online lookup (low traffic OK; result cached)
    country = _lookup_country_online(ip)
    region = _country_to_region(country) if country else "unknown"
    try:
        cur.execute(
            """
            INSERT INTO site_stats_ip_country (ip, country, region)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE country=VALUES(country), region=VALUES(region)
            """,
            (ip, country or "", region),
        )
    except Exception:
        pass
    return region


def _bump_geo(cur, region: str, *, pv: int = 0, uv: int = 0) -> None:
    region = region if region in ("cn", "overseas", "unknown") else "unknown"
    today = date.today().isoformat()
    cur.execute(
        """
        INSERT INTO site_stats_geo_daily (stat_date, region, pv, uv)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
          pv = pv + VALUES(pv),
          uv = uv + VALUES(uv)
        """,
        (today, region, max(0, int(pv)), max(0, int(uv))),
    )


def _should_skip_count(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials],
) -> bool:
    """Skip counting for excluded IPs and logged-in admins."""
    if _client_ip is not None:
        ip = (_client_ip(request) or "").strip()
        if ip and ip in _exclude_ips():
            return True
    if _get_optional_user is not None and _is_admin is not None and creds is not None:
        try:
            user = _get_optional_user(creds)
        except Exception:
            user = None
        if user and _is_admin(user):
            return True
    return False


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
def record_hit(
    request: Request,
    body: Optional[HitBody] = None,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Increment PV; increment UV once per visitor_id."""
    if _require_db is None or _get_conn is None:
        raise HTTPException(status_code=503, detail="Stats unavailable")
    _require_db()
    payload = body or HitBody()
    visitor_id = _normalize_visitor_id(payload.visitor_id)
    if _should_skip_count(request, creds):
        conn = _get_conn()
        try:
            with conn.cursor() as cur:
                totals = _read_totals(cur)
        finally:
            conn.close()
        totals["visitor_id"] = visitor_id
        totals["skipped"] = True
        return totals

    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            _ensure_tables(cur)
            ip = (_client_ip(request) if _client_ip else "") or ""
            try:
                region = _resolve_region(request, cur, ip)
            except Exception:
                region = "unknown"
            if region not in ("cn", "overseas", "unknown"):
                region = "unknown"
            cur.execute(
                "INSERT IGNORE INTO site_stats (id, site_pv, site_uv) VALUES (1, 0, 0)"
            )
            cur.execute("UPDATE site_stats SET site_pv = site_pv + 1 WHERE id = 1")
            _bump_geo(cur, region, pv=1, uv=0)
            cur.execute(
                "INSERT IGNORE INTO site_stats_visitors (visitor_id, region) VALUES (%s, %s)",
                (visitor_id, region),
            )
            if cur.rowcount == 1:
                cur.execute(
                    "UPDATE site_stats SET site_uv = site_uv + 1 WHERE id = 1"
                )
                _bump_geo(cur, region, pv=0, uv=1)
            totals = _read_totals(cur)
        totals["visitor_id"] = visitor_id
        totals["skipped"] = False
        totals["region"] = region
        totals["geo_rev"] = STATS_GEO_REV
        return totals
    finally:
        conn.close()


@router.post("/event")
def record_event(
    request: Request,
    body: EventBody,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Anonymous feature/page counter (daily bucket)."""
    if _require_db is None or _get_conn is None:
        raise HTTPException(status_code=503, detail="Stats unavailable")
    _require_db()
    name = _normalize_event_name(body.name)
    today = date.today().isoformat()
    if _should_skip_count(request, creds):
        return {"ok": True, "name": name, "date": today, "skipped": True}

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
        return {"ok": True, "name": name, "date": today, "skipped": False}
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
            _ensure_tables(cur)
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

            cur.execute(
                """
                SELECT region, SUM(pv) AS pv, SUM(uv) AS uv
                FROM site_stats_geo_daily
                WHERE stat_date >= %s AND stat_date <= %s
                GROUP BY region
                """,
                (start.isoformat(), end.isoformat()),
            )
            geo_pv = {"cn": 0, "overseas": 0, "unknown": 0}
            geo_uv = {"cn": 0, "overseas": 0, "unknown": 0}
            for r in cur.fetchall() or []:
                key = (r.get("region") or "unknown").strip() or "unknown"
                if key not in geo_pv:
                    key = "unknown"
                geo_pv[key] = int(r.get("pv") or 0)
                geo_uv[key] = int(r.get("uv") or 0)
            pv_total = sum(geo_pv.values()) or 0
            uv_total = sum(geo_uv.values()) or 0

            def _share(part: int, total: int) -> float:
                if total <= 0:
                    return 0.0
                return round(part / total, 4)

            geo = {
                "pv": geo_pv,
                "uv": geo_uv,
                "pv_total": pv_total,
                "uv_total": uv_total,
                "pv_share": {
                    "cn": _share(geo_pv["cn"], pv_total),
                    "overseas": _share(geo_pv["overseas"], pv_total),
                    "unknown": _share(geo_pv["unknown"], pv_total),
                },
                "uv_share": {
                    "cn": _share(geo_uv["cn"], uv_total),
                    "overseas": _share(geo_uv["overseas"], uv_total),
                    "unknown": _share(geo_uv["unknown"], uv_total),
                },
            }

        return {
            "site_pv": totals["site_pv"],
            "site_uv": totals["site_uv"],
            "days": days,
            "from": start.isoformat(),
            "to": end.isoformat(),
            "events_top": top,
            "events_daily": daily,
            "modules": modules,
            "geo": geo,
            "geo_rev": STATS_GEO_REV,
            "exclude_ips_configured": sorted(_exclude_ips()),
        }
    finally:
        conn.close()
