"""自研游戏投票：热度榜（最爱玩哪个）+ 愿望单（想玩/想让我们做哪个）。

设计要点
--------
* 匿名可投：身份是本机生成的 `device_id`（随机 hex，存 localStorage），无需登录。
* 每人限额：最爱 3 票、愿望单 5 票，可撤票改票；同 IP 每天限若干 device 防刷。
* 愿望单条目由网友自填（名称 + 说明），提交即上榜，管理员可下架。
* 时间一律 UTC 入库，展示转北京时间（见 timezone-utc-cn 规则）。
"""
from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

try:  # Windows 精简环境可能缺 tzdata，退回固定 UTC+8
    from zoneinfo import ZoneInfo

    _CN_TZ = ZoneInfo("Asia/Shanghai")
except Exception:  # pragma: no cover - 环境相关兜底
    _CN_TZ = timezone(timedelta(hours=8))

router = APIRouter(prefix="/game-votes", tags=["game-votes"])
security = HTTPBearer(auto_error=False)

_get_conn: Optional[Callable[..., Any]] = None
_require_db: Optional[Callable[[], None]] = None
_get_current_user: Optional[Callable[..., Any]] = None
_require_admin: Optional[Callable[[dict], None]] = None
_is_admin: Optional[Callable[[dict], bool]] = None
_client_ip: Optional[Callable[[Any], str]] = None

FAVORITE_LIMIT = 3
WISHLIST_LIMIT = 5
WISH_SUBMIT_LIMIT = 3          # 每 device 最多提交几条愿望
IP_DEVICE_DAY_LIMIT = 5         # 同 IP 每天最多几个 device 能投票
NAME_MAX = 24
NOTE_MAX = 160

_DEVICE_RE = re.compile(r"^[0-9a-f]{16,32}$")
# 愿望单不许夹带联系方式/外链（防广告位）
_SPAM_RE = re.compile(
    r"(https?://|www\.|\.com/|\.cn/|加微|微信|vx|QQ\s*\d{5,}|电话|手机\s*\d{7,}|\d{11})",
    re.IGNORECASE,
)

VOTE_FAVORITE = "favorite"
VOTE_WISHLIST = "wishlist"

# 自研（本站有源码）游戏白名单：key 取游戏页 slug，titleKey 交给前端 i18n 取中文名，
# 后端不存文案，避免和 public/js/config.js、locales 双份维护。
ORIGINAL_GAMES: List[Dict[str, str]] = [
    {"key": "tank-3d", "url": "html/game/tank-3d/index.html", "titleKey": "tools.tank3d.title"},
    {"key": "journey-west-3d", "url": "html/game/journey-west-3d/index.html", "titleKey": "tools.journeyWest.title"},
    {"key": "worms", "url": "html/game/worms.html", "titleKey": "tools.worms.title"},
    {"key": "starship_defense", "url": "html/game/starship_defense.html", "titleKey": "tools.starshipDefense.title"},
    {"key": "tank_battle", "url": "html/game/tank_battle.html", "titleKey": "tools.tankBattle.title"},
    {"key": "sheepstack", "url": "html/game/sheepstack.html", "titleKey": "tools.sheepstack.title"},
    {"key": "gemswap", "url": "html/game/gemswap.html", "titleKey": "tools.gemswap.title"},
    {"key": "brick_breaker", "url": "html/game/brick_breaker.html", "titleKey": "tools.brickBreaker.title"},
    {"key": "frog_zuma", "url": "html/game/frog_zuma.html", "titleKey": "tools.frogZuma.title"},
    {"key": "bubble_dragon", "url": "html/game/bubble_dragon.html", "titleKey": "tools.bubbleDragon.title"},
    {"key": "lianliankan", "url": "html/game/lianliankan.html", "titleKey": "tools.lianliankan.title"},
]
_ORIGINAL_KEYS = {g["key"] for g in ORIGINAL_GAMES}

# 空站时的预置愿望，让第一次进来的用户有得投；网友自填条目会排在这些之后。
SEED_WISHES: List[Dict[str, str]] = [
    {"name": "经典街机双人同屏", "note": "坦克、炸弹人那种，拉朋友面对面打一局"},
    {"name": "塔防守城", "note": "波次防守加英雄技能，单手能玩"},
    {"name": "肉鸽地牢", "note": "每局随机地图和道具组合，死了重开"},
    {"name": "热梗小游戏", "note": "把当下热梗做成 60 秒一局"},
    {"name": "星空防守无尽模式", "note": "在现有玩法上加无尽和排行榜"},
    {"name": "四人联机吃豆", "note": "房间码开局，手机也能凑一桌"},
    {"name": "像素牧场经营", "note": "轻量种田加订单，竖屏挂机"},
]


def wire(
    get_conn: Callable[..., Any],
    require_db: Callable[[], None],
    get_current_user: Callable[..., Any],
    require_admin: Callable[[dict], None],
    is_admin: Callable[[dict], bool],
    client_ip: Optional[Callable[[Any], str]] = None,
) -> None:
    global _get_conn, _require_db, _get_current_user, _require_admin, _is_admin, _client_ip
    _get_conn = get_conn
    _require_db = require_db
    _get_current_user = get_current_user
    _require_admin = require_admin
    _is_admin = is_admin
    if client_ip is not None:
        _client_ip = client_ip


def ensure_game_votes_tables(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS game_vote_ballots (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            vote_type VARCHAR(16) NOT NULL,
            target_key VARCHAR(64) NOT NULL,
            device_id CHAR(32) NOT NULL,
            ip_hash CHAR(32) NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL,
            UNIQUE KEY uq_game_vote (vote_type, target_key, device_id),
            INDEX idx_game_vote_target (vote_type, target_key),
            INDEX idx_game_vote_device (device_id),
            INDEX idx_game_vote_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS game_wishes (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(48) NOT NULL,
            note VARCHAR(160) NOT NULL DEFAULT '',
            source VARCHAR(8) NOT NULL DEFAULT 'user',
            device_id CHAR(32) NOT NULL DEFAULT '',
            ip_hash CHAR(32) NOT NULL DEFAULT '',
            status TINYINT NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL,
            INDEX idx_game_wish_status (status, created_at),
            INDEX idx_game_wish_device (device_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )

    # 已下架的官方预置愿望保留历史记录，但不再展示或接受新票。
    cur.execute(
        "UPDATE game_wishes SET status=0 WHERE source='seed' AND name=%s AND status=1",
        ("跳跳狐关卡编辑器",),
    )


def _db():
    if _require_db:
        _require_db()
    if _get_conn is None:
        raise HTTPException(status_code=503, detail="Voting service is not ready")
    return _get_conn()


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def _cn_text(dt: Optional[datetime]) -> str:
    if not dt:
        return ""
    return dt.replace(tzinfo=timezone.utc).astimezone(_CN_TZ).strftime("%Y-%m-%d %H:%M:%S")


def _ip_hash(ip: str) -> str:
    salt = os.environ.get("GAME_VOTE_IP_SALT", "toolbasecamp-game-vote")
    return hashlib.sha256(f"{salt}|{ip or ''}".encode("utf-8")).hexdigest()[:32]


def _request_ip(request: Any) -> str:
    if _client_ip is None:
        return ""
    try:
        return (_client_ip(request) or "").strip()
    except Exception:
        return ""


def _check_device(device_id: str) -> str:
    dev = (device_id or "").strip().lower()
    if not _DEVICE_RE.match(dev):
        raise HTTPException(status_code=400, detail="Invalid device id")
    return dev


def _check_vote_type(vote_type: str) -> str:
    vt = (vote_type or "").strip()
    if vt not in (VOTE_FAVORITE, VOTE_WISHLIST):
        raise HTTPException(status_code=400, detail="Invalid vote type")
    return vt


def _normalize_target(vote_type: str, target: str) -> str:
    key = (target or "").strip()
    if vote_type == VOTE_FAVORITE:
        if key not in _ORIGINAL_KEYS:
            raise HTTPException(status_code=400, detail="Unknown game option")
        return key
    if not re.match(r"^w\d{1,9}$", key):
        raise HTTPException(status_code=400, detail="Invalid wish id")
    wish_id = int(key[1:])
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, status FROM game_wishes WHERE id=%s", (wish_id,)
            )
            row = cur.fetchone()
    finally:
        conn.close()
    if not row or int(row["status"]) != 1:
        raise HTTPException(status_code=400, detail="Wish not available")
    return f"w{wish_id}"


def _ip_device_guard(cur, ip_hash: str) -> None:
    """同 IP 单日新增设备数超限即视为刷票，直接拒。"""
    if not ip_hash:
        return
    now = _now_utc()
    day_start = datetime(now.year, now.month, now.day)
    cur.execute(
        """
        SELECT COUNT(DISTINCT device_id) AS c FROM game_vote_ballots
        WHERE ip_hash=%s AND created_at>=%s
        """,
        (ip_hash, day_start),
    )
    row = cur.fetchone()
    if row and int(row["c"] or 0) >= IP_DEVICE_DAY_LIMIT + 1:
        raise HTTPException(status_code=429, detail="This network voted too many times today")


def _device_count(cur, device_id: str, vote_type: str) -> int:
    cur.execute(
        f"""SELECT COUNT(*) AS c FROM game_vote_ballots b
        LEFT JOIN game_wishes w ON b.vote_type='wishlist' AND b.target_key=CONCAT('w', w.id)
        WHERE b.device_id=%s AND b.vote_type=%s AND ({_active_ballots_sql()})""",
        (device_id, vote_type, *sorted(_ORIGINAL_KEYS)),
    )
    row = cur.fetchone()
    return int(row["c"] or 0) if row else 0


class VoteIn(BaseModel):
    device_id: str = Field(..., min_length=16, max_length=32)
    vote_type: str = Field(..., min_length=4, max_length=16)
    target: str = Field(..., min_length=1, max_length=64)


class WishIn(BaseModel):
    device_id: str = Field(..., min_length=16, max_length=32)
    name: str = Field(..., min_length=1, max_length=NAME_MAX)
    note: str = Field(default="", max_length=NOTE_MAX)


class WishAdminIn(BaseModel):
    wish_id: int = Field(..., ge=1)
    status: int = Field(..., ge=0, le=1)


@router.get("/board")
def get_board(
    limit: int = Query(20, ge=1, le=20),
    offset: int = Query(0, ge=0),
    sort: str = Query("votes", pattern="^(votes|newest)$"),
) -> dict:
    """热度榜 + 愿望榜（公开、无鉴权，前端首屏和榜单卡都读它）。"""
    conn = _db()
    try:
        with conn.cursor() as cur:
            fav_rows = _favorite_counts(cur)
            wish_rows = _wish_counts(cur, limit=limit, offset=offset, sort=sort)
            totals = _totals(cur)
    finally:
        conn.close()

    fav_map = {g["key"]: g for g in ORIGINAL_GAMES}
    favorite = [
        {
            "key": r["target_key"],
            "votes": int(r["votes"]),
            "weekVotes": int(r["week_votes"] or 0),
            "url": (fav_map.get(r["target_key"]) or {}).get("url", ""),
            "titleKey": (fav_map.get(r["target_key"]) or {}).get("titleKey", ""),
        }
        for r in fav_rows
    ]
    wishlist = [
        {
            "id": int(r["id"]),
            "key": f"w{r['id']}",
            "name": r["name"],
            "note": r["note"] or "",
            "source": r["source"] or "user",
            "votes": int(r["votes"]),
            "weekVotes": int(r["week_votes"] or 0),
            "createdAt": _cn_text(r["created_at"]),
        }
        for r in wish_rows
    ]
    return {
        "limits": {
            "favorite": FAVORITE_LIMIT,
            "wishlist": WISHLIST_LIMIT,
            "wishSubmit": WISH_SUBMIT_LIMIT,
        },
        "totals": totals,
        "favorite": favorite,
        "wishlist": wishlist,
        "wishlistTotal": totals["wishes"],
        "wishlistOffset": offset,
        "updatedAt": _cn_text(_now_utc()),
    }


def _favorite_counts(cur) -> List[dict]:
    """票数 + 近 7 天新增（用来把「最近有人玩」的游戏顶上去）。"""
    week_ago = _now_utc() - timedelta(days=7)
    cur.execute(
        f"""
        SELECT target_key,
               COUNT(*) AS votes,
               SUM(CASE WHEN created_at>=%s THEN 1 ELSE 0 END) AS week_votes
        FROM game_vote_ballots
        WHERE vote_type=%s AND target_key IN ({','.join(['%s'] * len(_ORIGINAL_KEYS))})
        GROUP BY target_key
        ORDER BY votes DESC, week_votes DESC, target_key ASC
        """,
        (week_ago, VOTE_FAVORITE, *sorted(_ORIGINAL_KEYS)),
    )
    return list(cur.fetchall())


def _wish_counts(cur, limit: int = 20, include_hidden: bool = False,
                 offset: int = 0, sort: str = "votes") -> List[dict]:
    week_ago = _now_utc() - timedelta(days=7)
    where = "1=1" if include_hidden else "w.status=1"
    order = "w.id DESC" if sort == "newest" else "w.status ASC, votes DESC, week_votes DESC, w.id DESC"
    cur.execute(
        f"""
        SELECT w.id, w.name, w.note, w.source, w.status, w.created_at,
               COUNT(b.id) AS votes,
               SUM(CASE WHEN b.created_at>=%s THEN 1 ELSE 0 END) AS week_votes
        FROM game_wishes w
        LEFT JOIN game_vote_ballots b
               ON b.vote_type=%s AND b.target_key=CONCAT('w', w.id)
        WHERE {where}
        GROUP BY w.id
        ORDER BY {order}
        LIMIT %s OFFSET %s
        """,
        (week_ago, VOTE_WISHLIST, limit, offset),
    )
    return list(cur.fetchall())


def _active_ballots_sql() -> str:
    keys = ','.join(['%s'] * len(_ORIGINAL_KEYS))
    return (f"(b.vote_type='favorite' AND b.target_key IN ({keys})) "
            "OR (b.vote_type='wishlist' AND w.status=1)")


def _totals(cur) -> dict:
    cur.execute(
        f"""
        SELECT COUNT(*) AS votes, COUNT(DISTINCT b.device_id) AS voters FROM game_vote_ballots b
        LEFT JOIN game_wishes w ON b.vote_type='wishlist' AND b.target_key=CONCAT('w', w.id)
        WHERE {_active_ballots_sql()}
        """,
        tuple(sorted(_ORIGINAL_KEYS)),
    )
    row = cur.fetchone() or {}
    cur.execute("SELECT COUNT(*) AS c FROM game_wishes WHERE status=1")
    wishes = cur.fetchone() or {}
    return {
        "votes": int(row.get("votes") or 0),
        "voters": int(row.get("voters") or 0),
        "wishes": int(wishes.get("c") or 0),
    }


@router.get("/options")
def get_options() -> dict:
    """投票页渲染需要的候选项与额度；名称仍由前端按 titleKey 走 i18n。"""
    conn = _db()
    try:
        with conn.cursor() as cur:
            seed_ids = _ensure_seed_wishes(cur)
    finally:
        conn.close()
    return {
        "favorites": ORIGINAL_GAMES,
        "limits": {
            "favorite": FAVORITE_LIMIT,
            "wishlist": WISHLIST_LIMIT,
            "wishSubmit": WISH_SUBMIT_LIMIT,
        },
        "seedWishes": seed_ids,
    }


def _ensure_seed_wishes(cur) -> List[int]:
    """愿望榜空时预置几条方向，避免新站空空如也；只在一条 user 愿望都没有时执行。"""
    cur.execute("SELECT COUNT(*) AS c FROM game_wishes")
    row = cur.fetchone() or {}
    if int(row.get("c") or 0) > 0:
        cur.execute(
            "SELECT id FROM game_wishes WHERE source='seed' ORDER BY id ASC"
        )
        return [int(r["id"]) for r in cur.fetchall()]
    now = _now_utc()
    created: List[int] = []
    for item in SEED_WISHES:
        cur.execute(
            """
            INSERT INTO game_wishes (name, note, source, device_id, ip_hash, created_at)
            VALUES (%s, %s, 'seed', '', '', %s)
            """,
            (item["name"], item["note"], now),
        )
        created.append(int(cur.lastrowid))
    return created


@router.get("/my-votes")
def get_my_votes(device_id: str = Query(..., min_length=16, max_length=32)) -> dict:
    dev = _check_device(device_id)
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT b.vote_type, b.target_key FROM game_vote_ballots b
                LEFT JOIN game_wishes w ON b.vote_type='wishlist' AND b.target_key=CONCAT('w', w.id)
                WHERE b.device_id=%s AND ({_active_ballots_sql()}) ORDER BY b.id ASC
                """,
                (dev, *sorted(_ORIGINAL_KEYS)),
            )
            rows = cur.fetchall()
            cur.execute(
                "SELECT id FROM game_wishes WHERE device_id=%s ORDER BY id ASC", (dev,)
            )
            mine = [int(r["id"]) for r in cur.fetchall()]
    finally:
        conn.close()

    favorite = [r["target_key"] for r in rows if r["vote_type"] == VOTE_FAVORITE]
    wishlist = [r["target_key"] for r in rows if r["vote_type"] == VOTE_WISHLIST]
    return {
        "favorite": favorite,
        "wishlist": wishlist,
        "myWishes": mine,
        "remaining": {
            "favorite": max(0, FAVORITE_LIMIT - len(favorite)),
            "wishlist": max(0, WISHLIST_LIMIT - len(wishlist)),
            "wishSubmit": max(0, WISH_SUBMIT_LIMIT - len(mine)),
        },
    }


@router.post("/vote")
def cast_vote(body: VoteIn, request: Request) -> dict:
    dev = _check_device(body.device_id)
    vote_type = _check_vote_type(body.vote_type)
    target = _normalize_target(vote_type, body.target)
    ip_hash = _ip_hash(_request_ip(request))
    limit = FAVORITE_LIMIT if vote_type == VOTE_FAVORITE else WISHLIST_LIMIT

    conn = _db()
    try:
        with conn.cursor() as cur:
            _ip_device_guard(cur, ip_hash)
            cur.execute(
                "SELECT id FROM game_vote_ballots WHERE vote_type=%s AND target_key=%s AND device_id=%s",
                (vote_type, target, dev),
            )
            already = cur.fetchone()
            used = _device_count(cur, dev, vote_type)
            if not already:
                if used >= limit:
                    raise HTTPException(
                        status_code=429,
                        detail=f"Too many votes: limit is {limit} for this board",
                    )
                cur.execute(
                    """
                    INSERT IGNORE INTO game_vote_ballots
                        (vote_type, target_key, device_id, ip_hash, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (vote_type, target, dev, ip_hash, _now_utc()),
                )
                used += 1
    finally:
        conn.close()

    return {"ok": True, "voteType": vote_type, "target": target, "used": used, "limit": limit}


@router.post("/unvote")
def cancel_vote(body: VoteIn) -> dict:
    dev = _check_device(body.device_id)
    vote_type = _check_vote_type(body.vote_type)
    target = (body.target or "").strip()
    if vote_type == VOTE_FAVORITE and target not in _ORIGINAL_KEYS:
        raise HTTPException(status_code=400, detail="Unknown game option")

    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM game_vote_ballots
                WHERE vote_type=%s AND target_key=%s AND device_id=%s
                """,
                (vote_type, target, dev),
            )
            deleted = int(cur.rowcount or 0)
            used = _device_count(cur, dev, vote_type)
    finally:
        conn.close()
    limit = FAVORITE_LIMIT if vote_type == VOTE_FAVORITE else WISHLIST_LIMIT
    return {"ok": True, "removed": deleted, "used": used, "limit": limit}


@router.post("/wish")
def submit_wish(body: WishIn, request: Request) -> dict:
    dev = _check_device(body.device_id)
    name = re.sub(r"\s+", " ", (body.name or "")).strip()[:NAME_MAX]
    note = re.sub(r"\s+", " ", (body.note or "")).strip()[:NOTE_MAX]
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Wish name is too short")
    if _SPAM_RE.search(name) or _SPAM_RE.search(note):
        raise HTTPException(
            status_code=400,
            detail="Please do not put links or contact info in a wish",
        )
    ip_hash = _ip_hash(_request_ip(request))

    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM game_wishes WHERE device_id=%s", (dev,)
            )
            row = cur.fetchone() or {}
            if int(row.get("c") or 0) >= WISH_SUBMIT_LIMIT:
                raise HTTPException(
                    status_code=429,
                    detail=f"You can submit up to {WISH_SUBMIT_LIMIT} wishes",
                )
            cur.execute(
                """
                INSERT INTO game_wishes (name, note, source, device_id, ip_hash, created_at)
                VALUES (%s, %s, 'user', %s, %s, %s)
                """,
                (name, note, dev, ip_hash, _now_utc()),
            )
            wish_id = int(cur.lastrowid)
    finally:
        conn.close()
    return {"ok": True, "item": {"id": wish_id, "key": f"w{wish_id}", "name": name, "note": note}}


def _admin_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if _get_current_user is None or _require_admin is None:
        raise HTTPException(status_code=503, detail="Auth is not ready")
    user = _get_current_user(creds)
    _require_admin(user)
    return user


@router.get("/admin/wishes")
def admin_wishes(user: dict = Depends(_admin_user)) -> dict:
    conn = _db()
    try:
        with conn.cursor() as cur:
            rows = _wish_counts(cur, limit=500, include_hidden=True)
            totals = _totals(cur)
    finally:
        conn.close()
    return {
        "totals": totals,
        "items": [
            {
                "id": int(r["id"]),
                "name": r["name"],
                "note": r["note"] or "",
                "source": r["source"] or "user",
                "status": int(r["status"]),
                "votes": int(r["votes"]),
                "createdAt": _cn_text(r["created_at"]),
            }
            for r in rows
        ],
    }


@router.post("/admin/wish/status")
def admin_wish_status(body: WishAdminIn, user: dict = Depends(_admin_user)) -> dict:
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE game_wishes SET status=%s WHERE id=%s",
                (int(body.status), int(body.wish_id)),
            )
            if int(cur.rowcount or 0) < 1:
                raise HTTPException(status_code=404, detail="Wish not found")
            if int(body.status) == 0:
                cur.execute(
                    "DELETE FROM game_vote_ballots WHERE vote_type=%s AND target_key=%s",
                    (VOTE_WISHLIST, f"w{int(body.wish_id)}"),
                )
    finally:
        conn.close()
    return {"ok": True, "id": int(body.wish_id), "status": int(body.status)}

