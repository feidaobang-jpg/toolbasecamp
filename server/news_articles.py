"""Admin news crawl: status + trigger run_news.sh (MySQL + static site)."""

from __future__ import annotations

import os
import subprocess
import threading
import time
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

router = APIRouter(prefix="/news", tags=["news"])
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

NEWS_HOME = os.environ.get("NEWS_HOME", "/opt/toolbasecamp-news")
NEWS_WEB_ROOT = os.environ.get("NEWS_WEB_ROOT", "/var/www/toolbasecamp-news")
RUN_SCRIPT = os.path.join(NEWS_HOME, "run_news.sh")


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
        raise HTTPException(status_code=503, detail="News admin unavailable")
    user = _get_current_user(creds)
    _require_admin(user)
    return user


def ensure_news_tables(cur: Any) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS news_articles (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            source_url VARCHAR(768) NOT NULL,
            source_name VARCHAR(128) NOT NULL DEFAULT '',
            title VARCHAR(512) NOT NULL,
            summary TEXT NULL,
            content_html MEDIUMTEXT NOT NULL,
            cover_path VARCHAR(512) NULL,
            local_path VARCHAR(512) NOT NULL,
            published_at VARCHAR(32) NULL,
            created_at DOUBLE NOT NULL,
            UNIQUE KEY uq_news_source_url (source_url),
            KEY idx_news_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )


def _count_articles() -> int:
    if _require_db is None or _get_conn is None:
        return 0
    try:
        _require_db()
        conn = _get_conn()
        try:
            with conn.cursor() as cur:
                ensure_news_tables(cur)
                cur.execute("SELECT COUNT(*) AS c FROM news_articles")
                row = cur.fetchone() or {}
                return int(row.get("c") or 0)
        finally:
            conn.close()
    except Exception:
        return 0


def _index_mtime() -> Optional[str]:
    path = os.path.join(NEWS_WEB_ROOT, "index.html")
    try:
        ts = os.path.getmtime(path)
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))
    except OSError:
        return None


def _run_crawl(extra_args: Optional[list] = None, timeout: int = 900) -> None:
    global _running, _last_finished, _last_ok, _last_log_tail, _last_error
    try:
        if not os.path.isfile(RUN_SCRIPT):
            raise RuntimeError(f"missing {RUN_SCRIPT}")
        env = os.environ.copy()
        env["NEWS_HOME"] = NEWS_HOME
        env["NEWS_WEB_ROOT"] = NEWS_WEB_ROOT
        cmd = ["bash", RUN_SCRIPT] + list(extra_args or [])
        proc = subprocess.run(
            cmd,
            cwd=NEWS_HOME,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        out = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
        _last_log_tail = out[-2000:] if out else ""
        if proc.returncode != 0:
            _last_ok = False
            _last_error = f"exit {proc.returncode}"
            if _last_log_tail:
                _last_error += ": " + _last_log_tail[-300:]
        else:
            _last_ok = True
            _last_error = ""
    except Exception as exc:
        _last_ok = False
        _last_error = str(exc)
        _last_log_tail = str(exc)
    finally:
        _last_finished = time.time()
        with _lock:
            _running = False


@router.get("/status")
def news_status(_admin: dict = Depends(_admin_user)):
    _ = _admin
    return {
        "ok": True,
        "count": _count_articles(),
        "index_updated_at": _index_mtime(),
        "public_url": "https://news.toolbasecamp.com/",
        "running": _running,
        "last_started": _last_started or None,
        "last_finished": _last_finished or None,
        "last_ok": _last_ok,
        "last_error": _last_error or None,
        "script": RUN_SCRIPT,
        "script_exists": os.path.isfile(RUN_SCRIPT),
    }


def _start_job(extra_args: Optional[list], message: str, timeout: int = 900) -> dict:
    global _running, _last_started, _last_error
    with _lock:
        if _running:
            raise HTTPException(status_code=409, detail="资讯任务正在进行中")
        if not os.path.isfile(RUN_SCRIPT):
            raise HTTPException(status_code=503, detail=f"找不到脚本：{RUN_SCRIPT}")
        _running = True
        _last_started = time.time()
        _last_error = ""
    threading.Thread(
        target=_run_crawl,
        kwargs={"extra_args": extra_args, "timeout": timeout},
        name="news-job",
        daemon=True,
    ).start()
    return {"ok": True, "started": True, "message": message}


@router.post("/refresh")
def news_refresh(_admin: dict = Depends(_admin_user)):
    _ = _admin
    return _start_job(
        None,
        "已开始抓取并编译资讯（可能需要几分钟）",
        timeout=900,
    )


@router.post("/regen")
def news_regen(_admin: dict = Depends(_admin_user)):
    """Rebuild static HTML from MySQL only (no RSS / DeepSeek)."""
    _ = _admin
    return _start_job(
        ["--regen-only"],
        "已开始从数据库重生静态页（通常更快）",
        timeout=300,
    )
