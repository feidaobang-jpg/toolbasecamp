"""同学专区 · 六合彩统计（白名单 + 管理员）。"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

router = APIRouter(prefix="/mark-six", tags=["mark-six"])
security = HTTPBearer(auto_error=False)

_get_conn: Optional[Callable[..., Any]] = None
_require_db: Optional[Callable[[], None]] = None
_get_current_user: Optional[Callable[..., Any]] = None
_require_admin: Optional[Callable[[dict], None]] = None
_is_admin: Optional[Callable[[dict], bool]] = None

try:
    _CN_TZ = ZoneInfo("Asia/Shanghai")
except Exception:
    _CN_TZ = timezone(timedelta(hours=8))
_DEFAULT_ODDS = 47.0
_PHONE_RE = re.compile(r"^1\d{10}$")

# 生肖十二地支顺序（向前）；六合彩号码按「本命年 → 上一年…」倒序排布
_ZODIAC_CYCLE = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"]

# 农历春节公历日期（月, 日）。到年限前可再往后补几行即可。
_CNY_MD: Dict[int, tuple] = {
    2020: (1, 25),
    2021: (2, 12),
    2022: (2, 1),
    2023: (1, 22),
    2024: (2, 10),
    2025: (1, 29),
    2026: (2, 17),
    2027: (2, 6),
    2028: (1, 26),
    2029: (2, 13),
    2030: (2, 3),
    2031: (1, 23),
    2032: (2, 11),
    2033: (1, 31),
    2034: (2, 19),
    2035: (2, 8),
    2036: (1, 28),
    2037: (2, 15),
    2038: (2, 4),
    2039: (1, 24),
    2040: (2, 12),
    2041: (2, 1),
    2042: (1, 22),
    2043: (2, 10),
    2044: (1, 30),
    2045: (2, 17),
    2046: (2, 6),
    2047: (1, 26),
    2048: (2, 14),
    2049: (2, 2),
    2050: (1, 23),
}

# 波色固定，不随年份变（与对照表一致）
WAVE_GROUPS: Dict[str, List[int]] = {
    "红波": [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
    "蓝波": [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
    "绿波": [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49],
    "红单": [1, 7, 13, 19, 23, 29, 35, 45],
    "红双": [2, 8, 12, 18, 24, 30, 34, 40, 46],
    "蓝单": [3, 9, 15, 25, 31, 37, 41, 47],
    "蓝双": [4, 10, 14, 20, 26, 36, 42, 48],
    "绿单": [5, 11, 17, 21, 27, 33, 39, 43, 49],
    "绿双": [6, 16, 22, 28, 32, 38, 44],
}

WAVE_MAP: Dict[str, str] = {}
for w in ("红波", "蓝波", "绿波"):
    for n in WAVE_GROUPS[w]:
        WAVE_MAP[str(n)] = w

WAVE_LIST = ["红波", "蓝波", "绿波"]
WAVE_PARITY_LIST = ["红单", "红双", "蓝单", "蓝双", "绿单", "绿双"]
WAVE_SELECT_LIST = WAVE_LIST + WAVE_PARITY_LIST

_zodiac_cache: Dict[str, Any] = {"key": "", "map": {}, "list": [], "year_animal": "", "lunar_year": 0}


def _animal_for_lunar_year(lunar_year: int) -> str:
    # 2020=鼠；(Y+8)%12 与地支对齐
    return _ZODIAC_CYCLE[(lunar_year + 8) % 12]


def _lunar_year_for_date(dt: datetime) -> int:
    """北京时间日期所属农历生肖年（以春节为界）。"""
    y, m, d = dt.year, dt.month, dt.day
    cny = _CNY_MD.get(y)
    if cny:
        return y if (m, d) >= cny else y - 1
    # 表外年份：春节落在 1/21–2/20，粗分界（建议补表）
    if m > 2 or (m == 2 and d > 20):
        return y
    if m == 1 and d < 21:
        return y - 1
    return y


def build_zodiac_for_animal(year_animal: str) -> tuple[Dict[str, str], List[str]]:
    """本命年生肖占 1/13/25/37/49，其余按生肖倒序。"""
    if year_animal not in _ZODIAC_CYCLE:
        raise ValueError(f"unknown zodiac: {year_animal}")
    idx = _ZODIAC_CYCLE.index(year_animal)
    order = [_ZODIAC_CYCLE[(idx - i) % 12] for i in range(12)]
    zmap: Dict[str, str] = {}
    for i, z in enumerate(order):
        nums = [i + 1, i + 13, i + 25, i + 37]
        if i + 49 <= 49:
            nums.append(i + 49)
        for n in nums:
            zmap[str(n)] = z
    return zmap, order


def current_zodiac(now: Optional[datetime] = None) -> Dict[str, Any]:
    """按当前北京时间返回生肖映射（按日缓存）。"""
    if now is None:
        now = datetime.now(_CN_TZ)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=_CN_TZ)
    else:
        now = now.astimezone(_CN_TZ)
    key = now.strftime("%Y-%m-%d")
    if _zodiac_cache["key"] == key and _zodiac_cache["map"]:
        return _zodiac_cache
    lunar_year = _lunar_year_for_date(now)
    animal = _animal_for_lunar_year(lunar_year)
    zmap, zlist = build_zodiac_for_animal(animal)
    _zodiac_cache.update(
        {
            "key": key,
            "map": zmap,
            "list": zlist,
            "year_animal": animal,
            "lunar_year": lunar_year,
        }
    )
    return _zodiac_cache


def wire(
    get_conn: Callable[..., Any],
    require_db: Callable[[], None],
    get_current_user: Callable[..., Any],
    require_admin: Callable[[dict], None],
    is_admin: Callable[[dict], bool],
) -> None:
    global _get_conn, _require_db, _get_current_user, _require_admin, _is_admin
    _get_conn = get_conn
    _require_db = require_db
    _get_current_user = get_current_user
    _require_admin = require_admin
    _is_admin = is_admin


def ensure_mark_six_tables(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS mark_six_members (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            phone VARCHAR(32) NOT NULL,
            note VARCHAR(128) NULL,
            created_by BIGINT NULL,
            created_at DATETIME NOT NULL,
            UNIQUE KEY uq_mark_six_phone (phone),
            INDEX idx_mark_six_members_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS mark_six_sheets (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            title VARCHAR(128) NOT NULL DEFAULT '统计数据',
            table_data LONGTEXT NOT NULL,
            total DOUBLE NOT NULL DEFAULT 0,
            odds DOUBLE NOT NULL DEFAULT 47,
            created_by BIGINT NULL,
            updated_by BIGINT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            deleted_at DATETIME NULL,
            deleted_by BIGINT NULL,
            INDEX idx_mark_six_sheets_updated (updated_at),
            INDEX idx_mark_six_sheets_created_by (created_by),
            INDEX idx_mark_six_sheets_deleted (deleted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    # 存量库补软删除字段
    for col_sql in (
        "ALTER TABLE mark_six_sheets ADD COLUMN deleted_at DATETIME NULL",
        "ALTER TABLE mark_six_sheets ADD COLUMN deleted_by BIGINT NULL",
    ):
        try:
            cur.execute(col_sql)
        except Exception:
            pass
    try:
        cur.execute(
            "CREATE INDEX idx_mark_six_sheets_deleted ON mark_six_sheets (deleted_at)"
        )
    except Exception:
        pass


# 软删除保留天数，过期硬删
_SOFT_DELETE_DAYS = 7


def _utc_now_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _to_cn(dt_val) -> Optional[str]:
    if dt_val is None:
        return None
    if isinstance(dt_val, str):
        s = dt_val.strip().replace("T", " ")[:19]
        try:
            dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except Exception:
            return s
    elif isinstance(dt_val, datetime):
        dt = dt_val if dt_val.tzinfo else dt_val.replace(tzinfo=timezone.utc)
    else:
        return str(dt_val)
    return dt.astimezone(_CN_TZ).strftime("%Y-%m-%d %H:%M:%S")


def _norm_phone(raw: str) -> str:
    p = re.sub(r"\D+", "", (raw or "").strip())
    if p.startswith("86") and len(p) == 13:
        p = p[2:]
    return p


def _empty_table(odds: float = _DEFAULT_ODDS) -> List[dict]:
    zmap = current_zodiac()["map"]
    rows = []
    for i in range(1, 50):
        rows.append(
            {
                "number": i,
                "value": 0,
                "expression": "0",
                "displayValue": "0",
                "zodiac": zmap.get(str(i), ""),
                "wave": WAVE_MAP.get(str(i), ""),
                "payout": 0,
            }
        )
    return rows


def _enrich_rows(rows: List[dict], odds: float) -> List[dict]:
    zmap = current_zodiac()["map"]
    out = []
    for i in range(1, 50):
        src = None
        for r in rows or []:
            if int(r.get("number") or 0) == i:
                src = r
                break
        val = float((src or {}).get("value") or 0)
        expr = str((src or {}).get("expression") or "0")
        disp = str((src or {}).get("displayValue") or expr)
        out.append(
            {
                "number": i,
                "value": round(val, 2),
                "expression": expr,
                "displayValue": disp,
                "zodiac": zmap.get(str(i), ""),
                "wave": WAVE_MAP.get(str(i), ""),
                "payout": round(val * float(odds or _DEFAULT_ODDS), 2),
            }
        )
    return out


def _sum_total(rows: List[dict]) -> float:
    return round(sum(float(r.get("value") or 0) for r in rows), 2)


def user_is_mark_six(conn, user: dict) -> bool:
    if not user:
        return False
    if _is_admin and _is_admin(user):
        return True
    phone = _norm_phone(user.get("phone") or "")
    if not phone:
        return False
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM mark_six_members WHERE phone=%s LIMIT 1", (phone,))
        return bool(cur.fetchone())


def _current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if _require_db:
        _require_db()
    if _get_current_user is None:
        raise HTTPException(status_code=503, detail="Auth unavailable")
    return _get_current_user(creds)


def _mark_six_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    user = _current_user(creds)
    if _get_conn is None:
        raise HTTPException(status_code=503, detail="DB unavailable")
    conn = _get_conn()
    try:
        if not user_is_mark_six(conn, user):
            raise HTTPException(status_code=403, detail="Mark six access required")
    finally:
        conn.close()
    return user


def _admin_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    user = _current_user(creds)
    if _require_admin is None:
        raise HTTPException(status_code=503, detail="Admin unavailable")
    _require_admin(user)
    return user


class MemberIn(BaseModel):
    phone: str
    note: str = ""


class SheetCreateIn(BaseModel):
    title: str = Field(default="统计数据", max_length=128)


class SheetSaveIn(BaseModel):
    title: Optional[str] = Field(default=None, max_length=128)
    table_data: List[dict]
    total: Optional[float] = None
    odds: Optional[float] = None


def _serialize_sheet(row: dict, include_table: bool = True, deleted_by_label: str = "") -> dict:
    odds = float(row.get("odds") or _DEFAULT_ODDS)
    item = {
        "id": int(row["id"]),
        "title": row.get("title") or "统计数据",
        "total": float(row.get("total") or 0),
        "odds": odds,
        "created_by": row.get("created_by"),
        "updated_by": row.get("updated_by"),
        "created_at": _to_cn(row.get("created_at")),
        "updated_at": _to_cn(row.get("updated_at")),
        "updated_at_utc": (
            row.get("updated_at").strftime("%Y-%m-%d %H:%M:%S")
            if isinstance(row.get("updated_at"), datetime)
            else str(row.get("updated_at") or "")[:19]
        ),
        "deleted_at": _to_cn(row.get("deleted_at")),
        "deleted_by": row.get("deleted_by"),
        "deleted_by_label": deleted_by_label or "",
    }
    if include_table:
        try:
            raw = json.loads(row.get("table_data") or "[]")
        except Exception:
            raw = []
        if not isinstance(raw, list):
            raw = []
        item["table_data"] = _enrich_rows(raw, odds)
    return item


def _user_label(cur, user_id) -> str:
    if not user_id:
        return ""
    try:
        cur.execute(
            "SELECT nickname, phone, email FROM users WHERE id=%s LIMIT 1",
            (int(user_id),),
        )
        u = cur.fetchone() or {}
    except Exception:
        return str(user_id)
    nick = str(u.get("nickname") or "").strip()
    if nick:
        return nick
    ph = str(u.get("phone") or "").strip()
    if ph:
        return ph
    em = str(u.get("email") or "").strip()
    return em or str(user_id)


def _purge_expired_soft_deletes(cur) -> None:
    cur.execute(
        """
        DELETE FROM mark_six_sheets
        WHERE deleted_at IS NOT NULL
          AND deleted_at < (UTC_TIMESTAMP() - INTERVAL %s DAY)
        """,
        (_SOFT_DELETE_DAYS,),
    )


def _row_is_deleted(row: Optional[dict]) -> bool:
    return bool(row and row.get("deleted_at"))


@router.get("/me")
def mark_six_me(user: dict = Depends(_current_user)):
    conn = _get_conn()
    try:
        allowed = user_is_mark_six(conn, user)
        admin = bool(_is_admin and _is_admin(user))
    finally:
        conn.close()
    return {"success": True, "allowed": allowed, "isAdmin": admin, "isMarkSix": allowed}


@router.get("/meta")
def mark_six_meta(user: dict = Depends(_mark_six_user)):
    z = current_zodiac()
    return {
        "success": True,
        "odds_default": _DEFAULT_ODDS,
        "zodiac_year": z["year_animal"],
        "lunar_year": z["lunar_year"],
        "zodiac_map": z["map"],
        "wave_map": WAVE_MAP,
        "wave_groups": WAVE_GROUPS,
        "zodiac_list": z["list"],
        "wave_list": WAVE_LIST,
        "wave_parity_list": WAVE_PARITY_LIST,
        "wave_select_list": WAVE_SELECT_LIST,
    }


@router.get("/members")
def list_members(user: dict = Depends(_admin_user)):
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, phone, note, created_by, created_at
                FROM mark_six_members
                ORDER BY id DESC
                """
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()
    return {
        "success": True,
        "members": [
            {
                "id": int(r["id"]),
                "phone": r.get("phone"),
                "note": r.get("note") or "",
                "created_by": r.get("created_by"),
                "created_at": _to_cn(r.get("created_at")),
            }
            for r in rows
        ],
    }


@router.post("/members")
def add_member(body: MemberIn, user: dict = Depends(_admin_user)):
    phone = _norm_phone(body.phone)
    if not _PHONE_RE.match(phone):
        raise HTTPException(status_code=400, detail="请填写 11 位手机号")
    note = (body.note or "").strip()[:128]
    now = _utc_now_str()
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO mark_six_members (phone, note, created_by, created_at)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE note=VALUES(note)
                """,
                (phone, note or None, user.get("id"), now),
            )
            cur.execute("SELECT id, phone, note, created_by, created_at FROM mark_six_members WHERE phone=%s", (phone,))
            row = cur.fetchone()
    finally:
        conn.close()
    return {
        "success": True,
        "member": {
            "id": int(row["id"]),
            "phone": row["phone"],
            "note": row.get("note") or "",
            "created_by": row.get("created_by"),
            "created_at": _to_cn(row.get("created_at")),
        },
    }


@router.delete("/members/{member_id}")
def delete_member(member_id: int, user: dict = Depends(_admin_user)):
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM mark_six_members WHERE id=%s", (int(member_id),))
            if cur.rowcount <= 0:
                raise HTTPException(status_code=404, detail="成员不存在")
    finally:
        conn.close()
    return {"success": True}


@router.get("/sheets")
def list_sheets(user: dict = Depends(_mark_six_user)):
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            _purge_expired_soft_deletes(cur)
            cur.execute(
                """
                SELECT id, title, total, odds, created_by, updated_by, created_at, updated_at,
                       deleted_at, deleted_by
                FROM mark_six_sheets
                WHERE deleted_at IS NULL
                ORDER BY updated_at DESC, id DESC
                LIMIT 200
                """
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()
    return {
        "success": True,
        "sheets": [_serialize_sheet(r, include_table=False) for r in rows],
        "trash_keep_days": _SOFT_DELETE_DAYS,
    }


@router.get("/sheets/trash")
def list_trash(user: dict = Depends(_mark_six_user)):
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            _purge_expired_soft_deletes(cur)
            cur.execute(
                """
                SELECT id, title, total, odds, created_by, updated_by, created_at, updated_at,
                       deleted_at, deleted_by
                FROM mark_six_sheets
                WHERE deleted_at IS NOT NULL
                ORDER BY deleted_at DESC, id DESC
                LIMIT 100
                """
            )
            rows = cur.fetchall() or []
            out = []
            for r in rows:
                label = _user_label(cur, r.get("deleted_by"))
                out.append(_serialize_sheet(r, include_table=False, deleted_by_label=label))
    finally:
        conn.close()
    return {"success": True, "sheets": out, "trash_keep_days": _SOFT_DELETE_DAYS}


@router.post("/sheets")
def create_sheet(body: SheetCreateIn, user: dict = Depends(_mark_six_user)):
    title = (body.title or "统计数据").strip()[:128] or "统计数据"
    odds = _DEFAULT_ODDS
    rows = _empty_table(odds)
    now = _utc_now_str()
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO mark_six_sheets
                (title, table_data, total, odds, created_by, updated_by, created_at, updated_at,
                 deleted_at, deleted_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, NULL)
                """,
                (
                    title,
                    json.dumps(rows, ensure_ascii=False),
                    0,
                    odds,
                    user.get("id"),
                    user.get("id"),
                    now,
                    now,
                ),
            )
            sheet_id = int(cur.lastrowid)
            cur.execute("SELECT * FROM mark_six_sheets WHERE id=%s", (sheet_id,))
            row = cur.fetchone()
    finally:
        conn.close()
    return {"success": True, "sheet": _serialize_sheet(row, include_table=True)}


@router.get("/sheets/{sheet_id}")
def get_sheet(sheet_id: int, since: str = "", user: dict = Depends(_mark_six_user)):
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM mark_six_sheets WHERE id=%s", (int(sheet_id),))
            row = cur.fetchone()
    finally:
        conn.close()
    if not row or _row_is_deleted(row):
        raise HTTPException(status_code=404, detail="该统计已被他人删除")
    utc = (
        row.get("updated_at").strftime("%Y-%m-%d %H:%M:%S")
        if isinstance(row.get("updated_at"), datetime)
        else str(row.get("updated_at") or "")[:19]
    )
    since_s = (since or "").strip().replace("T", " ")[:19]
    if since_s and utc and since_s >= utc:
        return {"success": True, "unchanged": True, "updated_at_utc": utc}
    return {"success": True, "unchanged": False, "sheet": _serialize_sheet(row, include_table=True)}


@router.put("/sheets/{sheet_id}")
def save_sheet(sheet_id: int, body: SheetSaveIn, user: dict = Depends(_mark_six_user)):
    odds = float(body.odds if body.odds is not None else _DEFAULT_ODDS)
    odds = max(0.01, min(1000.0, odds))
    rows = _enrich_rows(body.table_data or [], odds)
    total = body.total
    if total is None:
        total = _sum_total(rows)
    else:
        total = round(float(total), 2)
    title = (body.title or "").strip()[:128] if body.title is not None else None
    now = _utc_now_str()
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, title, deleted_at FROM mark_six_sheets WHERE id=%s",
                (int(sheet_id),),
            )
            old = cur.fetchone()
            if not old or _row_is_deleted(old):
                raise HTTPException(status_code=404, detail="该统计已被他人删除")
            new_title = title if title else (old.get("title") or "统计数据")
            cur.execute(
                """
                UPDATE mark_six_sheets
                SET title=%s, table_data=%s, total=%s, odds=%s, updated_by=%s, updated_at=%s
                WHERE id=%s AND deleted_at IS NULL
                """,
                (
                    new_title,
                    json.dumps(rows, ensure_ascii=False),
                    total,
                    odds,
                    user.get("id"),
                    now,
                    int(sheet_id),
                ),
            )
            cur.execute("SELECT * FROM mark_six_sheets WHERE id=%s", (int(sheet_id),))
            row = cur.fetchone()
    finally:
        conn.close()
    return {"success": True, "sheet": _serialize_sheet(row, include_table=True)}


@router.delete("/sheets/{sheet_id}")
def delete_sheet(sheet_id: int, user: dict = Depends(_mark_six_user)):
    now = _utc_now_str()
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, deleted_at FROM mark_six_sheets WHERE id=%s",
                (int(sheet_id),),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="统计表不存在")
            if _row_is_deleted(row):
                return {"success": True, "alreadyDeleted": True}
            cur.execute(
                """
                UPDATE mark_six_sheets
                SET deleted_at=%s, deleted_by=%s, updated_at=%s, updated_by=%s
                WHERE id=%s AND deleted_at IS NULL
                """,
                (now, user.get("id"), now, user.get("id"), int(sheet_id)),
            )
    finally:
        conn.close()
    return {"success": True, "trashed": True, "trash_keep_days": _SOFT_DELETE_DAYS}


@router.post("/sheets/{sheet_id}/restore")
def restore_sheet(sheet_id: int, user: dict = Depends(_mark_six_user)):
    now = _utc_now_str()
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            _purge_expired_soft_deletes(cur)
            cur.execute(
                "SELECT id, deleted_at FROM mark_six_sheets WHERE id=%s",
                (int(sheet_id),),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="统计表不存在或已彻底清除")
            if not _row_is_deleted(row):
                cur.execute("SELECT * FROM mark_six_sheets WHERE id=%s", (int(sheet_id),))
                alive = cur.fetchone()
                return {"success": True, "sheet": _serialize_sheet(alive, include_table=False)}
            cur.execute(
                """
                UPDATE mark_six_sheets
                SET deleted_at=NULL, deleted_by=NULL, updated_at=%s, updated_by=%s
                WHERE id=%s
                """,
                (now, user.get("id"), int(sheet_id)),
            )
            cur.execute("SELECT * FROM mark_six_sheets WHERE id=%s", (int(sheet_id),))
            restored = cur.fetchone()
    finally:
        conn.close()
    return {"success": True, "sheet": _serialize_sheet(restored, include_table=False)}
