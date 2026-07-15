"""Private per-user record tools: clocks, important days, deposits, goods."""

from __future__ import annotations

import re
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

security = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/records", tags=["records"])

NAME_MAX = 80
REMARK_MAX = 500
CATEGORY_NAME_MAX = 40
GOODS_PRICE_LABEL_MAX = 40
CLOCK_TARGET_MAX = 999999
CHECKIN_MAX = 999
CLOCK_LOG_LIMIT = 100
DEPOSIT_AMOUNT_MAX = Decimal("99999999.99")
GOODS_PRICE_MAX = Decimal("99999999.99")


def _wire(get_conn, require_db, get_current_user):
    """Bind shared helpers from main (avoids circular import at module load)."""
    router.get_conn = get_conn  # type: ignore[attr-defined]
    router.require_db = require_db  # type: ignore[attr-defined]
    router.get_current_user = get_current_user  # type: ignore[attr-defined]


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
