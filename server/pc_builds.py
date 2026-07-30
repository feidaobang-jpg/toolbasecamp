"""PC builds: MySQL catalog + public list + admin crawl trigger."""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

router = APIRouter(prefix="/pcbuilds", tags=["pcbuilds"])
security = HTTPBearer(auto_error=False)

_get_conn: Optional[Callable[[], Any]] = None
_require_db: Optional[Callable[[], None]] = None
_get_current_user: Optional[Callable[..., Any]] = None
_require_admin: Optional[Callable[[dict], None]] = None

_lock = threading.Lock()
_running = False
_last_started: float = 0.0
_last_finished: float = 0.0
_last_ok: Optional[bool] = None
_last_log_tail: str = ""
_last_error: str = ""

PC_HOME = os.environ.get("PC_HOME", "/opt/toolbasecamp-pcbuilds")
PC_WEB_ROOT = os.environ.get("PC_WEB_ROOT", "/var/www/toolbasecamp")
RUN_SCRIPT = os.path.join(PC_HOME, "run_pc.sh")
SEED_JSON = os.environ.get(
    "PC_BUILDS_SEED_JSON",
    os.path.join(PC_WEB_ROOT, "data", "pc_builds.json"),
)

TIER_ENTRY = "entry"
TIER_MID = "mid"
TIER_HIGH = "high"
VALID_TIERS = {TIER_ENTRY, TIER_MID, TIER_HIGH, "all"}


def wire(
    get_conn: Callable[[], Any],
    require_db: Callable[[], None],
    get_current_user: Callable[..., Any],
    require_admin: Callable[[dict], None],
) -> None:
    global _get_conn, _require_db, _get_current_user, _require_admin
    _get_conn = get_conn
    _require_db = require_db
    _get_current_user = get_current_user
    _require_admin = require_admin


def _admin_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if _get_current_user is None or _require_admin is None:
        raise HTTPException(status_code=503, detail="PC builds admin unavailable")
    user = _get_current_user(creds)
    _require_admin(user)
    return user


def current_year() -> int:
    return datetime.now().year


def parse_price(val: Any) -> int:
    import re

    m = re.search(r"\d+", str(val or ""))
    return int(m.group()) if m else 0


def host_price_of(parts: List[Dict[str, Any]]) -> int:
    total = 0
    for part in parts or []:
        name = str(part.get("name") or "")
        if any(k in name for k in ("显示器", "键鼠", "外设", "耳机", "音响")):
            continue
        total += parse_price(part.get("price"))
    return total


def infer_tier(host_price: int, tags: Optional[List[str]] = None) -> str:
    tags = tags or []
    joined = " ".join(tags)
    if any(k in joined for k in ("入门", "低配", "办公", "核显", "性价比")) and host_price < 5500:
        if host_price < 4500:
            return TIER_ENTRY
    if any(k in joined for k in ("高端", "高配", "旗舰", "4K")) and host_price >= 8000:
        return TIER_HIGH
    if host_price < 4500:
        return TIER_ENTRY
    if host_price < 9000:
        return TIER_MID
    return TIER_HIGH


def ensure_pc_builds_tables(cur: Any) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS pc_builds (
            id VARCHAR(64) PRIMARY KEY,
            title VARCHAR(512) NOT NULL,
            summary TEXT NULL,
            price_range VARCHAR(128) NULL,
            tier VARCHAR(16) NOT NULL,
            tags_json JSON NULL,
            parts_json JSON NOT NULL,
            recommended_monitor_json JSON NULL,
            host_price INT NOT NULL DEFAULT 0,
            sort_price INT NOT NULL DEFAULT 0,
            year SMALLINT NOT NULL,
            source VARCHAR(32) NOT NULL DEFAULT 'seed',
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL,
            KEY idx_pc_tier_sort (tier, sort_price),
            KEY idx_pc_year (year)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    cur.execute("SELECT COUNT(*) AS c FROM pc_builds")
    row = cur.fetchone()
    count = int((row or {}).get("c") or 0)
    if count == 0:
        _seed_from_json(cur)


def _seed_from_json(cur: Any) -> None:
    path = SEED_JSON
    # Also try repo-relative path when developing locally
    alt = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "public",
        "data",
        "pc_builds.json",
    )
    for candidate in (path, alt):
        if candidate and os.path.isfile(candidate):
            path = candidate
            break
    else:
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return
    if not isinstance(data, list):
        return
    now = time.time()
    year = current_year()
    for item in data:
        bid = str(item.get("id") or "").strip()
        if not bid:
            continue
        parts = item.get("parts") or []
        tags = item.get("tags") or []
        host = host_price_of(parts)
        tier = infer_tier(host, tags)
        cur.execute(
            """
            INSERT INTO pc_builds (
                id, title, summary, price_range, tier, tags_json, parts_json,
                recommended_monitor_json, host_price, sort_price, year, source,
                created_at, updated_at
            ) VALUES (
                %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
            )
            ON DUPLICATE KEY UPDATE
                title=VALUES(title),
                summary=VALUES(summary),
                price_range=VALUES(price_range),
                tier=VALUES(tier),
                tags_json=VALUES(tags_json),
                parts_json=VALUES(parts_json),
                recommended_monitor_json=VALUES(recommended_monitor_json),
                host_price=VALUES(host_price),
                sort_price=VALUES(sort_price),
                year=VALUES(year),
                updated_at=VALUES(updated_at)
            """,
            (
                bid,
                item.get("title") or bid,
                item.get("summary") or "",
                item.get("price_range") or "",
                tier,
                json.dumps(tags, ensure_ascii=False),
                json.dumps(parts, ensure_ascii=False),
                json.dumps(item.get("recommended_monitor") or {}, ensure_ascii=False),
                host,
                host,
                year,
                "seed",
                now,
                now,
            ),
        )


def upsert_build(cur: Any, item: Dict[str, Any], source: str = "ai") -> None:
    parts = item.get("parts") or []
    tags = item.get("tags") or []
    host = int(item.get("host_price") or host_price_of(parts))
    tier = str(item.get("tier") or infer_tier(host, tags))
    if tier not in (TIER_ENTRY, TIER_MID, TIER_HIGH):
        tier = infer_tier(host, tags)
    now = time.time()
    year = int(item.get("year") or current_year())
    bid = str(item.get("id") or "").strip()
    if not bid:
        return
    cur.execute(
        """
        INSERT INTO pc_builds (
            id, title, summary, price_range, tier, tags_json, parts_json,
            recommended_monitor_json, host_price, sort_price, year, source,
            created_at, updated_at
        ) VALUES (
            %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
        )
        ON DUPLICATE KEY UPDATE
            title=VALUES(title),
            summary=VALUES(summary),
            price_range=VALUES(price_range),
            tier=VALUES(tier),
            tags_json=VALUES(tags_json),
            parts_json=VALUES(parts_json),
            recommended_monitor_json=VALUES(recommended_monitor_json),
            host_price=VALUES(host_price),
            sort_price=VALUES(sort_price),
            year=VALUES(year),
            source=VALUES(source),
            updated_at=VALUES(updated_at)
        """,
        (
            bid,
            item.get("title") or bid,
            item.get("summary") or "",
            item.get("price_range") or "",
            tier,
            json.dumps(tags, ensure_ascii=False),
            json.dumps(parts, ensure_ascii=False),
            json.dumps(item.get("recommended_monitor") or {}, ensure_ascii=False),
            host,
            host,
            year,
            source,
            now,
            now,
        ),
    )


def _row_to_build(row: Dict[str, Any]) -> Dict[str, Any]:
    def _loads(raw: Any, default: Any):
        if raw is None:
            return default
        if isinstance(raw, (dict, list)):
            return raw
        try:
            return json.loads(raw)
        except Exception:
            return default

    return {
        "id": row["id"],
        "title": row["title"],
        "summary": row.get("summary") or "",
        "price_range": row.get("price_range") or "",
        "tier": row["tier"],
        "tags": _loads(row.get("tags_json"), []),
        "parts": _loads(row.get("parts_json"), []),
        "recommended_monitor": _loads(row.get("recommended_monitor_json"), {}),
        "host_price": int(row.get("host_price") or 0),
        "year": int(row.get("year") or current_year()),
        "source": row.get("source") or "",
    }


def _count_builds() -> int:
    if _require_db is None or _get_conn is None:
        return 0
    try:
        _require_db()
        conn = _get_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM pc_builds")
            row = cur.fetchone()
            return int((row or {}).get("c") or 0)
    except Exception:
        return 0


def _run_job(extra_args: Optional[list] = None, timeout: int = 900) -> None:
    global _running, _last_finished, _last_ok, _last_log_tail, _last_error
    try:
        if not os.path.isfile(RUN_SCRIPT):
            raise FileNotFoundError(RUN_SCRIPT)
        env = os.environ.copy()
        env["PC_HOME"] = PC_HOME
        env["PC_WEB_ROOT"] = PC_WEB_ROOT
        env["PC_BUILDS_USE_DB"] = "1"
        cmd = ["bash", RUN_SCRIPT] + list(extra_args or ["--ai", "--clean"])
        proc = subprocess.run(
            cmd,
            cwd=PC_HOME,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        out = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
        _last_log_tail = out[-4000:] if out else ""
        _last_ok = proc.returncode == 0
        _last_error = "" if proc.returncode == 0 else f"exit {proc.returncode}"
    except Exception as e:
        _last_ok = False
        _last_error = str(e)
        _last_log_tail = str(e)
    finally:
        _last_finished = time.time()
        with _lock:
            _running = False


def _start_job(extra_args: Optional[list], message: str, timeout: int = 900) -> dict:
    global _running, _last_started, _last_error
    with _lock:
        if _running:
            raise HTTPException(status_code=409, detail="装机任务正在进行中")
        if not os.path.isfile(RUN_SCRIPT):
            raise HTTPException(status_code=503, detail=f"找不到脚本：{RUN_SCRIPT}")
        _running = True
        _last_started = time.time()
        _last_error = ""
    threading.Thread(
        target=_run_job,
        kwargs={"extra_args": extra_args, "timeout": timeout},
        name="pcbuilds-job",
        daemon=True,
    ).start()
    return {"ok": True, "started": True, "message": message}


@router.get("/list")
def pcbuilds_list(tier: str = Query("all")):
    """Public catalog (no auth)."""
    if _require_db is None or _get_conn is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    t = (tier or "all").strip().lower()
    if t not in VALID_TIERS:
        t = "all"
    _require_db()
    conn = _get_conn()
    with conn.cursor() as cur:
        if t == "all":
            cur.execute(
                "SELECT * FROM pc_builds ORDER BY FIELD(tier,'entry','mid','high'), sort_price ASC"
            )
        else:
            cur.execute(
                "SELECT * FROM pc_builds WHERE tier=%s ORDER BY sort_price ASC",
                (t,),
            )
        rows = cur.fetchall() or []
    builds = [_row_to_build(r) for r in rows]
    return {
        "year": current_year(),
        "tier": t,
        "count": len(builds),
        "builds": builds,
    }


@router.get("/status")
def pcbuilds_status(_admin: dict = Depends(_admin_user)):
    _ = _admin
    return {
        "running": _running,
        "last_started": _last_started or None,
        "last_finished": _last_finished or None,
        "last_ok": _last_ok,
        "last_error": _last_error,
        "last_log_tail": _last_log_tail[-800:] if _last_log_tail else "",
        "builds": _count_builds(),
        "year": current_year(),
        "script_ok": os.path.isfile(RUN_SCRIPT),
        "storage": "mysql",
    }


@router.post("/refresh")
def pcbuilds_refresh(_admin: dict = Depends(_admin_user)):
    _ = _admin
    return _start_job(
        ["--ai", "--clean"],
        "正在用 DeepSeek 生成装机方案…",
        timeout=600,
    )


@router.post("/generate")
def pcbuilds_generate(_admin: dict = Depends(_admin_user)):
    """Re-import seed / no-op placeholder kept for UI compatibility."""
    _ = _admin
    if _require_db is None or _get_conn is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    _require_db()
    conn = _get_conn()
    with conn.cursor() as cur:
        ensure_pc_builds_tables(cur)
        before = _count_builds()
        if before == 0:
            _seed_from_json(cur)
    return {
        "ok": True,
        "started": False,
        "message": f"数据库就绪，当前 { _count_builds() } 套（已取消 AI 点评刷新）",
        "builds": _count_builds(),
    }
