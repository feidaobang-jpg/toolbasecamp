"""
可选 Seedance 2.5 云端成片（字节方舟 / ModelArk）。

环境变量（本机 comfyui-api-server / VPS 均可）：
  SEEDANCE_API_KEY 或 ARK_API_KEY
  SEEDANCE_API_BASE 默认 https://ark.cn-beijing.volces.com/api/v3
  SEEDANCE_MODEL 默认 doubao-seedance-1-5-pro-251215（可按控制台模型 ID 改）
若未配置 Key，引擎选项仍可显示，调用时会明确报错。
"""
from __future__ import annotations

import asyncio
import base64
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests


def seedance_configured() -> bool:
    return bool((os.environ.get("SEEDANCE_API_KEY") or os.environ.get("ARK_API_KEY") or "").strip())


def _api_key() -> str:
    return (os.environ.get("SEEDANCE_API_KEY") or os.environ.get("ARK_API_KEY") or "").strip()


def _base() -> str:
    return (
        os.environ.get("SEEDANCE_API_BASE")
        or os.environ.get("ARK_BASE_URL")
        or "https://ark.cn-beijing.volces.com/api/v3"
    ).rstrip("/")


def _model() -> str:
    return (
        os.environ.get("SEEDANCE_MODEL")
        or os.environ.get("ARK_SEEDANCE_MODEL")
        or "doubao-seedance-1-5-pro-251215"
    ).strip()


def _image_to_data_url(path: Path) -> str:
    raw = Path(path).read_bytes()
    b64 = base64.b64encode(raw).decode("ascii")
    suf = Path(path).suffix.lower()
    mime = "image/png" if suf == ".png" else "image/jpeg"
    return f"data:{mime};base64,{b64}"


def create_seedance_task(
    *,
    prompt: str,
    image_path: Optional[Path] = None,
    duration: int = 5,
    ratio: str = "16:9",
    resolution: str = "720p",
    generate_audio: bool = True,
) -> str:
    key = _api_key()
    if not key:
        raise RuntimeError("未配置 SEEDANCE_API_KEY / ARK_API_KEY，无法调用 Seedance 云端")
    content: List[Dict[str, Any]] = [{"type": "text", "text": (prompt or "").strip()[:8000]}]
    if image_path and Path(image_path).exists():
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": _image_to_data_url(Path(image_path))},
                "role": "first_frame",
            }
        )
    payload: Dict[str, Any] = {
        "model": _model(),
        "content": content,
        "duration": max(4, min(30, int(duration or 5))),
        "ratio": ratio,
        "resolution": resolution,
        "generate_audio": bool(generate_audio),
        "watermark": False,
    }
    url = f"{_base()}/contents/generations/tasks"
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"Seedance 创建任务失败 HTTP {r.status_code}: {(r.text or '')[:500]}")
    data = r.json() or {}
    tid = str(data.get("id") or data.get("task_id") or "").strip()
    if not tid:
        raise RuntimeError(f"Seedance 未返回 task id: {str(data)[:400]}")
    return tid


def poll_seedance_task(task_id: str, *, timeout_sec: float = 900.0) -> str:
    key = _api_key()
    url = f"{_base()}/contents/generations/tasks/{task_id}"
    t0 = time.time()
    while time.time() - t0 < timeout_sec:
        r = requests.get(
            url,
            headers={"Authorization": f"Bearer {key}"},
            timeout=60,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Seedance 查询失败 HTTP {r.status_code}: {(r.text or '')[:400]}")
        data = r.json() or {}
        status = str(data.get("status") or data.get("task_status") or "").lower()
        if status in ("succeeded", "success", "completed", "done"):
            # 常见字段：content.video_url / output.video_url / result.video_url
            for path in (
                ("content", "video_url"),
                ("output", "video_url"),
                ("result", "video_url"),
                ("data", "video_url"),
            ):
                cur: Any = data
                ok = True
                for k in path:
                    if not isinstance(cur, dict) or k not in cur:
                        ok = False
                        break
                    cur = cur[k]
                if ok and isinstance(cur, str) and cur.startswith("http"):
                    return cur
            # 数组 content
            c = data.get("content")
            if isinstance(c, list):
                for it in c:
                    if isinstance(it, dict):
                        u = it.get("video_url") or (it.get("video") or {}).get("url")
                        if isinstance(u, str) and u.startswith("http"):
                            return u
            raise RuntimeError(f"Seedance 成功但无视频 URL: {str(data)[:500]}")
        if status in ("failed", "error", "cancelled", "canceled"):
            raise RuntimeError(f"Seedance 失败: {str(data)[:500]}")
        time.sleep(4.0)
    raise RuntimeError(f"Seedance 超时（{int(timeout_sec)}s）task={task_id}")


def download_url(url: str, out_path: Path) -> Path:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 256):
                if chunk:
                    f.write(chunk)
    if out_path.stat().st_size <= 0:
        raise RuntimeError("Seedance 下载文件为空")
    return out_path


async def run_seedance_i2v(
    *,
    prompt: str,
    image_path: Path,
    out_mp4: Path,
    duration: float = 5.0,
    aspect: str = "16_9",
    resolution: str = "720p",
) -> Path:
    ratio = "16:9" if aspect == "16_9" else "9:16"
    tid = await asyncio.to_thread(
        create_seedance_task,
        prompt=prompt,
        image_path=image_path,
        duration=int(round(duration)),
        ratio=ratio,
        resolution=resolution,
        generate_audio=True,
    )
    video_url = await asyncio.to_thread(poll_seedance_task, tid)
    return await asyncio.to_thread(download_url, video_url, out_mp4)
