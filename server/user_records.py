"""Private per-user record tools: clocks, important days, deposits, goods, todos, rents."""

from __future__ import annotations

import calendar
import json
import re
import secrets
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

security = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/records", tags=["records"])

NAME_MAX = 80
TODO_TEXT_MAX = 200
TODO_STATUSES = ("pending", "done")
REMARK_MAX = 500
CATEGORY_NAME_MAX = 40
GOODS_PRICE_LABEL_MAX = 40
CLOCK_TARGET_MAX = 999999
CHECKIN_MAX = 999
CLOCK_LOG_LIMIT = 100
DEPOSIT_AMOUNT_MAX = Decimal("99999999.99")
GOODS_PRICE_MAX = Decimal("99999999.99")


def _wire(get_conn, require_db, get_current_user, get_optional_user=None):
    """Bind shared helpers from main (avoids circular import at module load)."""
    router.get_conn = get_conn  # type: ignore[attr-defined]
    router.require_db = require_db  # type: ignore[attr-defined]
    router.get_current_user = get_current_user  # type: ignore[attr-defined]
    if get_optional_user is not None:
        router.get_optional_user = get_optional_user  # type: ignore[attr-defined]


def _conn():
    router.require_db()  # type: ignore[attr-defined]
    return router.get_conn()  # type: ignore[attr-defined]


def _user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    return router.get_current_user(creds)  # type: ignore[attr-defined]


def ensure_record_tables(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS record_clocks (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            user_id BIGINT NOT NULL,
            name VARCHAR(80) NOT NULL,
            target_count INT NOT NULL,
            current_count INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_clocks_user (user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS record_clock_logs (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            clock_id BIGINT NOT NULL,
            user_id BIGINT NOT NULL,
            count INT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_clock_logs_clock (clock_id, id),
            INDEX idx_clock_logs_user (user_id),
            FOREIGN KEY (clock_id) REFERENCES record_clocks(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS record_important_days (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            user_id BIGINT NOT NULL,
            name VARCHAR(80) NOT NULL,
            day_date DATE NOT NULL,
            calendar_type VARCHAR(10) NOT NULL DEFAULT 'solar',
            lunar_month INT NULL,
            lunar_day INT NULL,
            lunar_leap TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_days_user (user_id),
            INDEX idx_days_date (day_date),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    for col_sql in (
        "calendar_type VARCHAR(10) NOT NULL DEFAULT 'solar'",
        "lunar_month INT NULL",
        "lunar_day INT NULL",
        "lunar_leap TINYINT(1) NOT NULL DEFAULT 0",
    ):
        col_name = col_sql.split()[0]
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'record_important_days'
              AND COLUMN_NAME = %s
            """,
            (col_name,),
        )
        if int((cur.fetchone() or {}).get("c") or 0) == 0:
            cur.execute(f"ALTER TABLE record_important_days ADD COLUMN {col_sql}")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS record_deposits (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            user_id BIGINT NOT NULL,
            name VARCHAR(80) NOT NULL,
            amount DECIMAL(14,2) NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_deposits_user (user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS record_deposit_txns (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            deposit_id BIGINT NOT NULL,
            user_id BIGINT NOT NULL,
            txn_type VARCHAR(16) NOT NULL,
            amount DECIMAL(14,2) NOT NULL,
            balance DECIMAL(14,2) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_txn_deposit (deposit_id),
            FOREIGN KEY (deposit_id) REFERENCES record_deposits(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS record_goods_categories (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            user_id BIGINT NOT NULL,
            name VARCHAR(40) NOT NULL,
            parent_id BIGINT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_gcat_user (user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_id) REFERENCES record_goods_categories(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS record_goods (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            user_id BIGINT NOT NULL,
            name VARCHAR(80) NOT NULL,
            category_id BIGINT NOT NULL,
            category_name VARCHAR(100) NOT NULL,
            price DECIMAL(14,2) NOT NULL,
            rating DECIMAL(3,1) NULL,
            remark VARCHAR(500) NOT NULL DEFAULT '',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_goods_user (user_id),
            INDEX idx_goods_cat (category_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES record_goods_categories(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    for col_sql in (
        "price_label VARCHAR(40) NULL",
    ):
        col_name = col_sql.split()[0]
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'record_goods'
              AND COLUMN_NAME = %s
            """,
            (col_name,),
        )
        if int((cur.fetchone() or {}).get("c") or 0) == 0:
            cur.execute(f"ALTER TABLE record_goods ADD COLUMN {col_sql}")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS record_todos (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            user_id BIGINT NOT NULL,
            content VARCHAR(200) NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_todos_user (user_id),
            INDEX idx_todos_user_status (user_id, status),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS record_rents (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            user_id BIGINT NOT NULL,
            title VARCHAR(80) NOT NULL,
            tenant_name VARCHAR(80) NOT NULL DEFAULT '',
            rent_amount DECIMAL(14,2) NOT NULL,
            due_day TINYINT NOT NULL DEFAULT 1,
            note VARCHAR(500) NOT NULL DEFAULT '',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_rents_user (user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS record_rent_payments (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            rent_id BIGINT NOT NULL,
            user_id BIGINT NOT NULL,
            period CHAR(7) NOT NULL,
            amount DECIMAL(14,2) NOT NULL,
            note VARCHAR(200) NOT NULL DEFAULT '',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_rent_period (rent_id, period),
            INDEX idx_rent_pay_rent (rent_id),
            FOREIGN KEY (rent_id) REFERENCES record_rents(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS record_online_games (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            code CHAR(6) NOT NULL,
            name VARCHAR(80) NOT NULL,
            creator_id BIGINT NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'open',
            draft_scores_json TEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_online_game_code (code),
            INDEX idx_online_games_creator (creator_id),
            INDEX idx_online_games_status (status),
            FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'record_online_games'
          AND COLUMN_NAME = 'draft_scores_json'
        """
    )
    if int((cur.fetchone() or {}).get("c") or 0) == 0:
        cur.execute("ALTER TABLE record_online_games ADD COLUMN draft_scores_json TEXT NULL")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS record_online_game_players (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            game_id BIGINT NOT NULL,
            user_id BIGINT NOT NULL,
            display_name VARCHAR(40) NOT NULL,
            joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_online_game_player (game_id, user_id),
            INDEX idx_online_players_user (user_id),
            FOREIGN KEY (game_id) REFERENCES record_online_games(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    _ensure_online_player_schema(cur)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS record_online_game_rounds (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            game_id BIGINT NOT NULL,
            round_no INT NOT NULL,
            scores_json TEXT NOT NULL,
            created_by BIGINT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_online_round (game_id, round_no),
            INDEX idx_online_rounds_game (game_id),
            FOREIGN KEY (game_id) REFERENCES record_online_games(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc).isoformat()
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _money(value: Any) -> str:
    d = Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"{d:.2f}"


def _rent_money(value: Any) -> str:
    """Rent amounts display as whole yuan (no decimals)."""
    d = Decimal(str(value or 0)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return f"{d:.0f}"


def _parse_money(raw: Any, *, field: str = "amount") -> Decimal:
    try:
        d = Decimal(str(raw).strip())
    except (InvalidOperation, AttributeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {field}") from exc
    if d <= 0:
        raise HTTPException(status_code=400, detail=f"{field} must be greater than 0")
    if d > DEPOSIT_AMOUNT_MAX:
        raise HTTPException(status_code=400, detail=f"{field} is too large")
    return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ---------- Clocks ----------


class ClockCreateBody(BaseModel):
    name: str
    target_count: int = Field(ge=1, le=CLOCK_TARGET_MAX)


class ClockUpdateBody(BaseModel):
    name: str
    target_count: int = Field(ge=1, le=CLOCK_TARGET_MAX)


class ClockCheckinBody(BaseModel):
    count: int = Field(ge=1, le=CHECKIN_MAX)


def _serialize_clock(row: dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "targetCount": int(row["target_count"]),
        "currentCount": int(row["current_count"]),
        "createdAt": _iso(row.get("created_at")),
        "updatedAt": _iso(row.get("updated_at")),
    }


def _serialize_clock_log(row: dict) -> dict:
    return {
        "id": row["id"],
        "count": int(row["count"]),
        "time": _iso(row.get("created_at")),
    }


def _list_clock_logs(cur, *, clock_id: int, user_id: int, limit: int = CLOCK_LOG_LIMIT) -> List[dict]:
    lim = max(1, min(int(limit), CLOCK_LOG_LIMIT))
    cur.execute(
        """
        SELECT id, count, created_at FROM record_clock_logs
        WHERE clock_id=%s AND user_id=%s
        ORDER BY id DESC
        LIMIT %s
        """,
        (clock_id, user_id, lim),
    )
    return [_serialize_clock_log(r) for r in (cur.fetchall() or [])]


@router.get("/clocks")
def list_clocks(user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM record_clocks
                WHERE user_id=%s
                ORDER BY updated_at DESC, id DESC
                """,
                (user["id"],),
            )
            rows = cur.fetchall() or []
        return {"items": [_serialize_clock(r) for r in rows]}
    finally:
        conn.close()


@router.post("/clocks")
def create_clock(body: ClockCreateBody, user: dict = Depends(_user)):
    name = (body.name or "").strip()
    if not name or len(name) > NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid name")
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO record_clocks (user_id, name, target_count, current_count)
                VALUES (%s, %s, %s, 0)
                """,
                (user["id"], name, body.target_count),
            )
            new_id = cur.lastrowid
            cur.execute("SELECT * FROM record_clocks WHERE id=%s AND user_id=%s", (new_id, user["id"]))
            row = cur.fetchone()
        return _serialize_clock(row)
    finally:
        conn.close()


@router.put("/clocks/{clock_id}")
def update_clock(clock_id: int, body: ClockUpdateBody, user: dict = Depends(_user)):
    name = (body.name or "").strip()
    if not name or len(name) > NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid name")
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, current_count FROM record_clocks WHERE id=%s AND user_id=%s",
                (clock_id, user["id"]),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Not found")
            current = int(row["current_count"])
            if current > body.target_count:
                current = body.target_count
            cur.execute(
                """
                UPDATE record_clocks
                SET name=%s, target_count=%s, current_count=%s
                WHERE id=%s AND user_id=%s
                """,
                (name, body.target_count, current, clock_id, user["id"]),
            )
            cur.execute("SELECT * FROM record_clocks WHERE id=%s", (clock_id,))
            return _serialize_clock(cur.fetchone())
    finally:
        conn.close()


@router.post("/clocks/{clock_id}/checkin")
def checkin_clock(clock_id: int, body: ClockCheckinBody, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM record_clocks WHERE id=%s AND user_id=%s",
                (clock_id, user["id"]),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Not found")
            current = int(row["current_count"])
            target = int(row["target_count"])
            if current >= target:
                raise HTTPException(status_code=400, detail="Target already reached")
            remaining = target - current
            add = min(body.count, remaining)
            cur.execute(
                """
                UPDATE record_clocks SET current_count = current_count + %s
                WHERE id=%s AND user_id=%s
                """,
                (add, clock_id, user["id"]),
            )
            if add > 0:
                cur.execute(
                    """
                    INSERT INTO record_clock_logs (clock_id, user_id, count)
                    VALUES (%s, %s, %s)
                    """,
                    (clock_id, user["id"], add),
                )
            cur.execute("SELECT * FROM record_clocks WHERE id=%s", (clock_id,))
            out = _serialize_clock(cur.fetchone())
            out["added"] = add
            return out
    finally:
        conn.close()


@router.get("/clocks/{clock_id}/logs")
def list_clock_logs(clock_id: int, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM record_clocks WHERE id=%s AND user_id=%s",
                (clock_id, user["id"]),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Not found")
            out = _serialize_clock(row)
            out["logs"] = _list_clock_logs(cur, clock_id=clock_id, user_id=user["id"])
            return out
    finally:
        conn.close()


@router.post("/clocks/reset-counts")
def reset_clock_counts(user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE record_clocks SET current_count=0 WHERE user_id=%s",
                (user["id"],),
            )
        return {"ok": True}
    finally:
        conn.close()


@router.post("/clocks/{clock_id}/reset")
def reset_clock(clock_id: int, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE record_clocks SET current_count=0
                WHERE id=%s AND user_id=%s
                """,
                (clock_id, user["id"]),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Not found")
            cur.execute("SELECT * FROM record_clocks WHERE id=%s", (clock_id,))
            return _serialize_clock(cur.fetchone())
    finally:
        conn.close()


@router.delete("/clocks/{clock_id}")
def delete_clock(clock_id: int, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM record_clocks WHERE id=%s AND user_id=%s",
                (clock_id, user["id"]),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}
    finally:
        conn.close()


# ---------- Important days ----------


class DayCreateBody(BaseModel):
    name: str
    date: str
    calendarType: str = "solar"
    lunarMonth: Optional[int] = None
    lunarDay: Optional[int] = None
    lunarLeap: bool = False


class DayUpdateBody(BaseModel):
    name: str
    date: str
    calendarType: str = "solar"
    lunarMonth: Optional[int] = None
    lunarDay: Optional[int] = None
    lunarLeap: bool = False


def _parse_day_date(raw: str) -> date:
    try:
        return date.fromisoformat((raw or "").strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid date") from exc


def _normalize_calendar_fields(
    calendar_type: str,
    lunar_month: Optional[int],
    lunar_day: Optional[int],
    lunar_leap: bool,
) -> tuple:
    ctype = (calendar_type or "solar").strip().lower()
    if ctype not in ("solar", "lunar"):
        raise HTTPException(status_code=400, detail="Invalid calendar type")
    if ctype == "solar":
        return "solar", None, None, 0
    month = int(lunar_month or 0)
    day = int(lunar_day or 0)
    if month < 1 or month > 12 or day < 1 or day > 30:
        raise HTTPException(status_code=400, detail="Invalid lunar date")
    return "lunar", month, day, 1 if lunar_leap else 0


def _date_on_year(base: date, year: int) -> date:
    """Month/day in a given year; Feb 29 → Feb 28 on non-leap years."""
    try:
        return date(year, base.month, base.day)
    except ValueError:
        if base.month == 2 and base.day == 29:
            return date(year, 2, 28)
        raise


def _anniversary_cycle(day_date: date, today: date) -> dict:
    """
    Recurring yearly anniversary relative to this year's month/day.
    daysLeft: 0 today, >0 until this year's date, <0 days since this year's date.
    """
    if day_date > today:
        # Future one-off date: not yet reached at all
        days_left = (day_date - today).days
        return {
            "daysLeft": days_left,
            "daysToNext": days_left,
            "anniversaryYears": 0,
            "nextAnniversaryYears": 0,
            "totalDays": (today - day_date).days,  # negative until reached
        }

    this_year = _date_on_year(day_date, today.year)
    next_occ = this_year if this_year >= today else _date_on_year(day_date, today.year + 1)
    days_to_next = (next_occ - today).days

    if this_year > today:
        # This year's anniversary still ahead
        days_left = (this_year - today).days
        anniversary_years = this_year.year - day_date.year
    elif this_year == today:
        days_left = 0
        anniversary_years = this_year.year - day_date.year
    else:
        # This year's anniversary already passed
        days_left = -(today - this_year).days
        anniversary_years = this_year.year - day_date.year

    return {
        "daysLeft": days_left,
        "daysToNext": days_to_next,
        "anniversaryYears": max(0, anniversary_years),
        "nextAnniversaryYears": max(0, next_occ.year - day_date.year),
        "totalDays": (today - day_date).days,
    }


def _serialize_day(row: dict) -> dict:
    day_date = row["day_date"]
    if isinstance(day_date, datetime):
        day_date = day_date.date()
    today = date.today()
    cycle = _anniversary_cycle(day_date, today)
    ctype = (row.get("calendar_type") or "solar").lower()
    return {
        "id": row["id"],
        "name": row["name"],
        "date": day_date.isoformat(),
        "calendarType": ctype if ctype in ("solar", "lunar") else "solar",
        "lunarMonth": row.get("lunar_month"),
        "lunarDay": row.get("lunar_day"),
        "lunarLeap": bool(row.get("lunar_leap")),
        "daysLeft": cycle["daysLeft"],
        "daysToNext": cycle["daysToNext"],
        "anniversaryYears": cycle["anniversaryYears"],
        "nextAnniversaryYears": cycle["nextAnniversaryYears"],
        "totalDays": cycle["totalDays"],
        "createdAt": _iso(row.get("created_at")),
        "updatedAt": _iso(row.get("updated_at")),
    }


@router.get("/days")
def list_days(user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM record_important_days WHERE user_id=%s",
                (user["id"],),
            )
            rows = cur.fetchall() or []
        items = [_serialize_day(r) for r in rows]

        def sort_key(item: dict):
            d = item["daysLeft"]
            if d == 0:
                return (0, 0)
            if d > 0:
                return (1, d)
            # Past this year's date: soonest next occurrence first
            return (2, int(item.get("daysToNext") or 0))

        items.sort(key=sort_key)
        return {"items": items}
    finally:
        conn.close()


@router.post("/days")
def create_day(body: DayCreateBody, user: dict = Depends(_user)):
    name = (body.name or "").strip()
    if not name or len(name) > NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid name")
    day_date = _parse_day_date(body.date)
    ctype, l_month, l_day, l_leap = _normalize_calendar_fields(
        body.calendarType, body.lunarMonth, body.lunarDay, body.lunarLeap
    )
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO record_important_days
                (user_id, name, day_date, calendar_type, lunar_month, lunar_day, lunar_leap)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (user["id"], name, day_date, ctype, l_month, l_day, l_leap),
            )
            new_id = cur.lastrowid
            cur.execute(
                "SELECT * FROM record_important_days WHERE id=%s AND user_id=%s",
                (new_id, user["id"]),
            )
            return _serialize_day(cur.fetchone())
    finally:
        conn.close()


@router.put("/days/{day_id}")
def update_day(day_id: int, body: DayUpdateBody, user: dict = Depends(_user)):
    name = (body.name or "").strip()
    if not name or len(name) > NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid name")
    day_date = _parse_day_date(body.date)
    ctype, l_month, l_day, l_leap = _normalize_calendar_fields(
        body.calendarType, body.lunarMonth, body.lunarDay, body.lunarLeap
    )
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE record_important_days
                SET name=%s, day_date=%s, calendar_type=%s,
                    lunar_month=%s, lunar_day=%s, lunar_leap=%s
                WHERE id=%s AND user_id=%s
                """,
                (name, day_date, ctype, l_month, l_day, l_leap, day_id, user["id"]),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Not found")
            cur.execute(
                "SELECT * FROM record_important_days WHERE id=%s",
                (day_id,),
            )
            return _serialize_day(cur.fetchone())
    finally:
        conn.close()


@router.delete("/days/{day_id}")
def delete_day(day_id: int, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM record_important_days WHERE id=%s AND user_id=%s",
                (day_id, user["id"]),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}
    finally:
        conn.close()


# ---------- Deposits ----------


class DepositCreateBody(BaseModel):
    name: str


class DepositTxnBody(BaseModel):
    type: str
    amount: str


def _serialize_deposit(row: dict, records: Optional[List[dict]] = None) -> dict:
    out = {
        "id": row["id"],
        "name": row["name"],
        "amount": _money(row["amount"]),
        "createdAt": _iso(row.get("created_at")),
        "updatedAt": _iso(row.get("updated_at")),
    }
    if records is not None:
        out["records"] = records
    return out


def _serialize_txn(row: dict) -> dict:
    return {
        "id": row["id"],
        "type": row["txn_type"],
        "amount": _money(row["amount"]),
        "balance": _money(row["balance"]),
        "time": _iso(row.get("created_at")),
    }


@router.get("/deposits")
def list_deposits(user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM record_deposits
                WHERE user_id=%s
                ORDER BY updated_at DESC, id DESC
                """,
                (user["id"],),
            )
            rows = cur.fetchall() or []
        return {"items": [_serialize_deposit(r) for r in rows]}
    finally:
        conn.close()


@router.post("/deposits")
def create_deposit(body: DepositCreateBody, user: dict = Depends(_user)):
    name = (body.name or "").strip()
    if not name or len(name) > NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid name")
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM record_deposits WHERE user_id=%s AND name=%s",
                (user["id"], name),
            )
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Name already exists")
            cur.execute(
                """
                INSERT INTO record_deposits (user_id, name, amount)
                VALUES (%s, %s, 0)
                """,
                (user["id"], name),
            )
            new_id = cur.lastrowid
            cur.execute("SELECT * FROM record_deposits WHERE id=%s", (new_id,))
            return _serialize_deposit(cur.fetchone(), records=[])
    finally:
        conn.close()


@router.get("/deposits/{deposit_id}")
def get_deposit(deposit_id: int, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM record_deposits WHERE id=%s AND user_id=%s",
                (deposit_id, user["id"]),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Not found")
            cur.execute(
                """
                SELECT * FROM record_deposit_txns
                WHERE deposit_id=%s AND user_id=%s
                ORDER BY id DESC
                LIMIT 200
                """,
                (deposit_id, user["id"]),
            )
            txns = cur.fetchall() or []
        return _serialize_deposit(row, [_serialize_txn(t) for t in txns])
    finally:
        conn.close()


@router.post("/deposits/{deposit_id}/txns")
def deposit_txn(deposit_id: int, body: DepositTxnBody, user: dict = Depends(_user)):
    txn_type = (body.type or "").strip().lower()
    if txn_type not in ("deposit", "withdraw"):
        raise HTTPException(status_code=400, detail="Invalid type")
    amount = _parse_money(body.amount)
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM record_deposits WHERE id=%s AND user_id=%s",
                (deposit_id, user["id"]),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Not found")
            balance = Decimal(str(row["amount"]))
            if txn_type == "deposit":
                new_balance = balance + amount
            else:
                if amount > balance:
                    raise HTTPException(status_code=400, detail="Insufficient balance")
                new_balance = balance - amount
            new_balance = new_balance.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            cur.execute(
                "UPDATE record_deposits SET amount=%s WHERE id=%s AND user_id=%s",
                (str(new_balance), deposit_id, user["id"]),
            )
            cur.execute(
                """
                INSERT INTO record_deposit_txns (deposit_id, user_id, txn_type, amount, balance)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (deposit_id, user["id"], txn_type, str(amount), str(new_balance)),
            )
            cur.execute("SELECT * FROM record_deposits WHERE id=%s", (deposit_id,))
            dep = cur.fetchone()
            cur.execute(
                """
                SELECT * FROM record_deposit_txns
                WHERE deposit_id=%s AND user_id=%s
                ORDER BY id DESC LIMIT 200
                """,
                (deposit_id, user["id"]),
            )
            txns = cur.fetchall() or []
        return _serialize_deposit(dep, [_serialize_txn(t) for t in txns])
    finally:
        conn.close()


@router.delete("/deposits/{deposit_id}")
def delete_deposit(deposit_id: int, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM record_deposits WHERE id=%s AND user_id=%s",
                (deposit_id, user["id"]),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}
    finally:
        conn.close()


# ---------- Rent collection ----------

RENT_DUE_DAY_MIN = 1
RENT_DUE_DAY_MAX = 31
RENT_PERIOD_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
# Bump when list paidAmount / integer display / due-day max must be live.
RENT_PAY_REV = 4
RENT_NOTE_MAX = 500
RENT_PAY_NOTE_MAX = 200


class RentCreateBody(BaseModel):
    title: str
    tenant_name: str = ""
    rent_amount: str
    due_day: int = 1
    note: str = ""


class RentUpdateBody(BaseModel):
    title: str
    tenant_name: str = ""
    rent_amount: str
    due_day: int = 1
    note: str = ""


class RentPaymentBody(BaseModel):
    period: str
    amount: Optional[str] = None
    note: str = ""


def _parse_due_day(raw: Any) -> int:
    try:
        day = int(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid due_day") from exc
    if day < RENT_DUE_DAY_MIN or day > RENT_DUE_DAY_MAX:
        raise HTTPException(status_code=400, detail="due_day must be 1–31")
    return day


def _parse_period(raw: Any) -> str:
    period = (str(raw or "")).strip()
    # Tolerate locale display like 2026年07月 if a client ever sends it.
    m = re.match(r"^(\d{4})\D+(\d{1,2})\D*$", period)
    if m:
        period = f"{int(m.group(1)):04d}-{int(m.group(2)):02d}"
    if not RENT_PERIOD_RE.match(period):
        raise HTTPException(status_code=400, detail="Invalid period (use YYYY-MM)")
    return period


def _current_period(today: Optional[date] = None) -> str:
    d = today or date.today()
    return f"{d.year:04d}-{d.month:02d}"


def _rent_status(due_day: int, paid_periods: set, today: Optional[date] = None) -> str:
    """paid | due | overdue for the current calendar month.

    Due days 29–31 clamp to the last day of shorter months (e.g. Feb).
    """
    d = today or date.today()
    period = _current_period(d)
    if period in paid_periods:
        return "paid"
    last = calendar.monthrange(d.year, d.month)[1]
    effective_due = min(max(int(due_day), 1), last)
    if d.day > effective_due:
        return "overdue"
    return "due"


def _serialize_rent_payment(row: dict) -> dict:
    return {
        "id": row["id"],
        "period": row["period"],
        "amount": _rent_money(row["amount"]),
        "note": row.get("note") or "",
        "time": _iso(row.get("created_at")),
    }


def _serialize_rent(
    row: dict,
    *,
    paid_periods: Optional[set] = None,
    payments: Optional[List[dict]] = None,
    paid_amount: Optional[str] = None,
    today: Optional[date] = None,
) -> dict:
    periods = paid_periods if paid_periods is not None else set()
    status = _rent_status(int(row["due_day"]), periods, today=today)
    period = _current_period(today)
    if paid_amount is None and payments:
        for pay in payments:
            if pay.get("period") == period:
                paid_amount = pay.get("amount")
                break
    out = {
        "id": row["id"],
        "title": row["title"],
        "tenantName": row.get("tenant_name") or "",
        "rentAmount": _rent_money(row["rent_amount"]),
        "dueDay": int(row["due_day"]),
        "note": row.get("note") or "",
        "status": status,
        "currentPeriod": period,
        "paidAmount": paid_amount,
        "createdAt": _iso(row.get("created_at")),
        "updatedAt": _iso(row.get("updated_at")),
    }
    if payments is not None:
        out["payments"] = payments
    return out


def _payment_amounts_for(cur, *, rent_id: int, user_id: int) -> dict:
    cur.execute(
        """
        SELECT period, amount FROM record_rent_payments
        WHERE rent_id=%s AND user_id=%s
        """,
        (rent_id, user_id),
    )
    return {(str(r["period"]) or "").strip(): _rent_money(r["amount"]) for r in (cur.fetchall() or [])}


def _paid_periods_for(cur, *, rent_id: int, user_id: int) -> set:
    return set(_payment_amounts_for(cur, rent_id=rent_id, user_id=user_id).keys())


@router.get("/rents")
def list_rents(user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM record_rents
                WHERE user_id=%s
                ORDER BY updated_at DESC, id DESC
                """,
                (user["id"],),
            )
            rows = cur.fetchall() or []
            items = []
            rank = {"overdue": 0, "due": 1, "paid": 2}
            period = _current_period()
            for row in rows:
                amounts = _payment_amounts_for(cur, rent_id=row["id"], user_id=user["id"])
                periods = set(amounts.keys())
                items.append(
                    _serialize_rent(
                        row,
                        paid_periods=periods,
                        paid_amount=amounts.get(period),
                    )
                )
            items.sort(key=lambda x: (rank.get(x["status"], 9), x["title"].lower()))
        return {"items": items}
    finally:
        conn.close()


@router.post("/rents")
def create_rent(body: RentCreateBody, user: dict = Depends(_user)):
    title = (body.title or "").strip()
    if not title or len(title) > NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid title")
    tenant = (body.tenant_name or "").strip()
    if len(tenant) > NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid tenant_name")
    amount = _parse_money(body.rent_amount, field="rent_amount").quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    due_day = _parse_due_day(body.due_day)
    note = (body.note or "").strip()
    if len(note) > RENT_NOTE_MAX:
        raise HTTPException(status_code=400, detail="note too long")
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO record_rents (user_id, title, tenant_name, rent_amount, due_day, note)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (user["id"], title, tenant, amount, due_day, note),
            )
            new_id = cur.lastrowid
            cur.execute("SELECT * FROM record_rents WHERE id=%s", (new_id,))
            return _serialize_rent(cur.fetchone(), paid_periods=set(), payments=[])
    finally:
        conn.close()


@router.get("/rents/{rent_id}")
def get_rent(rent_id: int, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM record_rents WHERE id=%s AND user_id=%s",
                (rent_id, user["id"]),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Not found")
            periods = _paid_periods_for(cur, rent_id=rent_id, user_id=user["id"])
            cur.execute(
                """
                SELECT * FROM record_rent_payments
                WHERE rent_id=%s AND user_id=%s
                ORDER BY period DESC, id DESC
                LIMIT 120
                """,
                (rent_id, user["id"]),
            )
            pays = [_serialize_rent_payment(p) for p in (cur.fetchall() or [])]
        return _serialize_rent(row, paid_periods=periods, payments=pays)
    finally:
        conn.close()


@router.put("/rents/{rent_id}")
def update_rent(rent_id: int, body: RentUpdateBody, user: dict = Depends(_user)):
    title = (body.title or "").strip()
    if not title or len(title) > NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid title")
    tenant = (body.tenant_name or "").strip()
    if len(tenant) > NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid tenant_name")
    amount = _parse_money(body.rent_amount, field="rent_amount").quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    due_day = _parse_due_day(body.due_day)
    note = (body.note or "").strip()
    if len(note) > RENT_NOTE_MAX:
        raise HTTPException(status_code=400, detail="note too long")
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE record_rents
                SET title=%s, tenant_name=%s, rent_amount=%s, due_day=%s, note=%s
                WHERE id=%s AND user_id=%s
                """,
                (title, tenant, amount, due_day, note, rent_id, user["id"]),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Not found")
            cur.execute(
                "SELECT * FROM record_rents WHERE id=%s AND user_id=%s",
                (rent_id, user["id"]),
            )
            row = cur.fetchone()
            periods = _paid_periods_for(cur, rent_id=rent_id, user_id=user["id"])
            cur.execute(
                """
                SELECT * FROM record_rent_payments
                WHERE rent_id=%s AND user_id=%s
                ORDER BY period DESC, id DESC
                LIMIT 120
                """,
                (rent_id, user["id"]),
            )
            pays = [_serialize_rent_payment(p) for p in (cur.fetchall() or [])]
        return _serialize_rent(row, paid_periods=periods, payments=pays)
    finally:
        conn.close()


@router.delete("/rents/{rent_id}")
def delete_rent(rent_id: int, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM record_rents WHERE id=%s AND user_id=%s",
                (rent_id, user["id"]),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}
    finally:
        conn.close()


@router.post("/rents/{rent_id}/payments")
def create_rent_payment(rent_id: int, body: RentPaymentBody, user: dict = Depends(_user)):
    """Create or update payment for a period (MySQL upsert)."""
    period = _parse_period(body.period)
    note = (body.note or "").strip()
    if len(note) > RENT_PAY_NOTE_MAX:
        raise HTTPException(status_code=400, detail="note too long")
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM record_rents WHERE id=%s AND user_id=%s",
                (rent_id, user["id"]),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Not found")
            if body.amount is None or str(body.amount).strip() == "":
                amount = Decimal(str(row["rent_amount"])).quantize(
                    Decimal("1"), rounding=ROUND_HALF_UP
                )
            else:
                amount = _parse_money(body.amount).quantize(
                    Decimal("1"), rounding=ROUND_HALF_UP
                )
            # Atomic upsert — avoids 400 when the same period is submitted again.
            cur.execute(
                """
                INSERT INTO record_rent_payments (rent_id, user_id, period, amount, note)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    amount=VALUES(amount),
                    note=VALUES(note),
                    user_id=VALUES(user_id)
                """,
                (rent_id, user["id"], period, amount, note),
            )
            cur.execute(
                "UPDATE record_rents SET updated_at=CURRENT_TIMESTAMP WHERE id=%s",
                (rent_id,),
            )
            periods = _paid_periods_for(cur, rent_id=rent_id, user_id=user["id"])
            cur.execute(
                """
                SELECT * FROM record_rent_payments
                WHERE rent_id=%s AND user_id=%s
                ORDER BY period DESC, id DESC
                LIMIT 120
                """,
                (rent_id, user["id"]),
            )
            pays = [_serialize_rent_payment(p) for p in (cur.fetchall() or [])]
            cur.execute(
                "SELECT * FROM record_rents WHERE id=%s AND user_id=%s",
                (rent_id, user["id"]),
            )
            row = cur.fetchone()
        return _serialize_rent(row, paid_periods=periods, payments=pays)
    finally:
        conn.close()


@router.delete("/rents/{rent_id}/payments/{payment_id}")
def delete_rent_payment(rent_id: int, payment_id: int, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM record_rent_payments
                WHERE id=%s AND rent_id=%s AND user_id=%s
                """,
                (payment_id, rent_id, user["id"]),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Not found")
            cur.execute(
                "UPDATE record_rents SET updated_at=CURRENT_TIMESTAMP WHERE id=%s AND user_id=%s",
                (rent_id, user["id"]),
            )
            cur.execute(
                "SELECT * FROM record_rents WHERE id=%s AND user_id=%s",
                (rent_id, user["id"]),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Not found")
            periods = _paid_periods_for(cur, rent_id=rent_id, user_id=user["id"])
            cur.execute(
                """
                SELECT * FROM record_rent_payments
                WHERE rent_id=%s AND user_id=%s
                ORDER BY period DESC, id DESC
                LIMIT 120
                """,
                (rent_id, user["id"]),
            )
            pays = [_serialize_rent_payment(p) for p in (cur.fetchall() or [])]
        return _serialize_rent(row, paid_periods=periods, payments=pays)
    finally:
        conn.close()


# ---------- Online card score (room code + poll) ----------

ONLINE_CODE_DIGITS = "0123456789"
ONLINE_CODE_LEN = 6
ONLINE_NAME_MAX = 80
ONLINE_PLAYER_NAME_MAX = 40
ONLINE_MAX_PLAYERS = 10
ONLINE_MAX_ROUNDS = 80
ONLINE_SCORE_ABS_MAX = 999999
ONLINE_DRAFT_REV = 3  # guest join + local seats + playerId score keys; max 10
ONLINE_GUEST_TOKEN_LEN = 32
ONLINE_PLAYER_KINDS = ("user", "guest", "local")


class OnlineGameCreateBody(BaseModel):
    name: str = ""
    display_name: str = ""


class OnlineGameJoinBody(BaseModel):
    code: str
    display_name: str = ""


class OnlineRoundBody(BaseModel):
    scores: Dict[str, int]


class OnlineDraftBody(BaseModel):
    """Partial draft scores. Null clears a player's draft entry."""

    scores: Dict[str, Optional[int]]


class OnlineLocalPlayerBody(BaseModel):
    display_name: str


def _ensure_online_player_schema(cur) -> None:
    """Migrate players table for guest/local seats (nullable user_id + kind + token)."""
    cur.execute(
        """
        SELECT COLUMN_NAME, IS_NULLABLE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'record_online_game_players'
        """
    )
    cols = {r["COLUMN_NAME"]: r for r in (cur.fetchall() or [])}
    if not cols:
        return
    if str((cols.get("user_id") or {}).get("IS_NULLABLE") or "").upper() == "NO":
        try:
            cur.execute(
                "ALTER TABLE record_online_game_players MODIFY COLUMN user_id BIGINT NULL"
            )
        except Exception as exc:
            print(f"[migrate] online user_id nullable: {exc}")
    if "player_kind" not in cols:
        try:
            cur.execute(
                """
                ALTER TABLE record_online_game_players
                ADD COLUMN player_kind VARCHAR(8) NOT NULL DEFAULT 'user'
                """
            )
        except Exception as exc:
            print(f"[migrate] online player_kind: {exc}")
    if "guest_token" not in cols:
        try:
            cur.execute(
                """
                ALTER TABLE record_online_game_players
                ADD COLUMN guest_token CHAR(32) NULL
                """
            )
        except Exception as exc:
            print(f"[migrate] online guest_token: {exc}")
    if "added_by" not in cols:
        try:
            cur.execute(
                """
                ALTER TABLE record_online_game_players
                ADD COLUMN added_by BIGINT NULL
                """
            )
        except Exception as exc:
            print(f"[migrate] online added_by: {exc}")
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'record_online_game_players'
          AND INDEX_NAME = 'uq_online_guest_token'
        """
    )
    if int((cur.fetchone() or {}).get("c") or 0) == 0:
        try:
            cur.execute(
                """
                CREATE UNIQUE INDEX uq_online_guest_token
                ON record_online_game_players (guest_token)
                """
            )
        except Exception as exc:
            print(f"[migrate] uq_online_guest_token: {exc}")


def _gen_online_code(cur) -> str:
    for _ in range(40):
        code = "".join(secrets.choice(ONLINE_CODE_DIGITS) for _ in range(ONLINE_CODE_LEN))
        cur.execute("SELECT id FROM record_online_games WHERE code=%s", (code,))
        if not cur.fetchone():
            return code
    raise HTTPException(status_code=500, detail="Could not allocate room code")


def _normalize_room_code(raw: Any) -> str:
    code = (str(raw or "")).strip().upper()
    # New rooms are 6 digits; still accept legacy alphanumeric codes.
    if not re.fullmatch(r"[A-Z0-9]{6}", code):
        raise HTTPException(status_code=400, detail="Invalid room code")
    return code


def _account_tail4(user: dict) -> str:
    """Last 4 digits of phone, else last 4 digits/chars of email local part."""
    phone = re.sub(r"\D", "", str((user or {}).get("phone") or ""))
    if len(phone) >= 4:
        return phone[-4:]
    email = str((user or {}).get("email") or "").strip()
    local = email.split("@", 1)[0] if email else ""
    digits = re.sub(r"\D", "", local)
    if len(digits) >= 4:
        return digits[-4:]
    if local:
        return local[-4:].rjust(4, "0")[-4:]
    return "0000"


def _parse_display_name(raw: Any, user: Optional[dict] = None) -> str:
    name = (str(raw or "")).strip()
    if not name and user is not None:
        name = _account_tail4(user)
    if not name or len(name) > ONLINE_PLAYER_NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid display_name")
    return name


def _default_room_name(display: str) -> str:
    # Product default is Chinese; clients may send a localized name explicitly.
    return f"{display}的房间"


def _player_kind(row: dict) -> str:
    kind = str((row or {}).get("player_kind") or "user").strip().lower()
    return kind if kind in ONLINE_PLAYER_KINDS else "user"


def _player_in_game(cur, *, game_id: int, user_id: int) -> Optional[dict]:
    cur.execute(
        """
        SELECT * FROM record_online_game_players
        WHERE game_id=%s AND user_id=%s
        """,
        (game_id, user_id),
    )
    return cur.fetchone()


def _player_by_id(cur, *, game_id: int, player_id: int) -> Optional[dict]:
    cur.execute(
        """
        SELECT * FROM record_online_game_players
        WHERE game_id=%s AND id=%s
        """,
        (game_id, player_id),
    )
    return cur.fetchone()


def _player_by_guest_token(cur, *, game_id: int, token: str) -> Optional[dict]:
    tok = (token or "").strip()
    if not tok:
        return None
    cur.execute(
        """
        SELECT * FROM record_online_game_players
        WHERE game_id=%s AND guest_token=%s
        """,
        (game_id, tok),
    )
    return cur.fetchone()


def _guest_token_from_request(request: Any) -> str:
    if request is None:
        return ""
    try:
        return (request.headers.get("X-OCS-Guest-Token") or "").strip()
    except Exception:
        return ""


def _optional_user_dep(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    getter = getattr(router, "get_optional_user", None)
    if not callable(getter):
        return None
    return getter(creds)


def _parse_score_map(raw: Any) -> Dict[str, int]:
    if not raw:
        return {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw or "{}")
        except json.JSONDecodeError:
            return {}
    if not isinstance(raw, dict):
        return {}
    clean: Dict[str, int] = {}
    for k, v in raw.items():
        try:
            n = int(v)
        except (TypeError, ValueError):
            continue
        if abs(n) > ONLINE_SCORE_ABS_MAX:
            continue
        clean[str(k)] = n
    return clean


def _remap_scores_to_player_ids(
    scores: Dict[str, int], players: List[dict]
) -> Dict[str, int]:
    """Map legacy user_id keys onto player row ids when needed."""
    pid_set = {str(p["id"]) for p in players}
    uid_to_pid = {
        str(p["user_id"]): str(p["id"])
        for p in players
        if p.get("user_id") is not None
    }
    out: Dict[str, int] = {}
    for k, v in scores.items():
        if k in pid_set:
            out[k] = v
        elif k in uid_to_pid:
            out[uid_to_pid[k]] = v
    return out


def _round_sum(scores: Dict[str, int]) -> int:
    return int(sum(scores.values()))


def _finalize_online_payload(
    data: dict,
    *,
    user: Optional[dict] = None,
    player: Optional[dict] = None,
    guest_token: str = "",
) -> dict:
    user_id = int((user or {}).get("id") or 0) if user else 0
    try:
        creator_id = int(data.get("creatorId") or 0)
    except (TypeError, ValueError):
        creator_id = 0
    data["viewerId"] = user_id or None
    data["viewerPlayerId"] = int(player["id"]) if player else None
    data["youAreIn"] = bool(player)
    data["isCreator"] = bool(user_id and creator_id == user_id)
    data["isGuestViewer"] = bool(player and _player_kind(player) == "guest")
    if guest_token and player and _player_kind(player) == "guest":
        data["guestToken"] = guest_token
    return data


def _try_settle_draft(
    cur,
    *,
    game: dict,
    player_ids: List[str],
    draft: Dict[str, int],
    actor_user_id: int,
) -> bool:
    """If every player has a draft score and sum is 0, commit a round and clear draft."""
    if not player_ids:
        return False
    if any(pid not in draft for pid in player_ids):
        return False
    clean = {pid: int(draft[pid]) for pid in player_ids}
    if _round_sum(clean) != 0:
        return False
    cur.execute(
        "SELECT COALESCE(MAX(round_no), 0) AS m FROM record_online_game_rounds WHERE game_id=%s",
        (game["id"],),
    )
    next_round = int((cur.fetchone() or {}).get("m") or 0) + 1
    if next_round > ONLINE_MAX_ROUNDS:
        raise HTTPException(status_code=400, detail="Too many rounds")
    created_by = int(actor_user_id or game["creator_id"])
    cur.execute(
        """
        INSERT INTO record_online_game_rounds (game_id, round_no, scores_json, created_by)
        VALUES (%s, %s, %s, %s)
        """,
        (game["id"], next_round, json.dumps(clean, ensure_ascii=False), created_by),
    )
    status = "playing" if game["status"] == "open" else game["status"]
    cur.execute(
        """
        UPDATE record_online_games
        SET draft_scores_json=NULL, status=%s, updated_at=CURRENT_TIMESTAMP
        WHERE id=%s
        """,
        (status, game["id"]),
    )
    return True


def _load_online_game(cur, game_id: int) -> dict:
    cur.execute("SELECT * FROM record_online_games WHERE id=%s", (game_id,))
    game = cur.fetchone()
    if not game:
        raise HTTPException(status_code=404, detail="Not found")
    cur.execute(
        """
        SELECT * FROM record_online_game_players
        WHERE game_id=%s
        ORDER BY joined_at ASC, id ASC
        """,
        (game_id,),
    )
    players = cur.fetchall() or []
    cur.execute(
        """
        SELECT * FROM record_online_game_rounds
        WHERE game_id=%s
        ORDER BY round_no ASC
        """,
        (game_id,),
    )
    round_rows = cur.fetchall() or []
    rounds = []
    totals: Dict[str, int] = {str(p["id"]): 0 for p in players}
    for row in round_rows:
        clean = _remap_scores_to_player_ids(
            _parse_score_map(row.get("scores_json")), players
        )
        for k, n in clean.items():
            if k in totals:
                totals[k] += n
        rounds.append(
            {
                "id": row["id"],
                "roundNo": int(row["round_no"]),
                "scores": clean,
                "sum": _round_sum(clean),
                "createdBy": row["created_by"],
                "createdAt": _iso(row.get("created_at")),
            }
        )
    draft = _remap_scores_to_player_ids(
        _parse_score_map(game.get("draft_scores_json")), players
    )
    player_ids = [str(p["id"]) for p in players]
    draft_ready = sum(1 for pid in player_ids if pid in draft)
    draft_complete = bool(player_ids) and draft_ready == len(player_ids)
    draft_sum = (
        _round_sum({pid: draft[pid] for pid in player_ids if pid in draft})
        if draft
        else 0
    )
    return {
        "id": game["id"],
        "code": game["code"],
        "name": game["name"],
        "status": game["status"],
        "creatorId": game["creator_id"],
        "createdAt": _iso(game.get("created_at")),
        "updatedAt": _iso(game.get("updated_at")),
        "players": [
            {
                "playerId": p["id"],
                "userId": p.get("user_id"),
                "playerKind": _player_kind(p),
                "displayName": p["display_name"],
                "joinedAt": _iso(p.get("joined_at")),
                "total": totals.get(str(p["id"]), 0),
                "hasDraft": str(p["id"]) in draft,
            }
            for p in players
        ],
        "rounds": rounds,
        "roundCount": len(rounds),
        "draftScores": draft,
        "draftReadyCount": draft_ready,
        "draftComplete": draft_complete,
        "draftSum": draft_sum,
        "canSettle": draft_complete and draft_sum == 0,
        "sumMismatch": draft_complete and draft_sum != 0,
        "maxPlayers": ONLINE_MAX_PLAYERS,
    }


def _resolve_online_access(
    cur,
    *,
    game_id: int,
    user: Optional[dict],
    guest_token: str = "",
) -> Tuple[dict, Optional[dict], Optional[dict]]:
    cur.execute("SELECT * FROM record_online_games WHERE id=%s", (game_id,))
    game = cur.fetchone()
    if not game:
        raise HTTPException(status_code=404, detail="Not found")
    player = None
    if user:
        player = _player_in_game(cur, game_id=game_id, user_id=user["id"])
    if not player and guest_token:
        player = _player_by_guest_token(cur, game_id=game_id, token=guest_token)
    if not player:
        raise HTTPException(status_code=404, detail="Not found")
    return game, user, player


@router.get("/online-games")
def list_online_games(user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT g.*
                FROM record_online_games g
                INNER JOIN record_online_game_players p ON p.game_id = g.id
                WHERE p.user_id=%s
                ORDER BY g.updated_at DESC, g.id DESC
                LIMIT 40
                """,
                (user["id"],),
            )
            rows = cur.fetchall() or []
            items = []
            for g in rows:
                cur.execute(
                    "SELECT COUNT(*) AS c FROM record_online_game_players WHERE game_id=%s",
                    (g["id"],),
                )
                pc = int((cur.fetchone() or {}).get("c") or 0)
                items.append(
                    {
                        "id": g["id"],
                        "code": g["code"],
                        "name": g["name"],
                        "status": g["status"],
                        "creatorId": g["creator_id"],
                        "isCreator": g["creator_id"] == user["id"],
                        "playerCount": pc,
                        "updatedAt": _iso(g.get("updated_at")),
                    }
                )
        return {"items": items}
    finally:
        conn.close()


@router.post("/online-games")
def create_online_game(body: OnlineGameCreateBody, user: dict = Depends(_user)):
    display = _parse_display_name(body.display_name, user)
    name = (body.name or "").strip() or _default_room_name(display)
    if len(name) > ONLINE_NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid name")
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_online_player_schema(cur)
            code = _gen_online_code(cur)
            cur.execute(
                """
                INSERT INTO record_online_games (code, name, creator_id, status)
                VALUES (%s, %s, %s, 'open')
                """,
                (code, name, user["id"]),
            )
            game_id = cur.lastrowid
            cur.execute(
                """
                INSERT INTO record_online_game_players
                    (game_id, user_id, display_name, player_kind)
                VALUES (%s, %s, %s, 'user')
                """,
                (game_id, user["id"], display),
            )
            player = _player_in_game(cur, game_id=game_id, user_id=user["id"])
            data = _finalize_online_payload(
                _load_online_game(cur, game_id), user=user, player=player
            )
        return data
    finally:
        conn.close()


@router.post("/online-games/join")
def join_online_game(
    body: OnlineGameJoinBody,
    request: Request,
    user: Optional[dict] = Depends(_optional_user_dep),
):
    code = _normalize_room_code(body.code)
    # Guests must provide a name; logged-in users may fall back to account tail.
    if user:
        display = _parse_display_name(body.display_name, user)
    else:
        display = _parse_display_name(body.display_name, None)
    guest_token = _guest_token_from_request(request)
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_online_player_schema(cur)
            cur.execute(
                "SELECT * FROM record_online_games WHERE code=%s ORDER BY id DESC LIMIT 1",
                (code,),
            )
            game = cur.fetchone()
            if not game:
                raise HTTPException(status_code=404, detail="Room not found")
            if game["status"] == "finished":
                raise HTTPException(status_code=400, detail="Game already finished")

            player = None
            out_guest_token = ""
            if user:
                player = _player_in_game(cur, game_id=game["id"], user_id=user["id"])
                if player:
                    cur.execute(
                        """
                        UPDATE record_online_game_players
                        SET display_name=%s
                        WHERE id=%s
                        """,
                        (display, player["id"]),
                    )
                else:
                    cur.execute(
                        "SELECT COUNT(*) AS c FROM record_online_game_players WHERE game_id=%s",
                        (game["id"],),
                    )
                    if int((cur.fetchone() or {}).get("c") or 0) >= ONLINE_MAX_PLAYERS:
                        raise HTTPException(status_code=400, detail="Room is full")
                    cur.execute(
                        """
                        INSERT INTO record_online_game_players
                            (game_id, user_id, display_name, player_kind)
                        VALUES (%s, %s, %s, 'user')
                        """,
                        (game["id"], user["id"], display),
                    )
                player = _player_in_game(cur, game_id=game["id"], user_id=user["id"])
            else:
                if guest_token:
                    player = _player_by_guest_token(
                        cur, game_id=game["id"], token=guest_token
                    )
                if player:
                    cur.execute(
                        """
                        UPDATE record_online_game_players
                        SET display_name=%s
                        WHERE id=%s
                        """,
                        (display, player["id"]),
                    )
                    out_guest_token = guest_token
                else:
                    cur.execute(
                        "SELECT COUNT(*) AS c FROM record_online_game_players WHERE game_id=%s",
                        (game["id"],),
                    )
                    if int((cur.fetchone() or {}).get("c") or 0) >= ONLINE_MAX_PLAYERS:
                        raise HTTPException(status_code=400, detail="Room is full")
                    out_guest_token = secrets.token_hex(ONLINE_GUEST_TOKEN_LEN // 2)
                    cur.execute(
                        """
                        INSERT INTO record_online_game_players
                            (game_id, user_id, display_name, player_kind, guest_token)
                        VALUES (%s, NULL, %s, 'guest', %s)
                        """,
                        (game["id"], display, out_guest_token),
                    )
                    player = _player_by_guest_token(
                        cur, game_id=game["id"], token=out_guest_token
                    )

            cur.execute(
                "UPDATE record_online_games SET updated_at=CURRENT_TIMESTAMP WHERE id=%s",
                (game["id"],),
            )
            data = _finalize_online_payload(
                _load_online_game(cur, game["id"]),
                user=user,
                player=player,
                guest_token=out_guest_token,
            )
        return data
    finally:
        conn.close()


@router.get("/online-games/{game_id}")
def get_online_game(
    game_id: int,
    request: Request,
    user: Optional[dict] = Depends(_optional_user_dep),
):
    guest_token = _guest_token_from_request(request)
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_online_player_schema(cur)
            _game, user, player = _resolve_online_access(
                cur, game_id=game_id, user=user, guest_token=guest_token
            )
            data = _finalize_online_payload(
                _load_online_game(cur, game_id),
                user=user,
                player=player,
                guest_token=guest_token if player and _player_kind(player) == "guest" else "",
            )
        return data
    finally:
        conn.close()


def _apply_draft_scores(
    cur,
    *,
    game_id: int,
    user: Optional[dict],
    player: dict,
    raw_scores: Dict[str, Any],
) -> dict:
    cur.execute("SELECT * FROM record_online_games WHERE id=%s", (game_id,))
    game = cur.fetchone()
    if not game:
        raise HTTPException(status_code=404, detail="Not found")
    if game["status"] == "finished":
        raise HTTPException(status_code=400, detail="Game already finished")
    cur.execute(
        "SELECT * FROM record_online_game_players WHERE game_id=%s",
        (game_id,),
    )
    players = cur.fetchall() or []
    player_ids = [str(p["id"]) for p in players]
    player_set = set(player_ids)
    kind_by_id = {str(p["id"]): _player_kind(p) for p in players}
    is_creator = bool(user and game["creator_id"] == user["id"])
    own_pid = str(player["id"])
    draft = _remap_scores_to_player_ids(
        _parse_score_map(game.get("draft_scores_json")), players
    )
    for pid, val in (raw_scores or {}).items():
        key = str(pid)
        if key not in player_set:
            raise HTTPException(status_code=400, detail="Unknown player")
        if not is_creator and key != own_pid:
            raise HTTPException(status_code=403, detail="Only host can edit others")
        if is_creator and kind_by_id.get(key) == "guest" and key != own_pid:
            # Host may fill guests who are away; allowed.
            pass
        if val is None:
            draft.pop(key, None)
            continue
        try:
            n = int(val)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Invalid score") from exc
        if abs(n) > ONLINE_SCORE_ABS_MAX:
            raise HTTPException(status_code=400, detail="Score too large")
        draft[key] = n
    actor_user_id = int(user["id"]) if user else int(game["creator_id"])
    settled = _try_settle_draft(
        cur,
        game=game,
        player_ids=player_ids,
        draft=draft,
        actor_user_id=actor_user_id,
    )
    if not settled:
        cur.execute(
            """
            UPDATE record_online_games
            SET draft_scores_json=%s, updated_at=CURRENT_TIMESTAMP
            WHERE id=%s
            """,
            (json.dumps(draft, ensure_ascii=False) if draft else None, game_id),
        )
    data = _finalize_online_payload(
        _load_online_game(cur, game_id), user=user, player=player
    )
    data["settled"] = settled
    return data


@router.post("/online-games/{game_id}/draft-scores")
def upsert_online_draft(
    game_id: int,
    body: OnlineDraftBody,
    request: Request,
    user: Optional[dict] = Depends(_optional_user_dep),
):
    guest_token = _guest_token_from_request(request)
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_online_player_schema(cur)
            _game, user, player = _resolve_online_access(
                cur, game_id=game_id, user=user, guest_token=guest_token
            )
            return _apply_draft_scores(
                cur,
                game_id=game_id,
                user=user,
                player=player,
                raw_scores=body.scores or {},
            )
    finally:
        conn.close()


@router.post("/online-games/{game_id}/rounds")
def add_online_round(
    game_id: int,
    body: OnlineRoundBody,
    request: Request,
    user: Optional[dict] = Depends(_optional_user_dep),
):
    """Backward-compatible alias: treat as draft upsert (host may send all). """
    guest_token = _guest_token_from_request(request)
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_online_player_schema(cur)
            _game, user, player = _resolve_online_access(
                cur, game_id=game_id, user=user, guest_token=guest_token
            )
            return _apply_draft_scores(
                cur,
                game_id=game_id,
                user=user,
                player=player,
                raw_scores=body.scores or {},
            )
    finally:
        conn.close()


@router.post("/online-games/{game_id}/players")
def add_local_online_player(
    game_id: int, body: OnlineLocalPlayerBody, user: dict = Depends(_user)
):
    display = _parse_display_name(body.display_name, None)
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_online_player_schema(cur)
            cur.execute("SELECT * FROM record_online_games WHERE id=%s", (game_id,))
            game = cur.fetchone()
            if not game:
                raise HTTPException(status_code=404, detail="Not found")
            if game["creator_id"] != user["id"]:
                raise HTTPException(status_code=403, detail="Only creator can add local")
            if game["status"] == "finished":
                raise HTTPException(status_code=400, detail="Game already finished")
            if not _player_in_game(cur, game_id=game_id, user_id=user["id"]):
                raise HTTPException(status_code=404, detail="Not found")
            cur.execute(
                "SELECT COUNT(*) AS c FROM record_online_game_players WHERE game_id=%s",
                (game_id,),
            )
            if int((cur.fetchone() or {}).get("c") or 0) >= ONLINE_MAX_PLAYERS:
                raise HTTPException(status_code=400, detail="Room is full")
            cur.execute(
                """
                INSERT INTO record_online_game_players
                    (game_id, user_id, display_name, player_kind, added_by)
                VALUES (%s, NULL, %s, 'local', %s)
                """,
                (game_id, display, user["id"]),
            )
            cur.execute(
                "UPDATE record_online_games SET updated_at=CURRENT_TIMESTAMP WHERE id=%s",
                (game_id,),
            )
            player = _player_in_game(cur, game_id=game_id, user_id=user["id"])
            data = _finalize_online_payload(
                _load_online_game(cur, game_id), user=user, player=player
            )
        return data
    finally:
        conn.close()


@router.delete("/online-games/{game_id}/players/{player_id}")
def remove_local_online_player(
    game_id: int, player_id: int, user: dict = Depends(_user)
):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_online_player_schema(cur)
            cur.execute("SELECT * FROM record_online_games WHERE id=%s", (game_id,))
            game = cur.fetchone()
            if not game:
                raise HTTPException(status_code=404, detail="Not found")
            if game["creator_id"] != user["id"]:
                raise HTTPException(
                    status_code=403, detail="Only creator can remove local"
                )
            if game["status"] == "finished":
                raise HTTPException(status_code=400, detail="Game already finished")
            target = _player_by_id(cur, game_id=game_id, player_id=player_id)
            if not target or _player_kind(target) != "local":
                raise HTTPException(status_code=400, detail="Not a local player")
            cur.execute(
                "DELETE FROM record_online_game_players WHERE id=%s AND game_id=%s",
                (player_id, game_id),
            )
            # Drop draft keys for removed seat.
            players = []
            cur.execute(
                "SELECT * FROM record_online_game_players WHERE game_id=%s", (game_id,)
            )
            players = cur.fetchall() or []
            draft = _remap_scores_to_player_ids(
                _parse_score_map(game.get("draft_scores_json")),
                players + [target],
            )
            draft.pop(str(player_id), None)
            # Remap remaining against live players only
            draft = _remap_scores_to_player_ids(draft, players)
            cur.execute(
                """
                UPDATE record_online_games
                SET draft_scores_json=%s, updated_at=CURRENT_TIMESTAMP
                WHERE id=%s
                """,
                (json.dumps(draft, ensure_ascii=False) if draft else None, game_id),
            )
            player = _player_in_game(cur, game_id=game_id, user_id=user["id"])
            data = _finalize_online_payload(
                _load_online_game(cur, game_id), user=user, player=player
            )
        return data
    finally:
        conn.close()


@router.post("/online-games/{game_id}/finish")
def finish_online_game(game_id: int, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM record_online_games WHERE id=%s", (game_id,))
            game = cur.fetchone()
            if not game:
                raise HTTPException(status_code=404, detail="Not found")
            if game["creator_id"] != user["id"]:
                raise HTTPException(status_code=403, detail="Only creator can finish")
            if not _player_in_game(cur, game_id=game_id, user_id=user["id"]):
                raise HTTPException(status_code=404, detail="Not found")
            cur.execute(
                """
                UPDATE record_online_games
                SET status='finished', updated_at=CURRENT_TIMESTAMP
                WHERE id=%s
                """,
                (game_id,),
            )
            player = _player_in_game(cur, game_id=game_id, user_id=user["id"])
            data = _finalize_online_payload(
                _load_online_game(cur, game_id), user=user, player=player
            )
        return data
    finally:
        conn.close()


def _delete_online_game(cur, *, game_id: int, user: dict) -> dict:
    cur.execute("SELECT * FROM record_online_games WHERE id=%s", (game_id,))
    game = cur.fetchone()
    if not game:
        raise HTTPException(status_code=404, detail="Not found")
    if game["creator_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only creator can delete")
    cur.execute("DELETE FROM record_online_games WHERE id=%s", (game_id,))
    return {"ok": True, "id": game_id}


@router.post("/online-games/{game_id}/delete")
def delete_online_game_post(game_id: int, user: dict = Depends(_user)):
    """POST delete — more reliable behind proxies that block HTTP DELETE."""
    conn = _conn()
    try:
        with conn.cursor() as cur:
            return _delete_online_game(cur, game_id=game_id, user=user)
    finally:
        conn.close()


@router.delete("/online-games/{game_id}")
def delete_online_game(game_id: int, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            return _delete_online_game(cur, game_id=game_id, user=user)
    finally:
        conn.close()


# ---------- Goods categories & goods ----------


class CategoryCreateBody(BaseModel):
    name: str
    parent_id: Optional[int] = None


class CategoryUpdateBody(BaseModel):
    name: str
    parent_id: Optional[int] = None


class GoodCreateBody(BaseModel):
    name: str
    category_id: int
    price: str
    rating: Optional[str] = None
    remark: str = ""


class GoodUpdateBody(BaseModel):
    name: str
    category_id: int
    price: str
    rating: Optional[str] = None
    remark: str = ""


def _serialize_category(row: dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "parentId": row["parent_id"],
        "createdAt": _iso(row.get("created_at")),
    }


def _serialize_good(row: dict) -> dict:
    rating = row.get("rating")
    label = (row.get("price_label") or "").strip()
    price_display = label if label else _money(row["price"])
    rating_out = None
    if rating is not None:
        rd = Decimal(str(rating))
        rating_out = int(rd) if rd == rd.to_integral_value() else float(rd)
    return {
        "id": row["id"],
        "name": row["name"],
        "categoryId": row["category_id"],
        "category": row["category_name"],
        "price": price_display,
        "rating": rating_out,
        "remark": row.get("remark") or "",
        "createdAt": _iso(row.get("created_at")),
        "updatedAt": _iso(row.get("updated_at")),
    }


def _category_label(cur, user_id: int, category_id: int) -> tuple:
    cur.execute(
        "SELECT * FROM record_goods_categories WHERE id=%s AND user_id=%s",
        (category_id, user_id),
    )
    cat = cur.fetchone()
    if not cat:
        raise HTTPException(status_code=400, detail="Category not found")
    if cat["parent_id"]:
        cur.execute(
            "SELECT * FROM record_goods_categories WHERE id=%s AND user_id=%s",
            (cat["parent_id"], user_id),
        )
        parent = cur.fetchone()
        if parent:
            return cat, f"{parent['name']} > {cat['name']}"
    return cat, cat["name"]


@router.get("/goods/categories")
def list_categories(user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM record_goods_categories
                WHERE user_id=%s
                ORDER BY parent_id IS NOT NULL, name ASC, id ASC
                """,
                (user["id"],),
            )
            rows = cur.fetchall() or []
        return {"items": [_serialize_category(r) for r in rows]}
    finally:
        conn.close()


@router.post("/goods/categories")
def create_category(body: CategoryCreateBody, user: dict = Depends(_user)):
    name = (body.name or "").strip()
    if not name or len(name) > CATEGORY_NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid name")
    parent_id = body.parent_id
    conn = _conn()
    try:
        with conn.cursor() as cur:
            if parent_id:
                cur.execute(
                    """
                    SELECT id, parent_id FROM record_goods_categories
                    WHERE id=%s AND user_id=%s
                    """,
                    (parent_id, user["id"]),
                )
                parent = cur.fetchone()
                if not parent:
                    raise HTTPException(status_code=400, detail="Parent category not found")
                if parent["parent_id"]:
                    raise HTTPException(status_code=400, detail="Only one level of nesting is allowed")
            cur.execute(
                """
                INSERT INTO record_goods_categories (user_id, name, parent_id)
                VALUES (%s, %s, %s)
                """,
                (user["id"], name, parent_id),
            )
            new_id = cur.lastrowid
            cur.execute("SELECT * FROM record_goods_categories WHERE id=%s", (new_id,))
            return _serialize_category(cur.fetchone())
    finally:
        conn.close()


@router.put("/goods/categories/{category_id}")
def update_category(category_id: int, body: CategoryUpdateBody, user: dict = Depends(_user)):
    name = (body.name or "").strip()
    if not name or len(name) > CATEGORY_NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid name")
    if body.parent_id == category_id:
        raise HTTPException(status_code=400, detail="Invalid parent")
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM record_goods_categories WHERE id=%s AND user_id=%s",
                (category_id, user["id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Not found")
            parent_id = body.parent_id
            if parent_id:
                cur.execute(
                    """
                    SELECT id, parent_id FROM record_goods_categories
                    WHERE id=%s AND user_id=%s
                    """,
                    (parent_id, user["id"]),
                )
                parent = cur.fetchone()
                if not parent:
                    raise HTTPException(status_code=400, detail="Parent category not found")
                if parent["parent_id"]:
                    raise HTTPException(status_code=400, detail="Only one level of nesting is allowed")
            cur.execute(
                """
                UPDATE record_goods_categories SET name=%s, parent_id=%s
                WHERE id=%s AND user_id=%s
                """,
                (name, parent_id, category_id, user["id"]),
            )
            # Refresh denormalized labels on goods that use this category
            # or one of its children.
            cur.execute(
                """
                SELECT id FROM record_goods_categories
                WHERE user_id=%s AND (id=%s OR parent_id=%s)
                """,
                (user["id"], category_id, category_id),
            )
            affected = [r["id"] for r in (cur.fetchall() or [])]
            for cid in affected:
                _, label = _category_label(cur, user["id"], cid)
                cur.execute(
                    """
                    UPDATE record_goods SET category_name=%s
                    WHERE user_id=%s AND category_id=%s
                    """,
                    (label, user["id"], cid),
                )
            cur.execute("SELECT * FROM record_goods_categories WHERE id=%s", (category_id,))
            return _serialize_category(cur.fetchone())
    finally:
        conn.close()


@router.delete("/goods/categories/{category_id}")
def delete_category(category_id: int, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM record_goods WHERE category_id=%s AND user_id=%s LIMIT 1",
                (category_id, user["id"]),
            )
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Category is in use")
            cur.execute(
                """
                SELECT id FROM record_goods_categories
                WHERE parent_id=%s AND user_id=%s LIMIT 1
                """,
                (category_id, user["id"]),
            )
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Category has children")
            cur.execute(
                "DELETE FROM record_goods_categories WHERE id=%s AND user_id=%s",
                (category_id, user["id"]),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}
    finally:
        conn.close()


def _parse_optional_rating(raw: Optional[str]) -> Optional[Decimal]:
    if raw is None or str(raw).strip() == "":
        return None
    text = str(raw).strip()
    if not re.fullmatch(r"[0-5]", text):
        raise HTTPException(status_code=400, detail="Rating must be an integer from 0 to 5")
    return Decimal(text)


def _parse_goods_price(raw: Any) -> Tuple[str, Decimal]:
    """Single positive number, at most 2 decimal places. Returns (label, value)."""
    text = str(raw or "").strip()
    if not text or not re.fullmatch(r"\d+(\.\d{1,2})?", text):
        raise HTTPException(status_code=400, detail="Invalid price")
    try:
        d = Decimal(text)
    except (InvalidOperation, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid price") from exc
    if d <= 0:
        raise HTTPException(status_code=400, detail="price must be greater than 0")
    if d > GOODS_PRICE_MAX:
        raise HTTPException(status_code=400, detail="price is too large")
    value = d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    label = f"{value:.2f}".rstrip("0").rstrip(".")
    return label or "0", value


@router.get("/goods")
def list_goods(
    q: str = "",
    category_id: int = 0,
    parent_category_id: int = 0,
    sort: str = "rating",
    order: str = "desc",
    page: int = 1,
    page_size: int = 50,
    user: dict = Depends(_user),
):
    page = max(1, page)
    page_size = min(100, max(1, page_size))
    sort_map = {
        "rating": "rating",
        "price": "price",
        "name": "name",
        "updated_at": "updated_at",
    }
    sort_col = sort_map.get(sort, "rating")
    order_sql = "ASC" if order.lower() == "asc" else "DESC"
    conn = _conn()
    try:
        with conn.cursor() as cur:
            where = ["user_id=%s"]
            params: List[Any] = [user["id"]]
            keyword = (q or "").strip()
            if keyword:
                where.append("(name LIKE %s OR remark LIKE %s OR category_name LIKE %s)")
                like = f"%{keyword}%"
                params.extend([like, like, like])
            if category_id > 0:
                where.append("category_id=%s")
                params.append(category_id)
            elif parent_category_id > 0:
                where.append(
                    """
                    (category_id=%s OR category_id IN (
                        SELECT id FROM record_goods_categories
                        WHERE parent_id=%s AND user_id=%s
                    ))
                    """
                )
                params.extend([parent_category_id, parent_category_id, user["id"]])
            where_sql = " AND ".join(where)
            cur.execute(
                f"SELECT COUNT(*) AS c FROM record_goods WHERE {where_sql}",
                params,
            )
            total = int(cur.fetchone()["c"])
            offset = (page - 1) * page_size
            # NULL ratings last when sorting by rating desc
            nulls = "ISNULL(rating)," if sort_col == "rating" else ""
            cur.execute(
                f"""
                SELECT * FROM record_goods
                WHERE {where_sql}
                ORDER BY {nulls} {sort_col} {order_sql}, id DESC
                LIMIT %s OFFSET %s
                """,
                params + [page_size, offset],
            )
            rows = cur.fetchall() or []
        return {
            "items": [_serialize_good(r) for r in rows],
            "total": total,
            "page": page,
            "pageSize": page_size,
        }
    finally:
        conn.close()


@router.post("/goods")
def create_good(body: GoodCreateBody, user: dict = Depends(_user)):
    name = (body.name or "").strip()
    if not name or len(name) > NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid name")
    remark = (body.remark or "").strip()
    if len(remark) > REMARK_MAX:
        raise HTTPException(status_code=400, detail="Remark too long")
    price_label, price = _parse_goods_price(body.price)
    rating = _parse_optional_rating(body.rating)
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _, label = _category_label(cur, user["id"], body.category_id)
            cur.execute(
                """
                INSERT INTO record_goods
                (user_id, name, category_id, category_name, price, price_label, rating, remark)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user["id"],
                    name,
                    body.category_id,
                    label,
                    str(price),
                    price_label,
                    None if rating is None else str(rating),
                    remark,
                ),
            )
            new_id = cur.lastrowid
            cur.execute("SELECT * FROM record_goods WHERE id=%s", (new_id,))
            return _serialize_good(cur.fetchone())
    finally:
        conn.close()


@router.put("/goods/{good_id}")
def update_good(good_id: int, body: GoodUpdateBody, user: dict = Depends(_user)):
    name = (body.name or "").strip()
    if not name or len(name) > NAME_MAX:
        raise HTTPException(status_code=400, detail="Invalid name")
    remark = (body.remark or "").strip()
    if len(remark) > REMARK_MAX:
        raise HTTPException(status_code=400, detail="Remark too long")
    price_label, price = _parse_goods_price(body.price)
    rating = _parse_optional_rating(body.rating)
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM record_goods WHERE id=%s AND user_id=%s",
                (good_id, user["id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Not found")
            _, label = _category_label(cur, user["id"], body.category_id)
            cur.execute(
                """
                UPDATE record_goods
                SET name=%s, category_id=%s, category_name=%s, price=%s, price_label=%s,
                    rating=%s, remark=%s
                WHERE id=%s AND user_id=%s
                """,
                (
                    name,
                    body.category_id,
                    label,
                    str(price),
                    price_label,
                    None if rating is None else str(rating),
                    remark,
                    good_id,
                    user["id"],
                ),
            )
            cur.execute("SELECT * FROM record_goods WHERE id=%s", (good_id,))
            return _serialize_good(cur.fetchone())
    finally:
        conn.close()


@router.delete("/goods/{good_id}")
def delete_good(good_id: int, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM record_goods WHERE id=%s AND user_id=%s",
                (good_id, user["id"]),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}
    finally:
        conn.close()


# ----- todos -----


class TodoCreateBody(BaseModel):
    text: str
    status: str = "pending"


class TodoUpdateBody(BaseModel):
    text: str
    status: str


def _normalize_todo_status(raw: str) -> str:
    s = (raw or "").strip().lower()
    # Legacy "doing" maps to pending after removing in-progress.
    if s == "doing":
        return "pending"
    if s not in TODO_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    return s


def _normalize_todo_text(raw: str) -> str:
    text = (raw or "").strip()
    if not text or len(text) > TODO_TEXT_MAX:
        raise HTTPException(status_code=400, detail="Invalid text")
    return text


def _serialize_todo(row: dict) -> dict:
    status = row["status"]
    if status == "doing":
        status = "pending"
    return {
        "id": row["id"],
        "text": row["content"],
        "status": status,
        "createdAt": _iso(row.get("created_at")),
        "updatedAt": _iso(row.get("updated_at")),
    }


@router.get("/todos")
def list_todos(user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE record_todos SET status='pending'
                WHERE user_id=%s AND status='doing'
                """,
                (user["id"],),
            )
            cur.execute(
                """
                SELECT * FROM record_todos
                WHERE user_id=%s
                ORDER BY
                  FIELD(status, 'pending', 'done'),
                  updated_at DESC, id DESC
                """,
                (user["id"],),
            )
            rows = cur.fetchall() or []
        return {"items": [_serialize_todo(r) for r in rows]}
    finally:
        conn.close()


@router.post("/todos")
def create_todo(body: TodoCreateBody, user: dict = Depends(_user)):
    text = _normalize_todo_text(body.text)
    status = _normalize_todo_status(body.status)
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO record_todos (user_id, content, status) VALUES (%s, %s, %s)",
                (user["id"], text, status),
            )
            new_id = cur.lastrowid
            cur.execute(
                "SELECT * FROM record_todos WHERE id=%s AND user_id=%s",
                (new_id, user["id"]),
            )
            return _serialize_todo(cur.fetchone())
    finally:
        conn.close()


@router.post("/todos/clear-done")
def clear_done_todos(user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM record_todos WHERE user_id=%s AND status='done'",
                (user["id"],),
            )
            deleted = int(cur.rowcount or 0)
        return {"ok": True, "deleted": deleted}
    finally:
        conn.close()


@router.put("/todos/{todo_id}")
def update_todo(todo_id: int, body: TodoUpdateBody, user: dict = Depends(_user)):
    text = _normalize_todo_text(body.text)
    status = _normalize_todo_status(body.status)
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE record_todos SET content=%s, status=%s
                WHERE id=%s AND user_id=%s
                """,
                (text, status, todo_id, user["id"]),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Not found")
            cur.execute(
                "SELECT * FROM record_todos WHERE id=%s AND user_id=%s",
                (todo_id, user["id"]),
            )
            return _serialize_todo(cur.fetchone())
    finally:
        conn.close()


@router.delete("/todos/{todo_id}")
def delete_todo(todo_id: int, user: dict = Depends(_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM record_todos WHERE id=%s AND user_id=%s",
                (todo_id, user["id"]),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}
    finally:
        conn.close()
