"""Shared-desktop resource caps (Windows). See local.env.example."""

from __future__ import annotations

import os
import sys


def _env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _cpu_thread_count(percent: int) -> int:
    n = os.cpu_count() or 4
    use = max(1, int(n * percent / 100))
    return min(use, n)


def _apply_thread_env(percent: int) -> int:
    threads = str(_cpu_thread_count(percent))
    for key in (
        "OMP_NUM_THREADS",
        "MKL_NUM_THREADS",
        "OPENBLAS_NUM_THREADS",
        "NUMEXPR_NUM_THREADS",
        "VECLIB_MAXIMUM_THREADS",
    ):
        os.environ.setdefault(key, threads)
    return int(threads)


def _apply_windows_process_caps(percent: int, priority: str) -> dict:
    import ctypes

    kernel32 = ctypes.windll.kernel32
    handle = kernel32.GetCurrentProcess()

    prio_map = {
        "idle": 0x00000040,
        "below_normal": 0x00004000,
        "normal": 0x00000020,
    }
    prio_key = (priority or "below_normal").strip().lower()
    kernel32.SetPriorityClass(handle, prio_map.get(prio_key, prio_map["below_normal"]))

    use = _cpu_thread_count(percent)
    mask = sum(1 << i for i in range(use))
    kernel32.SetProcessAffinityMask(handle, mask)
    return {"affinity_cores": use, "priority": prio_key}


def apply_shared_pc_limits() -> dict:
    """
    Limit this process so other desktop apps stay responsive.
    Controlled by local.env / system env (see local.env.example).
    """
    enabled = (os.environ.get("COMFYUI_RESOURCE_LIMIT") or "1").strip().lower()
    if enabled in ("0", "false", "no", "off"):
        return {"enabled": False}

    percent = _env_int("COMFYUI_RESOURCE_CPU_PERCENT", 75)
    percent = max(50, min(100, percent))
    priority = (os.environ.get("COMFYUI_PROCESS_PRIORITY") or "below_normal").strip()

    info = {
        "enabled": True,
        "cpu_percent": percent,
        "threads": _apply_thread_env(percent),
        "max_concurrent_jobs": comfyui_max_concurrent_jobs(),
    }

    if sys.platform == "win32":
        try:
            info.update(_apply_windows_process_caps(percent, priority))
        except Exception as exc:
            info["windows_error"] = str(exc)
    return info


def comfyui_max_concurrent_jobs() -> int:
    return max(1, _env_int("COMFYUI_MAX_CONCURRENT_JOBS", 1))


def _nvidia_smi(*args: str) -> tuple[int, str]:
    import subprocess

    try:
        p = subprocess.run(
            ["nvidia-smi", *args],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        out = ((p.stdout or "") + (p.stderr or "")).strip()
        return int(p.returncode), out
    except Exception as exc:
        return 1, str(exc)


def query_nvidia_gpu_power() -> dict:
    """当前功耗上限（瓦）。失败时返回 empty。"""
    code, out = _nvidia_smi(
        "--query-gpu=power.limit,power.max_limit,power.default_limit",
        "--format=csv,noheader,nounits",
    )
    if code != 0 or not out:
        return {"ok": False, "error": out or f"nvidia-smi exit {code}"}
    line = out.splitlines()[0]
    parts = [p.strip() for p in line.split(",")]
    try:
        return {
            "ok": True,
            "limit_w": float(parts[0]),
            "max_w": float(parts[1]) if len(parts) > 1 else None,
            "default_w": float(parts[2]) if len(parts) > 2 else None,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "raw": line}


def set_nvidia_gpu_power_percent(percent: int) -> dict:
    """
    按最大 TDP 百分比设置 GPU 功耗上限。
    percent >= 100：拉满到 power.max_limit；
    percent <= 0：nvidia-smi -rac 恢复默认。
    需要进程有改功耗权限（常见：管理员启动 API / ComfyUI）。
    """
    pct = int(percent)
    info = query_nvidia_gpu_power()
    if not info.get("ok"):
        return {"ok": False, "action": "query", **info}

    max_w = float(info.get("max_w") or 0)
    if max_w <= 0:
        return {"ok": False, "action": "query", "error": "power.max_limit invalid", **info}

    if pct <= 0:
        code, out = _nvidia_smi("-rac")
        cur = query_nvidia_gpu_power()
        return {
            "ok": code == 0,
            "action": "reset",
            "message": out,
            "before": info,
            "after": cur,
        }

    target = max_w if pct >= 100 else max(50.0, max_w * (pct / 100.0))
    target_i = int(round(target))
    code, out = _nvidia_smi("-pl", str(target_i))
    cur = query_nvidia_gpu_power()
    return {
        "ok": code == 0,
        "action": "set",
        "percent": pct,
        "target_w": target_i,
        "message": out,
        "before": info,
        "after": cur,
        "needs_admin": code != 0 and "Insufficient Permissions" in (out or ""),
    }


def video_full_gpu_power_enabled() -> bool:
    raw = (os.environ.get("COMFYUI_VIDEO_FULL_GPU_POWER") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def lift_gpu_power_for_video() -> dict:
    """成片前尽量拉满功耗；失败不抛错。"""
    if not video_full_gpu_power_enabled():
        return {"ok": True, "skipped": True, "reason": "COMFYUI_VIDEO_FULL_GPU_POWER=0"}
    return set_nvidia_gpu_power_percent(100)


def restore_gpu_power_after_video() -> dict:
    """成片后恢复日常功耗上限（local.env 的 COMFYUI_RESOURCE_GPU_POWER_PERCENT）。"""
    if not video_full_gpu_power_enabled():
        return {"ok": True, "skipped": True}
    enabled = (os.environ.get("COMFYUI_RESOURCE_LIMIT") or "1").strip().lower()
    if enabled in ("0", "false", "no", "off"):
        return set_nvidia_gpu_power_percent(0)
    pct = _env_int("COMFYUI_RESOURCE_GPU_POWER_PERCENT", 0)
    if pct <= 0:
        return set_nvidia_gpu_power_percent(0)
    return set_nvidia_gpu_power_percent(pct)
