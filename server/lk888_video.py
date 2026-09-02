"""逍遥 AI (lk888) async video via media API.

POST /media/generate { model, prompt, params }
GET  /media/status?task_id=… → result_url (video) + cost
"""

from __future__ import annotations

import base64
import os
from typing import Any, Optional, Sequence

import httpx
from fastapi import HTTPException

LK888_API_KEY = (os.environ.get("LK888_API_KEY") or "").strip()
LK888_BASE_URL = (
    os.environ.get("LK888_BASE_URL") or "https://api.lk888.ai/v1"
).strip().rstrip("/")
LK888_VIDEO_TIMEOUT = float(os.environ.get("LK888_VIDEO_TIMEOUT", "60"))
LK888_POLL_INTERVAL = float(os.environ.get("LK888_MEDIA_POLL_INTERVAL", "3"))

SEEDANCE_R2V_MODEL = "doubao-seedance-2-5-cankaosheng"
# Seedance 2.0 参考生（逍遥）；官方「快速」档位当前 currently_unavailable，改用 Mini 作快/便宜档
SEEDANCE20_R2V_MODEL = (os.environ.get("SEEDANCE20_R2V_MODEL") or "kwvideo-v2-ref").strip()
SEEDANCE20_VERSION = (os.environ.get("SEEDANCE20_VERSION") or "Mini").strip() or "Mini"


def lk888_video_configured() -> bool:
    return bool(LK888_API_KEY)


def _auth_headers(*, json_body: bool = True) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {LK888_API_KEY}"}
    if json_body:
        headers["Content-Type"] = "application/json"
    return headers


def _parse_json(resp: httpx.Response) -> dict:
    try:
        data = resp.json() if resp.content else {}
    except Exception:
        data = {}
    return data if isinstance(data, dict) else {}


def _error_detail(data: dict, resp: httpx.Response) -> str:
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict):
        msg = str(err.get("message") or err.get("code") or "").strip()
        if msg:
            return f"逍遥视频失败: {msg}"
    message = ""
    if isinstance(data, dict):
        message = str(data.get("message") or data.get("msg") or "").strip()
    detail = message or (resp.text or "")[:300] or f"HTTP {resp.status_code}"
    return f"逍遥视频失败: {detail}"


def _raise_recharge_or_502(data: dict, resp: httpx.Response) -> None:
    detail = _error_detail(data, resp)
    err = data.get("error") if isinstance(data, dict) else None
    code = ""
    if isinstance(err, dict):
        code = str(err.get("code") or "").strip().lower()
    low = detail.lower()
    if code == "recharge_required" or "recharge_required" in low:
        raise HTTPException(
            status_code=402,
            detail=(
                "逍遥 AI 开放 API 需账号至少成功充值一次后才能调用。"
                "请先在逍遥官网完成任意金额充值。"
            ),
        )
    raise HTTPException(status_code=502, detail=detail)


def _media_task_id(data: dict) -> Optional[int]:
    if not isinstance(data, dict):
        return None
    inner: Any = data.get("data")
    if isinstance(inner, dict):
        tid = inner.get("task_id")
        if tid is not None:
            try:
                return int(tid)
            except (TypeError, ValueError):
                pass
        ids = inner.get("task_ids")
        if isinstance(ids, list) and ids:
            try:
                return int(ids[0])
            except (TypeError, ValueError):
                pass
    tid = data.get("task_id")
    if tid is not None:
        try:
            return int(tid)
        except (TypeError, ValueError):
            pass
    return None


def bytes_to_data_url(raw: bytes, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def sniff_image_mime(raw: bytes, filename: str = "") -> str:
    if raw.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw.startswith(b"\x89PNG"):
        return "image/png"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    if raw[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    name = (filename or "").lower()
    if name.endswith(".png"):
        return "image/png"
    if name.endswith(".webp"):
        return "image/webp"
    if name.endswith(".gif"):
        return "image/gif"
    return "image/jpeg"


def _pick_result_url(last: dict) -> str:
    url = str(last.get("result_url") or "").strip()
    if url:
        return url
    for key in ("result_urls", "video_urls", "urls"):
        arr = last.get(key)
        if isinstance(arr, list):
            for item in arr:
                if isinstance(item, str) and item.strip():
                    return item.strip()
                if isinstance(item, dict):
                    u = item.get("url") or item.get("video_url") or item.get("result_url")
                    if isinstance(u, str) and u.strip():
                        return u.strip()
    data = last.get("data")
    if isinstance(data, dict):
        return _pick_result_url(data)
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                u = _pick_result_url(item)
                if u:
                    return u
    return ""


async def submit_media_generate(
    *,
    model: str,
    prompt: str,
    params: dict[str, Any],
) -> int:
    if not LK888_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="逍遥 AI is not configured (LK888_API_KEY).",
        )
    payload = {
        "model": model,
        "prompt": prompt,
        "params": params,
    }
    try:
        async with httpx.AsyncClient(timeout=LK888_VIDEO_TIMEOUT) as client:
            resp = await client.post(
                f"{LK888_BASE_URL}/media/generate",
                headers=_auth_headers(),
                json=payload,
            )
            data = _parse_json(resp)
            if resp.status_code >= 400 or data.get("error"):
                _raise_recharge_or_502(data, resp)
            code = data.get("code")
            if code is not None and int(code) != 200:
                msg = str(data.get("msg") or data.get("message") or "media/generate rejected")
                raise HTTPException(status_code=502, detail=f"逍遥视频失败: {msg}")
            task_id = _media_task_id(data)
            if task_id is None:
                raise HTTPException(status_code=502, detail="逍遥视频未返回 task_id。")
            return task_id
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="逍遥视频提交超时") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"逍遥视频失败: {exc}") from exc


async def poll_media_status_once(task_id: int) -> dict[str, Any]:
    """One status poll. Returns normalized dict for seedance router."""
    if not LK888_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="逍遥 AI is not configured (LK888_API_KEY).",
        )
    try:
        async with httpx.AsyncClient(timeout=LK888_VIDEO_TIMEOUT) as client:
            st = await client.get(
                f"{LK888_BASE_URL}/media/status",
                headers=_auth_headers(json_body=False),
                params={"task_id": int(task_id)},
            )
            last = _parse_json(st)
            if st.status_code >= 400 or last.get("error"):
                err = last.get("error")
                if isinstance(err, str) and err.strip():
                    return {
                        "status": "FAILED",
                        "message": err.strip(),
                        "raw": last,
                    }
                _raise_recharge_or_502(last, st)

            state = str(last.get("state") or "").strip().lower()
            is_final = bool(last.get("is_final"))
            err_msg = str(last.get("error") or "").strip()
            progress = str(last.get("progress") or "").strip()

            if state in ("failed", "error", "cancelled", "canceled"):
                return {
                    "status": "FAILED",
                    "message": err_msg or state,
                    "cost": float(last.get("cost") or 0) or None,
                    "raw": last,
                }
            if is_final or state in ("success", "succeeded", "completed", "done"):
                if err_msg and state not in ("success", "succeeded", "completed", "done"):
                    return {
                        "status": "FAILED",
                        "message": err_msg,
                        "cost": float(last.get("cost") or 0) or None,
                        "raw": last,
                    }
                result_url = _pick_result_url(last)
                if not result_url:
                    return {
                        "status": "FAILED",
                        "message": "逍遥视频完成但未返回 result_url",
                        "raw": last,
                    }
                return {
                    "status": "SUCCEEDED",
                    "video_url": result_url,
                    "cost": float(last.get("cost") or 0) or None,
                    "progress": progress or "100%",
                    "raw": last,
                }
            # still running
            running = state in ("running", "processing", "generating") or bool(progress)
            return {
                "status": "RUNNING" if running else "PENDING",
                "progress": progress,
                "message": str(last.get("status") or state or ""),
                "raw": last,
            }
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="逍遥视频状态查询超时") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"逍遥视频失败: {exc}") from exc


async def submit_seedance_r2v(
    *,
    prompt: str,
    image_data_urls: Sequence[str],
    duration: str,
    resolution: str,
    aspect_ratio: str,
    web_search: bool = False,
) -> int:
    """Submit Seedance 2.5 参考生. duration is 'auto' or '4'..'30'."""
    images = [u for u in image_data_urls if isinstance(u, str) and u.strip()]
    if not images:
        raise HTTPException(status_code=400, detail="Please upload 1–9 reference images")
    params: dict[str, Any] = {
        "duration": str(duration),
        "resolution": resolution,
        "aspect_ratio": aspect_ratio,
        "images": list(images),
        "web_search": "true" if web_search else "false",
    }
    return await submit_media_generate(
        model=SEEDANCE_R2V_MODEL,
        prompt=(prompt or "").strip() or "reference to video",
        params=params,
    )


async def submit_seedance20_r2v(
    *,
    prompt: str,
    image_data_urls: Sequence[str],
    duration: str,
    resolution: str,
    aspect_ratio: str,
    version: Optional[str] = None,
) -> int:
    """Submit Seedance 2.0 参考生 (kwvideo-v2-ref). duration is 'auto' or '4'..'15'."""
    images = [u for u in image_data_urls if isinstance(u, str) and u.strip()]
    if not images:
        raise HTTPException(status_code=400, detail="Please upload 1–9 reference images")
    ver = (version or SEEDANCE20_VERSION or "Mini").strip() or "Mini"
    params: dict[str, Any] = {
        "version": ver,
        "duration": str(duration),
        "resolution": resolution,
        "aspect_ratio": aspect_ratio,
        "images": list(images),
    }
    return await submit_media_generate(
        model=SEEDANCE20_R2V_MODEL,
        prompt=(prompt or "").strip() or "reference to video",
        params=params,
    )
