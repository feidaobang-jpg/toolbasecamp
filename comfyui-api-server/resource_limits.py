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
