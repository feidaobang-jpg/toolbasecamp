"""
文生视频 / 图生视频：单镜短片，可多选模型依次生成便于对比。

输出目录：
  output/t2v/{date}_t2v_*/
  output/i2v/{date}_i2v_*/
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import random
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from cn_time import CN_TZ, cn_now, cn_now_str, cn_stamp_dir

from fastapi import File, Form, HTTPException, UploadFile

from output_layout import (
    alloc_under,
    delete_task_dir,
    ensure_reserved_dirs,
    folder_public_key,
    list_task_dirs,
    rel_to_root,
    resolve_task_dir,
)

_VIDEO_CLIP_TASKS: Dict[str, dict] = {}

_T2V_ENGINES = {
    "minimax_h3_t2v": {
        "label": "MiniMax H3 文生视频（Turbo 8 步·直出音频）",
        "workflow": "minimax_h3_t2v.json",
    },
    "wan22_t2v_14b": {
        "label": "Wan 2.2 14B 文生视频（fp8·20步·无LoRA·16GB）",
        "workflow": "wan22_t2v_14b.json",
    },
    "ltx25_t2v": {"label": "LTX 2.5 文生视频（直出音频）", "workflow": "ltx25_t2v.json"},
}

_I2V_ENGINES = {
    "wan22_14b_gguf": {"label": "Wan 2.2 14B 图生视频（GGUF Q5_K_M）", "workflow": "wan22_i2v"},
    "ltx25_i2v": {"label": "LTX 2.5 图生视频（直出音频）", "workflow": "ltx25_i2v.json"},
}

_ASPECT_WAN = {
    # 16GB：去掉 LightX2V LoRA 后仍需较低分辨率，避免采样阶段 OOM
    "16_9": (512, 288),
    "9_16": (288, 512),
}

_ASPECT_H3 = {
    # 16GB：INT8 权重约 19GB，配合 CLIP 放 CPU；约 0.28MP，比 864×480 更稳更快
    "16_9": (704, 400),
    "9_16": (400, 704),
}

_ASPECT_LTX = {
    # 16GB：与 H3/Wan 对齐略降分辨率；CLIP 放 CPU（见 workflow）
    "16_9": (704, 400),
    "9_16": (400, 704),
}

_DEFAULT_NEG = (
    "blurry, low quality, distorted, watermark, text, logo, subtitle, "
    "static image, frozen pose, no motion"
)


def _cn_now_str() -> str:
    return cn_now_str()


def _now_ms() -> int:
    return int(time.time() * 1000)


def _format_elapsed(sec: float) -> str:
    sec = max(0.0, float(sec or 0.0))
    if sec < 60:
        return f"{sec:.1f}s"
    m = int(sec // 60)
    s = int(round(sec - m * 60))
    if s >= 60:
        m += 1
        s = 0
    return f"{m}m{s:02d}s"


def _normalize_kind(raw: str) -> str:
    k = (raw or "").strip().lower().replace("-", "_")
    if k in ("t2v", "text", "text_to_video", "txt2vid"):
        return "t2v"
    if k in ("i2v", "image", "image_to_video", "img2vid"):
        return "i2v"
    return "t2v"


def _normalize_aspect(raw: str) -> str:
    a = (raw or "").strip().lower().replace("-", "_").replace(":", "_")
    if a in ("9_16", "916", "portrait", "vertical"):
        return "9_16"
    return "16_9"


def _normalize_engine(raw: str, kind: str) -> Optional[str]:
    m = (raw or "").strip().lower().replace("-", "_").replace(".", "")
    table = _T2V_ENGINES if kind == "t2v" else _I2V_ENGINES
    aliases = {
        "minimax_h3_t2v": "minimax_h3_t2v",
        "minimax_h3": "minimax_h3_t2v",
        "minimaxh3": "minimax_h3_t2v",
        "h3": "minimax_h3_t2v",
        "h3_t2v": "minimax_h3_t2v",
        # 已下线的 5B：旧勾选映射到现默认引擎
        "wan22_t2v_5b": "minimax_h3_t2v" if kind == "t2v" else None,
        "wan5b_t2v": "minimax_h3_t2v",
        "wan22_t2v_14b": "wan22_t2v_14b",
        "wan22_t2v": "wan22_t2v_14b",
        "ltx25_t2v": "ltx25_t2v",
        "ltx_t2v": "ltx25_t2v",
        "wan22_5b": "wan22_14b_gguf",
        "wan5b": "wan22_14b_gguf",
        "wan22_ti2v_5b": "wan22_14b_gguf",
        "wan22_14b_gguf": "wan22_14b_gguf",
        "wan22_14b": "wan22_14b_gguf",
        "i2v": "wan22_14b_gguf",
        "ltx25_i2v": "ltx25_i2v",
        "ltx_i2v": "ltx25_i2v",
        "ltx": "ltx25_i2v" if kind == "i2v" else "ltx25_t2v",
    }
    key = aliases.get(m, m)
    if not key:
        return None
    return key if key in table else None


def _parse_engines(raw_modes, raw_single: str, kind: str) -> List[str]:
    items: List[str] = []
    if isinstance(raw_modes, list):
        items = [str(x) for x in raw_modes]
    elif isinstance(raw_modes, str) and raw_modes.strip():
        s = raw_modes.strip()
        if s.startswith("["):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    items = [str(x) for x in parsed]
                else:
                    items = [s]
            except Exception:
                items = [x.strip() for x in s.split(",") if x.strip()]
        else:
            items = [x.strip() for x in s.replace(";", ",").split(",") if x.strip()]
    if not items and raw_single:
        items = [str(raw_single)]
    out: List[str] = []
    seen = set()
    for it in items:
        m = _normalize_engine(it, kind)
        if m and m not in seen:
            seen.add(m)
            out.append(m)
    if out:
        return out
    return ["minimax_h3_t2v"] if kind == "t2v" else ["wan22_14b_gguf"]


def _clamp_duration(raw) -> float:
    try:
        v = float(raw)
    except Exception:
        v = 5.0
    return max(3.0, min(10.0, v))


def _length_for_duration(duration_sec: float, fps: int = 24) -> int:
    frames = int(round(float(duration_sec) * float(fps)))
    n = max(8, (frames - 1) // 4)
    length = n * 4 + 1
    return max(33, min(241, length))


def _engine_label(mode: str, kind: str) -> str:
    table = _T2V_ENGINES if kind == "t2v" else _I2V_ENGINES
    return (table.get(mode) or {}).get("label") or mode


class VideoClipAPI:
    def __init__(self, **deps: Any):
        self.deps = deps
        self.deps["output_root"] = Path(deps["output_root"])
        self.tasks = _VIDEO_CLIP_TASKS

    def _log(self, task: dict, msg: str) -> None:
        line = f"[{_cn_now_str()}] {msg}"
        logs = task.setdefault("logs", [])
        logs.append(line)
        if len(logs) > 400:
            del logs[:-400]
        try:
            d = self._task_dir(task)
            with open(d / "pipeline.log", "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass

    def _alloc_dir(self, kind: str) -> str:
        root: Path = self.deps["output_root"]
        ensure_reserved_dirs(root)
        cat = "t2v" if kind == "t2v" else "i2v"
        base = datetime.now().strftime("%Y-%m-%d_%H-%M") + f"_{cat}"
        return alloc_under(root, cat, base)

    def _task_dir(self, task: dict) -> Path:
        root: Path = self.deps["output_root"]
        folder = (task.get("output_dir") or "").strip() or task["task_id"]
        resolved = resolve_task_dir(root, folder)
        if resolved is not None:
            resolved.mkdir(parents=True, exist_ok=True)
            return resolved
        d = root / folder
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _folder_key(self, task_dir: Path) -> str:
        return folder_public_key(task_dir, self.deps["output_root"])

    def _public_url(self, task: dict, filename: str) -> str:
        folder = (task.get("output_dir") or "").strip() or task["task_id"]
        name = str(filename).replace("\\", "/").lstrip("/")
        return f"/output/{folder}/{name}"

    def _save_snapshot(self, task: dict) -> None:
        try:
            d = self._task_dir(task)
            snap = {
                "task_id": task.get("task_id"),
                "kind": task.get("kind"),
                "status": task.get("status"),
                "stage": task.get("stage"),
                "prompt": task.get("prompt"),
                "negative": task.get("negative"),
                "aspect": task.get("aspect"),
                "duration_sec": task.get("duration_sec"),
                "video_modes": task.get("video_modes"),
                "video_mode": task.get("video_mode"),
                "video_urls": task.get("video_urls"),
                "video_url": task.get("video_url"),
                "seed": task.get("seed"),
                "error": task.get("error"),
                "created_at": task.get("created_at"),
                "export_hint": task.get("export_hint"),
                "source_image": task.get("source_image"),
                "timing": task.get("timing"),
                "output_dir": task.get("output_dir"),
            }
            (d / "task.json").write_text(
                json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except Exception:
            pass

    def _public_status(self, task: dict) -> dict:
        return {
            "success": True,
            "task_id": task.get("task_id"),
            "status": task.get("status"),
            "stage": task.get("stage"),
            "progress": task.get("progress") or {"current": 0, "total": 1},
            "logs": list(task.get("logs") or []),
            "error": task.get("error") or "",
            "kind": task.get("kind"),
            "prompt": task.get("prompt"),
            "negative": task.get("negative"),
            "aspect": task.get("aspect"),
            "duration_sec": task.get("duration_sec"),
            "video_modes": task.get("video_modes") or [],
            "video_mode": task.get("video_mode"),
            "video_urls": task.get("video_urls") or [],
            "video_url": task.get("video_url") or "",
            "export_hint": task.get("export_hint") or "",
            "output_dir": task.get("output_dir") or "",
            "output_directory": task.get("output_directory") or "",
            "source_image": task.get("source_image") or "",
            "seed": task.get("seed"),
            "timing": task.get("timing") or {},
        }

    async def _free_vram(self, task: dict, tip: str = "") -> None:
        free_fn = self.deps.get("free_comfyui_memory")
        if not free_fn:
            return
        try:
            await free_fn()
            # 再清一次并稍等，减轻 14B 加载前显存碎片（尤其刚跑完 H3/LTX）
            await free_fn()
            await asyncio.sleep(1.5)
            self._log(task, f"已释放 ComfyUI 显存{(' · ' + tip) if tip else ''}")
        except Exception as e:
            self._log(task, f"释放显存失败（可忽略）：{e}")

    def _build_workflow(
        self,
        *,
        kind: str,
        mode: str,
        prompt: str,
        negative: str,
        aspect: str,
        duration_sec: float,
        seed: Optional[int],
        comfy_image: str = "",
    ) -> Tuple[dict, str]:
        wan_wh = _ASPECT_WAN[aspect]
        ltx_wh = _ASPECT_LTX[aspect]
        length = _length_for_duration(duration_sec)
        seed_i = int(seed) if seed is not None else random.randint(1, 2_000_000_000)
        neg = (negative or "").strip() or _DEFAULT_NEG
        prompt_s = (prompt or "").strip()

        if kind == "t2v":
            if mode == "minimax_h3_t2v":
                h3_wh = _ASPECT_H3[aspect]
                # 16GB：时长封顶约 5s，配合 Turbo 8 步
                dur = min(5.0, float(duration_sec))
                wf = self.deps["build_minimax_h3_t2v_workflow"](
                    prompt_s,
                    seed=seed_i,
                    width=h3_wh[0],
                    height=h3_wh[1],
                    duration_sec=dur,
                    fps=24,
                    steps=8,
                )
                note = f"MiniMax H3 T2V Turbo8 · {h3_wh[0]}×{h3_wh[1]} · {dur:g}s"
            elif mode == "wan22_t2v_14b":
                # 无 LightX2V（LoRA 合并会 OOM）；20 步；帧数封顶 25（~1.5s@16fps）
                length_14 = min(25, _length_for_duration(min(2.0, float(duration_sec)), fps=16))
                wf = self.deps["build_wan22_t2v_workflow"](
                    prompt_s,
                    negative_text=neg,
                    seed=seed_i,
                    width=wan_wh[0],
                    height=wan_wh[1],
                    length=length_14,
                    fps=16,
                    steps=20,
                )
                note = f"Wan2.2-14B T2V 20步无LoRA · {wan_wh[0]}×{wan_wh[1]} · {length_14}帧@16fps（16GB）"
            else:
                wf = self.deps["build_ltx25_t2v_workflow"](
                    prompt_s,
                    seed=seed_i,
                    width=ltx_wh[0],
                    height=ltx_wh[1],
                    duration_sec=duration_sec,
                    fps=24,
                )
                note = f"LTX-2.5 T2V · {ltx_wh[0]}×{ltx_wh[1]} · {duration_sec:g}s"
            return wf, note

        if not comfy_image:
            raise RuntimeError("图生视频缺少首帧图")
        motion = (
            f"Use the provided start image as frame 1. {prompt_s}. "
            "Subtle cinematic motion, temporal continuity."
            if prompt_s
            else "Use the provided start image as frame 1. Subtle cinematic motion."
        )
        if mode == "wan22_14b_gguf":
            wf = self.deps["build_wan22_ti2v_workflow"](
                comfy_image,
                motion,
                negative_text=neg,
                seed=seed_i,
                width=wan_wh[0],
                height=wan_wh[1],
                length=length,
                fps=24,
            )
            note = f"Wan2.2-14B GGUF I2V · {wan_wh[0]}×{wan_wh[1]} · {length}帧"
        else:
            wf = self.deps["build_ltx25_i2v_workflow"](
                comfy_image,
                motion,
                seed=seed_i,
                width=ltx_wh[0],
                height=ltx_wh[1],
                duration_sec=duration_sec,
                fps=24,
                strength=0.82,
            )
            note = f"LTX-2.5 I2V · {ltx_wh[0]}×{ltx_wh[1]} · {duration_sec:g}s"
        return wf, note

    async def _run_task(self, task_id: str) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        kind = task["kind"]
        modes = list(task.get("video_modes") or [])
        multi = len(modes) > 1
        n = len(modes)
        video_urls: List[dict] = []
        last: Optional[dict] = None
        total_sec = 0.0
        task_dir = self._task_dir(task)
        comfy_name = ""

        try:
            if kind == "i2v":
                src_name = task.get("source_image") or "source.png"
                src_path = task_dir / src_name
                if not src_path.is_file():
                    raise RuntimeError("缺少首帧图")
                upload = self.deps["upload_image_bytes"]
                comfy_name, _sub = await upload(
                    src_path.read_bytes(), name_prefix=f"clip_i2v_{task_id[:8]}_"
                )
                if not comfy_name:
                    raise RuntimeError("上传首帧到 ComfyUI 失败")

            task["stage"] = "video"
            task["progress"] = {"current": 0, "total": n}
            self._log(
                task,
                f"开始{'文生' if kind == 't2v' else '图生'}视频，共 {n} 个模型"
                + ("（依次对比）" if multi else ""),
            )

            run_video = self.deps["run_comfyui_and_get_last_video"]
            seen_hashes: set[str] = set()
            for ei, mode in enumerate(modes):
                if task.get("status") == "cancelled":
                    self._log(task, "已取消")
                    self._save_snapshot(task)
                    return
                label = _engine_label(mode, kind)
                task["video_mode"] = mode
                task["progress"] = {"current": ei, "total": n}
                self._log(
                    task,
                    f"对比 {ei + 1}/{n}：{label}" if multi else f"引擎：{label}",
                )
                await self._free_vram(task, label)
                t0 = time.perf_counter()
                try:
                    wf, note = self._build_workflow(
                        kind=kind,
                        mode=mode,
                        prompt=task.get("prompt") or "",
                        negative=task.get("negative") or "",
                        aspect=task["aspect"],
                        duration_sec=float(task["duration_sec"]),
                        seed=task.get("seed"),
                        comfy_image=comfy_name,
                    )
                    self._log(task, f"提交 ComfyUI（{note}）…")
                    vid_bytes = await run_video(wf)
                    digest = hashlib.md5(vid_bytes).hexdigest()
                    if digest in seen_hashes:
                        raise RuntimeError(
                            "成片与上一引擎字节完全相同（疑似误取旧 mp4，已丢弃；"
                            "请确认该引擎工作流是否真正写出新视频）"
                        )
                    seen_hashes.add(digest)
                    elapsed = time.perf_counter() - t0
                    total_sec += elapsed
                    out_name = (
                        f"clip_{mode}_{task['aspect']}.mp4"
                        if multi
                        else f"clip_{task['aspect']}.mp4"
                    )
                    out_path = task_dir / out_name
                    out_path.write_bytes(vid_bytes)
                    item = {
                        "mode": mode,
                        "label": label,
                        "filename": out_name,
                        "url": self._public_url(task, out_name),
                        "elapsed_sec": round(elapsed, 2),
                        "engine_note": note,
                    }
                    video_urls.append(item)
                    last = item
                    self._log(
                        task,
                        f"第 {ei + 1}/{n} 个完成（{label}），耗时 {_format_elapsed(elapsed)}",
                    )
                except Exception as e:
                    elapsed = time.perf_counter() - t0
                    total_sec += elapsed
                    self._log(
                        task,
                        f"第 {ei + 1}/{n} 个失败（{label}），耗时 {_format_elapsed(elapsed)}：{e}",
                    )
                finally:
                    if ei + 1 < n:
                        await self._free_vram(task, f"{label} 结束")

            if task.get("status") == "cancelled":
                self._save_snapshot(task)
                return
            if not last:
                raise RuntimeError("全部模型均失败")

            primary = f"clip_{task['aspect']}.mp4"
            primary_path = task_dir / primary
            src = task_dir / last["filename"]
            if src.exists() and primary_path.resolve() != src.resolve():
                primary_path.write_bytes(src.read_bytes())

            task["video_url"] = self._public_url(task, primary)
            task["video_urls"] = video_urls
            task["output_directory"] = str(task_dir.resolve())
            task["timing"] = {"video_total_sec": round(total_sec, 2)}
            task["export_hint"] = (
                f"已生成 {len(video_urls)} 条成片"
                + ("，可在下方切换对比。" if multi else "。")
                + "文件在任务目录。"
            )
            task["status"] = "done"
            task["stage"] = "done"
            task["progress"] = {"current": n, "total": n}
            self._log(
                task,
                f"完成：{primary}"
                + (f"（对比 {len(video_urls)} 引擎）" if multi else "")
                + f"，本批总耗时 {_format_elapsed(total_sec)}",
            )
            self._save_snapshot(task)
        except Exception as e:
            if task.get("status") != "cancelled":
                task["status"] = "error"
                task["stage"] = "error"
                task["error"] = str(e)
                self._log(task, f"失败：{e}")
                self._save_snapshot(task)

    def register(self, app) -> None:
        api = self

        @app.get("/video-clip/defaults")
        @app.get("/api/video-clip/defaults")
        async def vc_defaults(kind: str = "t2v"):
            k = _normalize_kind(kind)
            engines = _T2V_ENGINES if k == "t2v" else _I2V_ENGINES
            return {
                "success": True,
                "kind": k,
                "engines": {mid: meta["label"] for mid, meta in engines.items()},
                "default_engine": "minimax_h3_t2v" if k == "t2v" else "wan22_14b_gguf",
                "aspects": {"16_9": "横屏 16:9", "9_16": "竖屏 9:16"},
                "duration_min": 3,
                "duration_max": 10,
                "duration_default": 5,
                "workflows": {
                    "t2v": "minimax_h3_t2v.json / wan22_t2v_14b.json（LightX2V 4步）/ ltx25_t2v.json",
                    "i2v": "wan22_i2v_14b_gguf / ltx25_i2v.json",
                },
                "hint": (
                    "文生视频默认 MiniMax H3（Turbo 8 步·直出音频；CLIP 放 CPU，约 704×400，适配 16GB）。"
                    "Wan 14B：已去掉 LightX2V（LoRA 合并 OOM），改 20 步 + 512×288；Wan 5B 已下线。"
                    if k == "t2v"
                    else "图生视频默认 Wan 2.2 14B GGUF；Wan 5B 已下线。"
                ),
            }

        @app.post("/video-clip/start")
        @app.post("/api/video-clip/start")
        async def vc_start(
            kind: str = Form("t2v"),
            prompt: str = Form(""),
            negative: str = Form(""),
            aspect: str = Form("16_9"),
            duration_sec: str = Form("5"),
            video_mode: str = Form(""),
            video_modes: str = Form(""),
            seed: str = Form(""),
            image: Optional[UploadFile] = File(None),
        ):
            k = _normalize_kind(kind)
            text = (prompt or "").strip()
            if k == "t2v" and len(text) < 2:
                raise HTTPException(status_code=400, detail="请填写提示词")
            if k == "i2v" and image is None:
                raise HTTPException(status_code=400, detail="请上传首帧图")
            modes = _parse_engines(video_modes, video_mode, k)
            aspect_n = _normalize_aspect(aspect)
            dur = _clamp_duration(duration_sec)
            seed_v: Optional[int] = None
            raw_seed = (seed or "").strip()
            if raw_seed:
                try:
                    seed_v = int(raw_seed)
                except Exception:
                    seed_v = None

            task_id = uuid.uuid4().hex
            out_dir = api._alloc_dir(k)
            task = {
                "task_id": task_id,
                "output_dir": out_dir,
                "status": "running",
                "stage": "prepare",
                "progress": {"current": 0, "total": len(modes)},
                "logs": [],
                "error": "",
                "created_at": _now_ms(),
                "kind": k,
                "prompt": text,
                "negative": (negative or "").strip(),
                "aspect": aspect_n,
                "duration_sec": dur,
                "video_mode": modes[0],
                "video_modes": modes,
                "video_urls": [],
                "video_url": "",
                "seed": seed_v,
                "source_image": "",
                "timing": {},
            }
            api.tasks[task_id] = task
            task_dir = api._task_dir(task)
            if k == "i2v" and image is not None:
                raw = await image.read()
                if not raw:
                    raise HTTPException(status_code=400, detail="图片为空")
                ext = Path(image.filename or "source.png").suffix.lower() or ".png"
                if ext not in (".png", ".jpg", ".jpeg", ".webp"):
                    ext = ".png"
                src_name = f"source{ext}"
                (task_dir / src_name).write_bytes(raw)
                task["source_image"] = src_name
            api._log(
                task,
                f"任务已创建（{'文生视频' if k == 't2v' else '图生视频'}，"
                f"{aspect_n}，{dur:g}s，模型 {len(modes)} 个）",
            )
            api._save_snapshot(task)
            asyncio.create_task(api._run_task(task_id))
            return api._public_status(task)

        @app.get("/video-clip/status")
        @app.get("/api/video-clip/status")
        async def vc_status(task_id: str):
            task = api.tasks.get(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            return api._public_status(task)

        @app.post("/video-clip/cancel")
        @app.post("/api/video-clip/cancel")
        async def vc_cancel(task_id: str = Form(...)):
            task = api.tasks.get(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            if task.get("status") == "running":
                task["status"] = "cancelled"
                task["stage"] = "cancelled"
                api._log(task, "收到取消请求…")
                api._save_snapshot(task)
            return api._public_status(task)

        @app.post("/video-clip/reveal-output")
        @app.post("/api/video-clip/reveal-output")
        async def vc_reveal(task_id: str = Form(""), folder: str = Form("")):
            import os
            import platform
            import subprocess

            root: Path = api.deps["output_root"]
            key = (folder or "").strip() or (task_id or "").strip()
            if not key:
                raise HTTPException(status_code=400, detail="缺少 task_id 或 folder")
            task = api.tasks.get(key)
            if task and task.get("output_dir"):
                key = task["output_dir"]
            d = resolve_task_dir(root, key)
            if d is None or not d.is_dir():
                raise HTTPException(status_code=404, detail="目录不存在")
            path = str(d.resolve())
            try:
                system = platform.system()
                if system == "Windows":
                    os.startfile(path)  # type: ignore[attr-defined]
                elif system == "Darwin":
                    subprocess.Popen(["open", path])
                else:
                    subprocess.Popen(["xdg-open", path])
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"无法打开目录：{e}")
            return {"success": True, "path": path}

        @app.get("/video-clip/history")
        @app.get("/api/video-clip/history")
        async def vc_history(kind: str = "t2v", limit: int = 24):
            k = _normalize_kind(kind)
            root: Path = api.deps["output_root"]
            cat = "t2v" if k == "t2v" else "i2v"
            dirs = list_task_dirs(root, cat, limit=limit)
            items = []
            for p in dirs:
                meta: dict = {}
                tj = p / "task.json"
                if tj.exists():
                    try:
                        meta = json.loads(tj.read_text(encoding="utf-8"))
                    except Exception:
                        meta = {}
                folder = rel_to_root(root, p)
                videos = []
                for vu in meta.get("video_urls") or []:
                    if isinstance(vu, dict) and vu.get("url"):
                        videos.append(vu)
                if not videos:
                    for mp4 in sorted(p.glob("clip_*.mp4")):
                        videos.append(
                            {
                                "filename": mp4.name,
                                "url": f"/output/{folder}/{mp4.name}",
                                "label": mp4.stem,
                            }
                        )
                items.append(
                    {
                        "folder": folder,
                        "task_id": meta.get("task_id") or "",
                        "kind": meta.get("kind") or k,
                        "prompt": meta.get("prompt") or "",
                        "aspect": meta.get("aspect") or "",
                        "duration_sec": meta.get("duration_sec"),
                        "video_modes": meta.get("video_modes") or [],
                        "video_url": meta.get("video_url")
                        or (videos[0]["url"] if videos else ""),
                        "video_urls": videos,
                        "status": meta.get("status") or "",
                        "created_at": meta.get("created_at"),
                        "source_image": (
                            f"/output/{folder}/{meta['source_image']}"
                            if meta.get("source_image")
                            else ""
                        ),
                    }
                )
            return {"success": True, "items": items}

        @app.post("/video-clip/delete")
        @app.post("/api/video-clip/delete")
        async def vc_delete(folder: str = Form("")):
            root: Path = api.deps["output_root"]
            rel = (folder or "").strip().replace("\\", "/")
            if not rel:
                raise HTTPException(status_code=400, detail="缺少 folder")
            d = resolve_task_dir(root, rel)
            if d is None or not d.is_dir():
                raise HTTPException(status_code=404, detail="目录不存在")
            parent_name = d.resolve().parent.name
            cat = parent_name if parent_name in ("t2v", "i2v") else None
            if cat is None and d.resolve().parent != Path(root).resolve():
                raise HTTPException(status_code=400, detail="非法目录（仅允许 t2v/i2v）")
            try:
                deleted = delete_task_dir(root, rel, category=cat)
            except FileNotFoundError as e:
                raise HTTPException(status_code=404, detail=str(e)) from e
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            return {"success": True, "folder": rel_to_root(root, deleted)}

        @app.post("/video-clip/open")
        @app.post("/api/video-clip/open")
        async def vc_open(folder: str = Form(...)):
            """打开历史：返回 task.json 内容供表单回填。"""
            root: Path = api.deps["output_root"]
            d = resolve_task_dir(root, (folder or "").strip())
            if d is None or not d.is_dir():
                raise HTTPException(status_code=404, detail="历史不存在")
            meta: dict = {}
            tj = d / "task.json"
            if tj.exists():
                try:
                    meta = json.loads(tj.read_text(encoding="utf-8"))
                except Exception:
                    meta = {}
            folder_key = rel_to_root(root, d)
            videos = list(meta.get("video_urls") or [])
            if not videos:
                for mp4 in sorted(d.glob("clip_*.mp4")):
                    videos.append(
                        {
                            "filename": mp4.name,
                            "url": f"/output/{folder_key}/{mp4.name}",
                            "label": mp4.stem,
                        }
                    )
            src = meta.get("source_image") or ""
            return {
                "success": True,
                "folder": folder_key,
                "task_id": meta.get("task_id") or "",
                "kind": meta.get("kind") or "",
                "prompt": meta.get("prompt") or "",
                "negative": meta.get("negative") or "",
                "aspect": meta.get("aspect") or "16_9",
                "duration_sec": meta.get("duration_sec") or 5,
                "video_modes": meta.get("video_modes") or [],
                "video_mode": meta.get("video_mode") or "",
                "seed": meta.get("seed"),
                "video_url": meta.get("video_url")
                or (videos[0]["url"] if videos else ""),
                "video_urls": videos,
                "source_image": f"/output/{folder_key}/{src}" if src else "",
                "export_hint": meta.get("export_hint") or "",
                "status": meta.get("status") or "done",
            }
