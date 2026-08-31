"""
1 分钟预告流水线（半自动）：
  DeepSeek 分镜剧本 → Z-Image 每镜多候选 → 人工勾选 → Edge-TTS + Ken Burns 粗剪。

真 Comfy I2V/T2V（Wan/LTX）尚未接入 API；本模块先产出可剪映精剪的素材包与预览成片。
"""
from __future__ import annotations

import asyncio
import json
import random
import re
import time
import uuid
import wave
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import requests
from fastapi import Form, HTTPException
from fastapi.responses import JSONResponse
from moviepy.editor import (
    AudioFileClip,
    CompositeVideoClip,
    ImageClip,
    concatenate_videoclips,
)
from PIL import Image

if not hasattr(Image, "ANTIALIAS"):
    Image.ANTIALIAS = Image.Resampling.LANCZOS

_TRAILER_TASKS: Dict[str, dict] = {}

_VISUAL_STYLES = {
    "realistic": {
        "label": "写实",
        "suffix": "photorealistic, cinematic lighting, film still, natural skin texture, shallow depth of field",
        "zh": "写实电影质感，自然光影，摄影级细节",
    },
    "cartoon": {
        "label": "卡通",
        "suffix": "stylized cartoon illustration, clean lines, vibrant colors, soft shading, animated movie still",
        "zh": "卡通插画风格，干净线条，鲜明配色，动画电影定格",
    },
    "anime": {
        "label": "二次元",
        "suffix": "anime style, detailed anime key visual, cel shading, expressive eyes, high quality anime still",
        "zh": "日系二次元动画风格，赛璐璐上色，高质量原画",
    },
    "ink": {
        "label": "水墨",
        "suffix": "Chinese ink wash painting style, brush strokes, misty atmosphere, traditional art, elegant composition",
        "zh": "中国水墨画风格，笔触晕染，烟雨意境",
    },
}

_ASPECT_SIZES = {
    "16_9": (1280, 720),
    "9_16": (720, 1280),
}

_ASPECT_VIDEO = {
    "16_9": (1920, 1080),
    "9_16": (1080, 1920),
}


def _now_ts_ms() -> int:
    return int(time.time() * 1000)


def _style_meta(style: str) -> dict:
    key = (style or "realistic").strip().lower()
    return _VISUAL_STYLES.get(key) or _VISUAL_STYLES["realistic"]


def _normalize_aspect(aspect: str) -> str:
    a = (aspect or "16_9").strip().lower().replace(":", "_").replace("-", "_")
    if a in ("169", "16x9", "landscape"):
        return "16_9"
    if a in ("916", "9x16", "portrait"):
        return "9_16"
    return "16_9" if a not in _ASPECT_SIZES else a


def _extract_json_object(text: str) -> Optional[dict]:
    raw = (text or "").strip()
    if not raw:
        return None
    raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        obj = json.loads(raw)
        return obj if isinstance(obj, dict) else None
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


def _fallback_plan(prompt: str, target_seconds: int = 60) -> dict:
    """无 DeepSeek 时：把输入粗切成约 12 镜。"""
    text = re.sub(r"\s+", " ", (prompt or "").strip())
    parts = [p.strip() for p in re.split(r"[。！？!?；;\n]+", text) if p.strip()]
    if not parts:
        parts = [text or "神秘故事预告"]
    while len(parts) < 8:
        parts.append(parts[-1])
    if len(parts) > 14:
        # 合并到约 12 段
        step = max(1, len(parts) // 12)
        merged = []
        for i in range(0, len(parts), step):
            merged.append("".join(parts[i : i + step]))
            if len(merged) >= 12:
                break
        parts = merged[:12]

    n = len(parts)
    base = max(4, min(6, target_seconds // max(1, n)))
    # 微调使总和接近 target
    durations = [base] * n
    total = sum(durations)
    i = 0
    while total < target_seconds and i < n * 3:
        durations[i % n] += 1
        total += 1
        i += 1
    while total > target_seconds and any(d > 4 for d in durations):
        for j in range(n):
            if durations[j] > 4 and total > target_seconds:
                durations[j] -= 1
                total -= 1

    shots = []
    for idx, (seg, dur) in enumerate(zip(parts, durations)):
        shots.append(
            {
                "index": idx,
                "duration_sec": dur,
                "voiceover": seg[:80],
                "visual_prompt": f"cinematic scene illustrating: {seg[:120]}",
                "camera": "medium",
                "mood": "dramatic",
            }
        )
    return {
        "title": (text[:40] or "预告片"),
        "logline": text[:120],
        "target_seconds": target_seconds,
        "shots": shots,
        "source": "fallback",
    }


def _normalize_plan(obj: dict, prompt: str, target_seconds: int) -> dict:
    title = str(obj.get("title") or "").strip() or (prompt.strip()[:40] or "预告片")
    logline = str(obj.get("logline") or "").strip() or prompt.strip()[:160]
    raw_shots = obj.get("shots")
    if not isinstance(raw_shots, list) or not raw_shots:
        return _fallback_plan(prompt, target_seconds)

    shots = []
    for i, s in enumerate(raw_shots[:16]):
        if not isinstance(s, dict):
            continue
        vo = str(s.get("voiceover") or s.get("narration") or "").strip()
        vis = str(s.get("visual_prompt") or s.get("image_prompt") or s.get("prompt") or "").strip()
        if not vo and not vis:
            continue
        try:
            dur = float(s.get("duration_sec") or s.get("duration") or 5)
        except Exception:
            dur = 5.0
        dur = max(4.0, min(8.0, dur))
        shots.append(
            {
                "index": len(shots),
                "duration_sec": round(dur, 1),
                "voiceover": vo or f"镜头 {len(shots) + 1}",
                "visual_prompt": vis or f"cinematic trailer shot for: {vo[:100]}",
                "camera": str(s.get("camera") or "medium").strip()[:32],
                "mood": str(s.get("mood") or "").strip()[:48],
            }
        )

    if len(shots) < 6:
        return _fallback_plan(prompt, target_seconds)

    # 缩放到约 target_seconds
    total = sum(float(s["duration_sec"]) for s in shots) or 1.0
    scale = float(target_seconds) / total
    for s in shots:
        d = max(4.0, min(8.0, float(s["duration_sec"]) * scale))
        s["duration_sec"] = round(d, 1)
    # 再微调合计
    total2 = sum(float(s["duration_sec"]) for s in shots)
    diff = target_seconds - total2
    if abs(diff) >= 0.5 and shots:
        shots[-1]["duration_sec"] = round(
            max(4.0, min(8.0, float(shots[-1]["duration_sec"]) + diff)), 1
        )

    return {
        "title": title,
        "logline": logline,
        "target_seconds": target_seconds,
        "shots": shots,
        "source": "deepseek",
        "characters": obj.get("characters") if isinstance(obj.get("characters"), list) else [],
    }


def deepseek_trailer_plan(
    prompt: str,
    visual_style: str,
    aspect: str,
    target_seconds: int,
    api_key: str,
    api_url: str,
) -> Optional[dict]:
    if not api_key:
        return None
    style = _style_meta(visual_style)
    aspect_label = "横屏 16:9" if aspect == "16_9" else "竖屏 9:16"
    n_lo, n_hi = 10, 14
    user_prompt = f"""你是预告片编剧与分镜导演。用户要做约 {target_seconds} 秒的电影/剧集预告片粗剪。

【用户输入】（书名、电影/电视剧名、或故事梗概）
{prompt.strip()}

【画面风格】{style['label']}（{style['zh']}）
【画幅】{aspect_label}

请输出严格 JSON（不要 markdown），字段：
{{
  "title": "预告标题",
  "logline": "一句话卖点",
  "characters": [{{"id":"c1","name":"角色名","look":"英文外形描述"}}],
  "shots": [
    {{
      "duration_sec": 5,
      "voiceover": "中文旁白（简短有力，适合配音）",
      "visual_prompt": "英文文生图提示词：主体、动作、环境、光影、镜头景别；不要出现字幕/文字/水印",
      "camera": "wide|medium|close|detail",
      "mood": "情绪词"
    }}
  ]
}}

硬性要求：
1. shots 数量 {n_lo}～{n_hi}；每镜 duration_sec 为 4～6 的整数或一位小数；所有 duration_sec 之和尽量接近 {target_seconds}（±4 秒可接受）。
2. 预告节奏：开场钩子 → 世界观/冲突 → 高潮闪回 → 收束悬念；不要剧透结局细节。
3. 若输入是知名作品名，基于公开剧情常识写分镜，不要编造离谱人设；若是原创梗概，紧扣梗概。
4. voiceover 用中文，单镜不超过 28 个汉字；visual_prompt 用英文，具体可画。
5. 风格一致性：所有 visual_prompt 都要符合「{style['label']}」。
6. 不要在画面提示里要求生成文字、标题卡上的字、logo。
只输出 JSON。"""

    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    data = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "你是一个只输出合法 JSON 的影视分镜助手。"},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.55,
        "response_format": {"type": "json_object"},
    }
    for attempt in range(2):
        try:
            resp = requests.post(api_url, headers=headers, json=data, timeout=150)
            if resp.status_code != 200:
                if resp.status_code >= 500 and attempt == 0:
                    time.sleep(2)
                    continue
                return None
            body = resp.json()
            content = (body.get("choices") or [{}])[0].get("message", {}).get("content") or ""
            obj = _extract_json_object(content)
            if not obj:
                return None
            return _normalize_plan(obj, prompt, target_seconds)
        except Exception:
            if attempt == 0:
                time.sleep(2)
                continue
            return None
    return None


def _pad_or_trim_wav(src: Path, dst: Path, target_sec: float) -> None:
    target_sec = max(0.5, float(target_sec))
    with wave.open(str(src), "rb") as wf:
        params = wf.getparams()
        frames = wf.readframes(wf.getnframes())
        rate = wf.getframerate() or 24000
        nch = wf.getnchannels()
        sw = wf.getsampwidth()
    cur_sec = (len(frames) / float(sw * nch) / float(rate)) if rate and sw and nch else 0.0
    need = int(target_sec * rate) * nch * sw
    if len(frames) >= need:
        frames = frames[:need]
    else:
        frames = frames + (b"\x00" * (need - len(frames)))
    with wave.open(str(dst), "wb") as out:
        out.setparams(params)
        out.writeframes(frames)
    del cur_sec


def _compose_trailer_sync(
    image_paths: List[Path],
    audio_paths: List[Path],
    durations: List[float],
    out_video: Path,
    output_size: Tuple[int, int],
    subtitle_timelines: Optional[List[Optional[List[Tuple[str, float, float]]]]] = None,
    create_subtitle_overlays: Optional[Callable] = None,
    fps: int = 25,
) -> None:
    if not image_paths:
        raise ValueError("No images to compose")
    target_w, target_h = int(output_size[0]), int(output_size[1])

    def _ken_burns(path: Path, duration: float) -> ImageClip:
        base = ImageClip(str(path))
        iw, ih = base.w, base.h
        if iw <= 0 or ih <= 0:
            return base.resize((target_w, target_h)).set_duration(duration)
        scale_cover = max(target_w / iw, target_h / ih)
        base = base.resize(scale_cover)
        bw, bh = base.w, base.h
        cx, cy = bw / 2, bh / 2
        extra_zoom = random.uniform(1.06, 1.18)
        sx0, sy0 = random.uniform(-0.1, 0.1), random.uniform(-0.1, 0.1)
        sx1, sy1 = random.uniform(-0.1, 0.1), random.uniform(-0.1, 0.1)

        def _crop_at(t: float):
            k = 0.0 if duration <= 0 else max(0.0, min(1.0, t / duration))
            z = 1.0 + (extra_zoom - 1.0) * k
            cw, ch = target_w / z, target_h / z
            max_dx = max(0.0, (bw - cw) / 2)
            max_dy = max(0.0, (bh - ch) / 2)
            dx = (sx0 + (sx1 - sx0) * k) * 2 * max_dx
            dy = (sy0 + (sy1 - sy0) * k) * 2 * max_dy
            x1 = max(0.0, min(bw - cw, (cx - cw / 2) + dx))
            y1 = max(0.0, min(bh - ch, (cy - ch / 2) + dy))
            return base.crop(x1=x1, y1=y1, width=cw, height=ch).resize((target_w, target_h))

        return _crop_at(0).fl(lambda gf, t: _crop_at(t).get_frame(0)).set_duration(duration)

    clips = []
    for idx, img_path in enumerate(image_paths):
        duration = float(durations[idx]) if idx < len(durations) else 5.0
        audio_path = audio_paths[idx] if idx < len(audio_paths) else None
        img_clip = _ken_burns(img_path, duration)
        if audio_path and Path(audio_path).exists():
            audio_clip = AudioFileClip(str(audio_path))
            # 音频长度与镜头对齐
            if abs(audio_clip.duration - duration) > 0.05:
                audio_clip = audio_clip.set_duration(duration)
            img_clip = img_clip.set_audio(audio_clip)
        timeline = None
        if subtitle_timelines and idx < len(subtitle_timelines):
            timeline = subtitle_timelines[idx]
        if timeline and create_subtitle_overlays:
            subs = create_subtitle_overlays(timeline, target_w, target_h)
            if subs:
                img_clip = CompositeVideoClip([img_clip] + subs)
        clips.append(img_clip)

    final_clip = concatenate_videoclips(clips, method="compose")
    final_clip.write_videofile(str(out_video), fps=fps, codec="libx264", audio_codec="aac")


class TrailerAPI:
    def __init__(self, **deps: Any):
        self.deps = deps
        self.tasks = _TRAILER_TASKS

    def _log(self, task: dict, msg: str) -> None:
        logs = task.get("logs")
        if not isinstance(logs, list):
            logs = []
            task["logs"] = logs
        logs.append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

    def _alloc_dir(self) -> str:
        root: Path = self.deps["output_root"]
        base = datetime.now().strftime("%Y-%m-%d_%H-%M") + "_trailer"
        root.mkdir(parents=True, exist_ok=True)
        if not (root / base).exists():
            return base
        for i in range(1, 1000):
            candidate = f"{base}_{i:02d}"
            if not (root / candidate).exists():
                return candidate
        return f"{base}_{uuid.uuid4().hex[:6]}"

    def _task_dir(self, task: dict) -> Path:
        root: Path = self.deps["output_root"]
        folder = (task.get("output_dir") or "").strip() or task["task_id"]
        d = root / folder
        d.mkdir(parents=True, exist_ok=True)
        return d

    def register(self, app) -> None:
        api = self

        @app.post("/trailer/start")
        @app.post("/api/trailer/start")
        async def trailer_start(
            prompt: str = Form(...),
            visual_style: str = Form("realistic"),
            aspect: str = Form("16_9"),
            candidates_per_shot: str = Form("3"),
            voice: str = Form("zh-CN-YunxiNeural"),
            speed: str = Form("1.0"),
            target_seconds: str = Form("60"),
        ):
            text = (prompt or "").strip()
            if len(text) < 2:
                raise HTTPException(status_code=400, detail="请输入书名、影视名或故事梗概")
            aspect_n = _normalize_aspect(aspect)
            style_n = (visual_style or "realistic").strip().lower()
            if style_n not in _VISUAL_STYLES:
                style_n = "realistic"
            try:
                cand = max(2, min(4, int(candidates_per_shot or 3)))
            except Exception:
                cand = 3
            try:
                spd = float(speed or 1.0)
            except Exception:
                spd = 1.0
            spd = max(0.7, min(1.4, spd))
            try:
                target = max(45, min(90, int(float(target_seconds or 60))))
            except Exception:
                target = 60

            task_id = uuid.uuid4().hex
            out_dir = api._alloc_dir()
            task = {
                "task_id": task_id,
                "output_dir": out_dir,
                "status": "running",
                "stage": "plan",
                "progress": {"current": 0, "total": 1},
                "logs": [],
                "error": "",
                "created_at": _now_ts_ms(),
                "prompt": text,
                "visual_style": style_n,
                "aspect": aspect_n,
                "candidates_per_shot": cand,
                "voice": (voice or "zh-CN-YunxiNeural").strip(),
                "speed": spd,
                "target_seconds": target,
                "plan": None,
                "shots_ui": [],
                "picks": {},
                "video_url": "",
                "export_hint": "",
            }
            api.tasks[task_id] = task
            asyncio.create_task(api._run_until_picks(task_id))
            return {"success": True, "task_id": task_id}

        @app.get("/trailer/status")
        @app.get("/api/trailer/status")
        async def trailer_status(task_id: str):
            task = api.tasks.get(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            return {"success": True, **task}

        @app.post("/trailer/cancel")
        @app.post("/api/trailer/cancel")
        async def trailer_cancel(task_id: str = Form(...)):
            task = api.tasks.get(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            task["status"] = "cancelled"
            task["stage"] = "cancelled"
            api._log(task, "用户取消任务")
            return {"success": True}

        @app.post("/trailer/confirm-picks")
        @app.post("/api/trailer/confirm-picks")
        async def trailer_confirm_picks(
            task_id: str = Form(...),
            picks_json: str = Form("{}"),
        ):
            task = api.tasks.get(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            if task.get("status") != "awaiting_picks":
                raise HTTPException(status_code=400, detail="当前不在选图阶段")
            try:
                picks = json.loads(picks_json or "{}")
            except Exception:
                raise HTTPException(status_code=400, detail="picks_json 无效")
            if not isinstance(picks, dict):
                raise HTTPException(status_code=400, detail="picks_json 须为对象")

            shots_ui = task.get("shots_ui") or []
            normalized: Dict[str, int] = {}
            for shot in shots_ui:
                idx = str(shot.get("index"))
                cands = shot.get("candidates") or []
                if not cands:
                    raise HTTPException(status_code=400, detail=f"分镜 {idx} 无候选图")
                raw = picks.get(idx, picks.get(int(idx) if idx.isdigit() else idx, 0))
                try:
                    ci = int(raw)
                except Exception:
                    ci = 0
                ci = max(0, min(len(cands) - 1, ci))
                normalized[idx] = ci

            task["picks"] = normalized
            task["status"] = "running"
            task["stage"] = "compose"
            task["error"] = ""
            asyncio.create_task(api._run_compose(task_id))
            return {"success": True, "task_id": task_id}

        @app.post("/trailer/reveal-output")
        @app.post("/api/trailer/reveal-output")
        async def trailer_reveal_output(task_id: str = Form(...)):
            task = api.tasks.get(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            path = str(api._task_dir(task).resolve())
            try:
                import subprocess
                import sys

                if sys.platform.startswith("win"):
                    subprocess.Popen(["explorer", path])
                elif sys.platform == "darwin":
                    subprocess.Popen(["open", path])
                else:
                    subprocess.Popen(["xdg-open", path])
            except Exception as e:
                return JSONResponse({"success": False, "error": str(e)}, status_code=500)
            return {"success": True, "path": path}

    async def _run_until_picks(self, task_id: str) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        try:
            await self._phase_plan(task)
            if task.get("status") == "cancelled":
                return
            await self._phase_images(task)
            if task.get("status") == "cancelled":
                return
            task["status"] = "awaiting_picks"
            task["stage"] = "awaiting_picks"
            self._log(task, "分镜候选图已生成，请在页面勾选每镜一张后点「确认选图并成片」")
        except Exception as e:
            if task.get("status") != "cancelled":
                task["status"] = "error"
                task["stage"] = "error"
                task["error"] = str(e)
                self._log(task, f"失败：{e}")

    async def _phase_plan(self, task: dict) -> None:
        task["stage"] = "plan"
        task["progress"] = {"current": 0, "total": 1}
        prompt = task["prompt"]
        style = task["visual_style"]
        aspect = task["aspect"]
        target = int(task["target_seconds"])
        self._log(task, f"策划约 {target}s 预告分镜（风格={style}，画幅={aspect}）…")

        api_key = self.deps["repo_deepseek_api_key"]()
        api_url = self.deps["deepseek_api_url"]
        plan = None
        if api_key:
            plan = await asyncio.to_thread(
                deepseek_trailer_plan, prompt, style, aspect, target, api_key, api_url
            )
        if not plan:
            self._log(task, "DeepSeek 不可用或解析失败，改用规则分镜")
            plan = _fallback_plan(prompt, target)
            task["deepseek_plan_status"] = "fallback"
        else:
            task["deepseek_plan_status"] = plan.get("source") or "ok"
            self._log(task, f"剧本就绪：{plan.get('title')}，共 {len(plan.get('shots') or [])} 镜")

        task["plan"] = plan
        task_dir = self._task_dir(task)
        (task_dir / "plan.json").write_text(
            json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        task["progress"] = {"current": 1, "total": 1}

    async def _phase_images(self, task: dict) -> None:
        plan = task.get("plan") or {}
        shots = plan.get("shots") or []
        if not shots:
            raise RuntimeError("分镜为空")

        aspect = task["aspect"]
        w, h = _ASPECT_SIZES[aspect]
        style = _style_meta(task["visual_style"])
        cand_n = int(task["candidates_per_shot"])
        total = len(shots) * cand_n
        task["stage"] = "images"
        task["progress"] = {"current": 0, "total": total}

        task_dir = self._task_dir(task)
        images_dir = task_dir / "images"
        images_dir.mkdir(parents=True, exist_ok=True)

        build_wf = self.deps["build_z_image_workflow"]
        run_comfy = self.deps["run_comfyui_and_get_last_image"]
        neg = self.deps["default_txt2img_negative"]("", width=w, height=h)
        no_text = self.deps.get("image_no_text_prefix") or ""

        shots_ui = []
        done = 0
        for shot in shots:
            if task.get("status") == "cancelled":
                return
            idx = int(shot["index"])
            base_prompt = (shot.get("visual_prompt") or "").strip()
            pos = (
                f"{no_text}{base_prompt}. {style['suffix']}. "
                f"{style['zh']}. no text, no watermark, no subtitles, no logo."
            )
            candidates = []
            for c in range(cand_n):
                if task.get("status") == "cancelled":
                    return
                done += 1
                task["progress"] = {"current": done, "total": total}
                self._log(task, f"生图 分镜 {idx + 1}/{len(shots)} 候选 {c + 1}/{cand_n}")
                seed = random.randint(1, 2_000_000_000)
                workflow = build_wf(pos, seed=seed, width=w, height=h, negative_text=neg)
                img_bytes = await run_comfy(workflow)
                name = f"{idx:02d}_c{c}.png"
                path = images_dir / name
                path.write_bytes(img_bytes)
                candidates.append(
                    {
                        "index": c,
                        "filename": name,
                        "url": f"/output/{task_dir.name}/images/{name}",
                    }
                )
            shots_ui.append(
                {
                    "index": idx,
                    "duration_sec": shot.get("duration_sec"),
                    "voiceover": shot.get("voiceover"),
                    "visual_prompt": base_prompt,
                    "camera": shot.get("camera"),
                    "candidates": candidates,
                    "default_pick": 0,
                }
            )

        task["shots_ui"] = shots_ui
        # 默认 picks
        task["picks"] = {str(s["index"]): 0 for s in shots_ui}

    async def _run_compose(self, task_id: str) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        try:
            await self._phase_compose(task)
        except Exception as e:
            if task.get("status") != "cancelled":
                task["status"] = "error"
                task["stage"] = "error"
                task["error"] = str(e)
                self._log(task, f"成片失败：{e}")

    async def _phase_compose(self, task: dict) -> None:
        plan = task.get("plan") or {}
        shots = plan.get("shots") or []
        shots_ui = task.get("shots_ui") or []
        picks = task.get("picks") or {}
        if not shots or not shots_ui:
            raise RuntimeError("缺少分镜或候选图")

        task_dir = self._task_dir(task)
        images_dir = task_dir / "images"
        audio_dir = task_dir / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)

        aspect = task["aspect"]
        out_size = _ASPECT_VIDEO[aspect]
        voice = task.get("voice")
        speed = task.get("speed")
        tts = self.deps["indextts_synthesize"]
        wav_dur = self.deps["wav_duration_seconds"]
        create_subs = self.deps["create_subtitle_overlays_timed"]

        image_paths: List[Path] = []
        audio_paths: List[Path] = []
        durations: List[float] = []
        sub_timelines: List[Optional[List[Tuple[str, float, float]]]] = []
        srt_lines: List[str] = []
        t_cursor = 0.0

        task["stage"] = "tts"
        task["progress"] = {"current": 0, "total": len(shots)}

        ui_by_idx = {int(s["index"]): s for s in shots_ui}

        for i, shot in enumerate(shots):
            if task.get("status") == "cancelled":
                return
            idx = int(shot["index"])
            ui = ui_by_idx.get(idx) or shots_ui[i]
            pick = int(picks.get(str(idx), ui.get("default_pick") or 0))
            cands = ui.get("candidates") or []
            pick = max(0, min(len(cands) - 1, pick))
            fname = cands[pick]["filename"]
            img_path = images_dir / fname
            if not img_path.exists():
                raise RuntimeError(f"找不到选中图片：{fname}")
            image_paths.append(img_path)

            planned = float(shot.get("duration_sec") or 5)
            vo = (shot.get("voiceover") or "").strip() or f"镜头{idx + 1}"
            task["progress"] = {"current": i + 1, "total": len(shots)}
            self._log(task, f"配音 分镜 {idx + 1}/{len(shots)}")

            raw_wav = audio_dir / f"{idx:02d}_raw.wav"
            final_wav = audio_dir / f"{idx:02d}.wav"
            await tts(vo, raw_wav, voice=voice, speed=speed)
            tts_len = float(await asyncio.to_thread(wav_dur, raw_wav))
            # 镜头时长：至少计划时长；若旁白更长则跟旁白（上限 10s）
            dur = max(planned, tts_len)
            dur = min(10.0, max(4.0, dur))
            await asyncio.to_thread(_pad_or_trim_wav, raw_wav, final_wav, dur)
            audio_paths.append(final_wav)
            durations.append(dur)

            # 字幕：整段旁白铺满镜头
            sub_timelines.append([(vo, 0.0, dur)])
            # SRT
            def _ts(sec: float) -> str:
                ms = int(round(sec * 1000))
                h, rem = divmod(ms, 3600000)
                m, rem = divmod(rem, 60000)
                s, milli = divmod(rem, 1000)
                return f"{h:02d}:{m:02d}:{s:02d},{milli:03d}"

            srt_lines.append(
                f"{i + 1}\n{_ts(t_cursor)} --> {_ts(t_cursor + dur)}\n{vo}\n"
            )
            t_cursor += dur

        task["stage"] = "video"
        self._log(task, f"拼接预览成片（约 {t_cursor:.1f}s）…")
        out_name = "trailer_16_9.mp4" if aspect == "16_9" else "trailer_9_16.mp4"
        out_video = task_dir / out_name
        await asyncio.to_thread(
            _compose_trailer_sync,
            image_paths,
            audio_paths,
            durations,
            out_video,
            out_size,
            sub_timelines,
            create_subs,
            25,
        )

        # 导出剪映说明 + 选中清单
        picks_export = []
        for shot in shots:
            idx = int(shot["index"])
            ui = ui_by_idx.get(idx)
            pick = int(picks.get(str(idx), 0))
            fname = (ui.get("candidates") or [{}])[pick].get("filename") if ui else ""
            picks_export.append(
                {
                    "index": idx,
                    "duration_sec": durations[idx] if idx < len(durations) else shot.get("duration_sec"),
                    "voiceover": shot.get("voiceover"),
                    "image": fname,
                    "visual_prompt": shot.get("visual_prompt"),
                }
            )
        (task_dir / "selected_shots.json").write_text(
            json.dumps(picks_export, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (task_dir / "trailer.srt").write_text("\n".join(srt_lines), encoding="utf-8")
        readme = (
            "剪映精剪说明\n"
            "==============\n"
            "1. 本目录 trailer_*.mp4 为网站粗剪预览（Ken Burns + 旁白），可直接试看节奏。\n"
            "2. images/ 为选中分镜关键帧；audio/ 为分镜旁白 wav。\n"
            "3. plan.json / selected_shots.json / trailer.srt 可导入剪映时对照分镜与字幕。\n"
            "4. 正式成片建议：在剪映中替换转场、BGM、音效，并按需用图生视频替换关键帧。\n"
            "5. 当前版本尚未调用本地 Wan/LTX 真视频工作流；后续可在同一分镜表上接 I2V。\n"
        )
        (task_dir / "README_剪映.txt").write_text(readme, encoding="utf-8")

        task["video_url"] = f"/output/{task_dir.name}/{out_name}"
        task["video_duration_sec"] = round(t_cursor, 1)
        task["output_directory"] = str(task_dir.resolve())
        task["export_hint"] = (
            "粗剪预览已生成。完整素材在任务目录（images / audio / plan.json / trailer.srt），"
            "可复制到剪映精剪。"
        )
        task["status"] = "done"
        task["stage"] = "done"
        task["progress"] = {"current": 1, "total": 1}
        self._log(task, f"完成：{out_name}（约 {t_cursor:.1f}s）")
