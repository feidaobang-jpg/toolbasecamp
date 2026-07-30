"""Admin PC builds: status + trigger run_pc.sh (ZOL crawl / DeepSeek / JSON)."""

from __future__ import annotations

import os
import subprocess
import threading
import time
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

router = APIRouter(prefix="/pcbuilds", tags=["pcbuilds"])
security = HTTPBearer(auto_error=False)

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
JSON_PATH = os.environ.get(
    "PC_BUILDS_JSON", os.path.join(PC_WEB_ROOT, "data", "pc_builds.json")
)


def wire(
    get_current_user: Callable[..., Any],
    require_admin: Callable[[dict], None],
) -> None:
    global _get_current_user, _require_admin
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


def _json_mtime() -> Optional[str]:
    try:
        if not os.path.isfile(JSON_PATH):
            return None
        return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(os.path.getmtime(JSON_PATH)))
    except OSError:
        return None


def _count_builds() -> int:
    try:
        import json

        with open(JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return len(data) if isinstance(data, list) else 0
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
        env["PC_BUILDS_JSON"] = JSON_PATH
        cmd = ["bash", RUN_SCRIPT] + list(extra_args or ["--crawl", "--clean"])
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
        if proc.returncode != 0:
            _last_error = f"exit {proc.returncode}"
        else:
            _last_error = ""
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
        "json_mtime": _json_mtime(),
        "json_path": JSON_PATH,
        "script_ok": os.path.isfile(RUN_SCRIPT),
    }


@router.post("/refresh")
def pcbuilds_refresh(_admin: dict = Depends(_admin_user)):
    """Full crawl + AI (may fail on cloud IP). Prefer local crawl when possible."""
    _ = _admin
    return _start_job(
        ["--crawl", "--clean"],
        "已开始更新装机（爬取可能因机房 IP 失败，可改本地跑脚本后推送 JSON）",
        timeout=900,
    )


@router.post("/generate")
def pcbuilds_generate(_admin: dict = Depends(_admin_user)):
    """Refresh AI reviews from existing JSON only."""
    _ = _admin
    return _start_job(
        ["--generate"],
        "已开始按现有 JSON 刷新 AI 点评",
        timeout=600,
    )
