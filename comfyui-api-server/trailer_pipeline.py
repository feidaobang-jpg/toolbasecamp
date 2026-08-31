"""
视频生成流水线（半自动）：
  DeepSeek 分镜 → Z-Image 关键帧多候选勾选 → 视频引擎成片 → 旁白拼接。

成片引擎：Wan 2.2 5B 图生视频 / LTX 2.5 文生视频 / 静帧推镜。
单段时长 3～10 秒可选；生成段数默认 1，超过分镜数则封顶。
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
    VideoFileClip,
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

# Wan 2.2 5B I2V（4060 Ti 16GB 用偏稳分辨率；约 3.4s / 5s）
_ASPECT_I2V = {
    "16_9": (832, 480),
    "9_16": (480, 832),
}

# LTX-2.5 T2V（latent 会再 /2 后上采样，给稍大画布）
_ASPECT_LTX = {
    "16_9": (768, 432),
    "9_16": (432, 768),
}

_ASPECT_VIDEO = {
    "16_9": (1920, 1080),
    "9_16": (1080, 1920),
}

_VIDEO_ENGINES = {
    "wan22_5b": {"label": "Wan 2.2 5B 图生视频", "needs_image": True},
    "ltx25_i2v": {"label": "LTX 2.5 图生视频", "needs_image": True},
    "ltx25_t2v": {"label": "LTX 2.5 文生视频", "needs_image": False},
    "kenburns": {"label": "静帧推镜", "needs_image": False},
}


def _normalize_video_engine(raw: str) -> str:
    m = (raw or "").strip().lower().replace("-", "_")
    # 兼容旧值 i2v / 笼统 ltx
    if m in ("i2v", "wan", "wan22", "wan2.2_5b", "wan22_ti2v"):
        return "wan22_5b"
    if m in ("ltx", "ltx2.5", "ltx25", "ltx_i2v", "ltx25_img"):
        return "ltx25_i2v"
    if m in ("ltx_t2v", "ltx25_t2v", "ltx2.5_t2v"):
        return "ltx25_t2v"
    if m in ("still", "ken_burns", "slideshow"):
        return "kenburns"
    if m in _VIDEO_ENGINES:
        return m
    return "wan22_5b"



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


def _clamp_shot_duration(raw) -> float:
    try:
        d = float(raw)
    except Exception:
        d = 5.0
    return float(max(3, min(10, int(round(d)))))


def _clamp_segment_count(raw) -> int:
    try:
        n = int(float(raw))
    except Exception:
        n = 1
    return max(1, min(30, n))


def _fallback_plan(prompt: str, shot_duration: float, segment_count: int) -> dict:
    """无 DeepSeek 时：按段数切分输入。"""
    text = re.sub(r"\s+", " ", (prompt or "").strip())
    parts = [p.strip() for p in re.split(r"[。！？!?；;\n]+", text) if p.strip()]
    if not parts:
        parts = [text or "故事开场"]
    want = max(1, int(segment_count))
    # 至少凑够 want 段
    while len(parts) < want:
        parts.append(parts[-1])
    if len(parts) > want:
        # 合并到 want 段
        step = max(1, len(parts) // want)
        merged = []
        for i in range(0, len(parts), step):
            merged.append("".join(parts[i : i + step]))
            if len(merged) >= want:
                break
        parts = merged[:want]
    else:
        parts = parts[:want]

    dur = _clamp_shot_duration(shot_duration)
    shots = []
    for idx, seg in enumerate(parts):
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
        "title": (text[:40] or "视频流水线"),
        "logline": text[:120],
        "shot_duration_sec": dur,
        "segment_count": len(shots),
        "target_seconds": round(dur * len(shots), 1),
        "shots": shots,
        "source": "fallback",
    }


def _normalize_plan(
    obj: dict,
    prompt: str,
    shot_duration: float,
    segment_count: int,
) -> dict:
    title = str(obj.get("title") or "").strip() or (prompt.strip()[:40] or "视频流水线")
    logline = str(obj.get("logline") or "").strip() or prompt.strip()[:160]
    raw_shots = obj.get("shots")
    dur = _clamp_shot_duration(shot_duration)
    want = _clamp_segment_count(segment_count)
    if not isinstance(raw_shots, list) or not raw_shots:
        return _fallback_plan(prompt, dur, want)

    shots = []
    for s in raw_shots[:30]:
        if not isinstance(s, dict):
            continue
        vo = str(s.get("voiceover") or s.get("narration") or "").strip()
        vis = str(s.get("visual_prompt") or s.get("image_prompt") or s.get("prompt") or "").strip()
        if not vo and not vis:
            continue
        shots.append(
            {
                "index": len(shots),
                "duration_sec": dur,
                "voiceover": vo or f"镜头 {len(shots) + 1}",
                "visual_prompt": vis or f"cinematic shot for: {vo[:100]}",
                "camera": str(s.get("camera") or "medium").strip()[:32],
                "mood": str(s.get("mood") or "").strip()[:48],
            }
        )

    if not shots:
        return _fallback_plan(prompt, dur, want)

    # 段数：不超过分镜总数
    take = min(want, len(shots))
    shots = shots[:take]
    for i, s in enumerate(shots):
        s["index"] = i
        s["duration_sec"] = dur

    return {
        "title": title,
        "logline": logline,
        "shot_duration_sec": dur,
        "segment_count": len(shots),
        "segment_count_requested": want,
        "target_seconds": round(dur * len(shots), 1),
        "shots": shots,
        "source": "deepseek",
        "characters": obj.get("characters") if isinstance(obj.get("characters"), list) else [],
    }


def deepseek_trailer_plan(
    prompt: str,
    visual_style: str,
    aspect: str,
    shot_duration: float,
    segment_count: int,
    api_key: str,
    api_url: str,
) -> Optional[dict]:
    if not api_key:
        return None
    style = _style_meta(visual_style)
    aspect_label = "横屏 16:9" if aspect == "16_9" else "竖屏 9:16"
    dur = _clamp_shot_duration(shot_duration)
    want = _clamp_segment_count(segment_count)
    # 多要几镜再截断，避免 LLM 少给
    n_lo = want
    n_hi = max(want, min(24, want + 4))
    total_hint = round(dur * want, 1)
    user_prompt = f"""你是影视分镜导演。用户要做视频生成流水线粗剪。

【用户输入】（书名、电影/电视剧名、或故事梗概）
{prompt.strip()}

【画面风格】{style['label']}（{style['zh']}）
【画幅】{aspect_label}
【单段时长】每镜固定约 {dur:g} 秒
【需要段数】至少 {want} 镜（可写到 {n_hi} 镜，系统会截取前 {want} 镜）

请输出严格 JSON（不要 markdown），字段：
{{
  "title": "标题",
  "logline": "一句话卖点",
  "characters": [{{"id":"c1","name":"角色名","look":"英文外形描述"}}],
  "shots": [
    {{
      "duration_sec": {dur:g},
      "voiceover": "中文旁白（简短有力，适合配音）",
      "visual_prompt": "英文文生图提示词：主体、动作、环境、光影、镜头景别；不要出现字幕/文字/水印",
      "camera": "wide|medium|close|detail",
      "mood": "情绪词"
    }}
  ]
}}

硬性要求：
1. shots 数量 {n_lo}～{n_hi}；每镜 duration_sec 一律写 {dur:g}。
2. 叙事节奏随段数伸缩：段数少则单镜信息密度更高；段数多则开场钩子→冲突→高潮→收束。
3. 若输入是知名作品名，基于公开剧情常识写分镜；若是原创梗概，紧扣梗概。
4. voiceover 用中文，单镜汉字数按 {dur:g} 秒语速控制（约每秒 3～4 字，勿过长）；visual_prompt 用英文。
5. 风格一致性：所有 visual_prompt 都要符合「{style['label']}」。
6. 不要在画面提示里要求生成文字、标题卡上的字、logo。
7. 总时长大约 {total_hint:g} 秒（{want}×{dur:g}）。
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
            return _normalize_plan(obj, prompt, dur, want)
        except Exception:
            if attempt == 0:
                time.sleep(2)
                continue
            return None
    return None


def _length_for_duration(duration_sec: float, fps: int = 24) -> int:
    """Wan length ≈ 4n+1，约覆盖 3～10 秒（241 帧 ≈10s@24fps）。"""
    frames = int(round(float(duration_sec) * float(fps)))
    n = max(8, (frames - 1) // 4)
    length = n * 4 + 1
    return max(33, min(241, length))


def _compose_clips_with_audio_sync(
    video_paths: List[Path],
    audio_paths: List[Path],
    durations: List[float],
    out_video: Path,
    output_size: Tuple[int, int],
    subtitle_timelines: Optional[List[Optional[List[Tuple[str, float, float]]]]] = None,
    create_subtitle_overlays: Optional[Callable] = None,
    fps: int = 24,
) -> None:
    """拼接 I2V 片段 + 旁白；视频不够长则冻结尾帧，太长则裁切。"""
    if not video_paths:
        raise ValueError("No video clips")
    target_w, target_h = int(output_size[0]), int(output_size[1])
    clips = []
    for idx, vpath in enumerate(video_paths):
        duration = float(durations[idx]) if idx < len(durations) else 5.0
        audio_path = audio_paths[idx] if idx < len(audio_paths) else None
        v = VideoFileClip(str(vpath))
        if v.w != target_w or v.h != target_h:
            v = v.resize((target_w, target_h))
        if v.duration + 1e-3 < duration:
            # 冻结尾帧补足
            freeze = v.to_ImageClip(t=max(0.0, v.duration - 0.04)).set_duration(duration - v.duration)
            v = concatenate_videoclips([v, freeze])
        elif v.duration > duration + 1e-3:
            v = v.subclip(0, duration)
        v = v.set_duration(duration)
        if audio_path and Path(audio_path).exists():
            audio_clip = AudioFileClip(str(audio_path)).set_duration(duration)
            v = v.set_audio(audio_clip)
        timeline = None
        if subtitle_timelines and idx < len(subtitle_timelines):
            timeline = subtitle_timelines[idx]
        if timeline and create_subtitle_overlays:
            subs = create_subtitle_overlays(timeline, target_w, target_h)
            if subs:
                v = CompositeVideoClip([v] + subs)
        clips.append(v)

    final_clip = concatenate_videoclips(clips, method="compose")
    final_clip.write_videofile(str(out_video), fps=fps, codec="libx264", audio_codec="aac")


def _pad_or_trim_wav(src: Path, dst: Path, target_sec: float) -> None:
    target_sec = max(0.5, float(target_sec))
    with wave.open(str(src), "rb") as wf:
        params = wf.getparams()
        frames = wf.readframes(wf.getnframes())
        rate = wf.getframerate() or 24000
        nch = wf.getnchannels()
        sw = wf.getsampwidth()
    need = int(target_sec * rate) * nch * sw
    if len(frames) >= need:
        frames = frames[:need]
    else:
        frames = frames + (b"\x00" * (need - len(frames)))
    with wave.open(str(dst), "wb") as out:
        out.setparams(params)
        out.writeframes(frames)


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
            shot_duration: str = Form("5"),
            segment_count: str = Form("1"),
            video_mode: str = Form("wan22_5b"),
        ):
            text = (prompt or "").strip()
            if len(text) < 2:
                raise HTTPException(status_code=400, detail="请输入书名、影视名或故事梗概")
            aspect_n = _normalize_aspect(aspect)
            style_n = (visual_style or "realistic").strip().lower()
            if style_n not in _VISUAL_STYLES:
                style_n = "realistic"
            mode = _normalize_video_engine(video_mode)
            try:
                cand = max(2, min(4, int(candidates_per_shot or 3)))
            except Exception:
                cand = 3
            try:
                spd = float(speed or 1.0)
            except Exception:
                spd = 1.0
            spd = max(0.7, min(1.4, spd))
            shot_dur = _clamp_shot_duration(shot_duration)
            seg_n = _clamp_segment_count(segment_count)

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
                "video_mode": mode,
                "candidates_per_shot": cand,
                "voice": (voice or "zh-CN-YunxiNeural").strip(),
                "speed": spd,
                "shot_duration_sec": shot_dur,
                "segment_count": seg_n,
                "target_seconds": round(shot_dur * seg_n, 1),
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
        shot_dur = _clamp_shot_duration(task.get("shot_duration_sec") or 5)
        seg_n = _clamp_segment_count(task.get("segment_count") or 1)
        task["shot_duration_sec"] = shot_dur
        task["segment_count"] = seg_n
        self._log(
            task,
            f"策划分镜：段数={seg_n}，单段={shot_dur:g}s，风格={style}，画幅={aspect}",
        )

        api_key = self.deps["repo_deepseek_api_key"]()
        api_url = self.deps["deepseek_api_url"]
        plan = None
        if api_key:
            plan = await asyncio.to_thread(
                deepseek_trailer_plan,
                prompt,
                style,
                aspect,
                shot_dur,
                seg_n,
                api_key,
                api_url,
            )
        if not plan:
            self._log(task, "DeepSeek 不可用或解析失败，改用规则分镜")
            plan = _fallback_plan(prompt, shot_dur, seg_n)
            task["deepseek_plan_status"] = "fallback"
        else:
            task["deepseek_plan_status"] = plan.get("source") or "ok"
            req = plan.get("segment_count_requested") or seg_n
            got = len(plan.get("shots") or [])
            if req > got:
                self._log(task, f"请求 {req} 段，分镜仅 {got} 段，按最大分镜数出片")
            self._log(task, f"剧本就绪：{plan.get('title')}，采用 {got} 镜 × {shot_dur:g}s")

        task["plan"] = plan
        task["segment_count_effective"] = len(plan.get("shots") or [])
        task["target_seconds"] = plan.get("target_seconds") or round(
            shot_dur * len(plan.get("shots") or []), 1
        )
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
        clips_dir = task_dir / "clips"
        audio_dir.mkdir(parents=True, exist_ok=True)
        clips_dir.mkdir(parents=True, exist_ok=True)

        aspect = task["aspect"]
        out_size = _ASPECT_VIDEO[aspect]
        i2v_wh = _ASPECT_I2V[aspect]
        ltx_wh = _ASPECT_LTX[aspect]
        voice = task.get("voice")
        speed = task.get("speed")
        mode = _normalize_video_engine(task.get("video_mode") or "wan22_5b")
        task["video_mode"] = mode
        engine_meta = _VIDEO_ENGINES[mode]
        tts = self.deps["indextts_synthesize"]
        wav_dur = self.deps["wav_duration_seconds"]
        create_subs = self.deps["create_subtitle_overlays_timed"]
        upload_bytes = self.deps.get("upload_image_bytes")
        build_wan = self.deps.get("build_wan22_ti2v_workflow")
        build_ltx_t2v = self.deps.get("build_ltx25_t2v_workflow")
        build_ltx_i2v = self.deps.get("build_ltx25_i2v_workflow")
        run_video = self.deps.get("run_comfyui_and_get_last_video")
        use_wan = (
            mode == "wan22_5b"
            and callable(upload_bytes)
            and callable(build_wan)
            and callable(run_video)
        )
        use_ltx_i2v = (
            mode == "ltx25_i2v"
            and callable(upload_bytes)
            and callable(build_ltx_i2v)
            and callable(run_video)
        )
        use_ltx_t2v = mode == "ltx25_t2v" and callable(build_ltx_t2v) and callable(run_video)
        use_comfy_video = use_wan or use_ltx_i2v or use_ltx_t2v

        image_paths: List[Path] = []
        video_clip_paths: List[Path] = []
        audio_paths: List[Path] = []
        durations: List[float] = []
        sub_timelines: List[Optional[List[Tuple[str, float, float]]]] = []
        srt_lines: List[str] = []
        t_cursor = 0.0
        i2v_fail = 0

        ui_by_idx = {int(s["index"]): s for s in shots_ui}
        n_shots = len(shots)

        def _ts(sec: float) -> str:
            ms = int(round(sec * 1000))
            h, rem = divmod(ms, 3600000)
            m, rem = divmod(rem, 60000)
            s, milli = divmod(rem, 1000)
            return f"{h:02d}:{m:02d}:{s:02d},{milli:03d}"

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

            planned = float(
                shot.get("duration_sec")
                or task.get("shot_duration_sec")
                or 5
            )
            planned = _clamp_shot_duration(planned)
            vo = (shot.get("voiceover") or "").strip() or f"镜头{idx + 1}"
            motion = (
                f"{(shot.get('visual_prompt') or '').strip()}. "
                f"camera {shot.get('camera') or 'medium'}, subtle cinematic motion, natural movement"
            )

            # 1) 配音
            task["stage"] = "tts"
            task["progress"] = {"current": i + 1, "total": n_shots}
            self._log(task, f"配音 分镜 {idx + 1}/{n_shots}")
            raw_wav = audio_dir / f"{idx:02d}_raw.wav"
            final_wav = audio_dir / f"{idx:02d}.wav"
            await tts(vo, raw_wav, voice=voice, speed=speed)
            tts_len = float(await asyncio.to_thread(wav_dur, raw_wav))
            # 以用户单段时长为主；旁白更长则略延长（上限 10s）
            dur = max(planned, tts_len)
            dur = min(10.0, max(3.0, dur))

            # 2) 视频引擎：Wan I2V / LTX T2V / 稍后 Ken Burns
            clip_path = clips_dir / f"{idx:02d}.mp4"
            if use_comfy_video:
                task["stage"] = "i2v" if (use_wan or use_ltx_i2v) else "t2v"
                try:
                    if use_wan:
                        self._log(
                            task,
                            f"Wan2.2-5B 图生视频 分镜 {idx + 1}/{n_shots}（{i2v_wh[0]}×{i2v_wh[1]} · {_length_for_duration(dur)}帧）",
                        )
                        comfy_name, _sub = await upload_bytes(
                            img_path.read_bytes(), name_prefix=f"trailer_{idx:02d}_"
                        )
                        if not comfy_name:
                            raise RuntimeError("上传关键帧到 ComfyUI 失败")
                        length = _length_for_duration(dur)
                        wf = build_wan(
                            comfy_name,
                            motion,
                            seed=random.randint(1, 2_000_000_000),
                            width=i2v_wh[0],
                            height=i2v_wh[1],
                            length=length,
                            fps=24,
                        )
                    elif use_ltx_i2v:
                        self._log(
                            task,
                            f"LTX-2.5 图生视频 分镜 {idx + 1}/{n_shots}（{ltx_wh[0]}×{ltx_wh[1]} · {planned:g}s）",
                        )
                        comfy_name, _sub = await upload_bytes(
                            img_path.read_bytes(), name_prefix=f"trailer_ltx_{idx:02d}_"
                        )
                        if not comfy_name:
                            raise RuntimeError("上传关键帧到 ComfyUI 失败")
                        wf = build_ltx_i2v(
                            comfy_name,
                            motion,
                            seed=random.randint(1, 2_000_000_000),
                            width=ltx_wh[0],
                            height=ltx_wh[1],
                            duration_sec=planned,
                            fps=24,
                        )
                    else:
                        self._log(
                            task,
                            f"LTX-2.5 文生视频 分镜 {idx + 1}/{n_shots}（{ltx_wh[0]}×{ltx_wh[1]} · {planned:g}s）",
                        )
                        wf = build_ltx_t2v(
                            motion,
                            seed=random.randint(1, 2_000_000_000),
                            width=ltx_wh[0],
                            height=ltx_wh[1],
                            duration_sec=planned,
                            fps=24,
                        )
                    vid_bytes = await run_video(wf)
                    clip_path.write_bytes(vid_bytes)
                    video_clip_paths.append(clip_path)
                    try:
                        vdur = float(VideoFileClip(str(clip_path)).duration)
                    except Exception:
                        vdur = dur
                    dur = max(tts_len, min(10.0, max(vdur, planned * 0.85)))
                    dur = max(3.0, dur)
                except Exception as e:
                    i2v_fail += 1
                    self._log(
                        task,
                        f"分镜 {idx + 1} {engine_meta['label']} 失败，该镜回退静帧推镜：{e}",
                    )
                    video_clip_paths.append(img_path)
            else:
                video_clip_paths.append(img_path)

            await asyncio.to_thread(_pad_or_trim_wav, raw_wav, final_wav, dur)
            audio_paths.append(final_wav)
            durations.append(dur)
            sub_timelines.append([(vo, 0.0, dur)])
            srt_lines.append(f"{i + 1}\n{_ts(t_cursor)} --> {_ts(t_cursor + dur)}\n{vo}\n")
            t_cursor += dur

        task["stage"] = "video"
        self._log(task, f"拼接预览成片（约 {t_cursor:.1f}s，I2V失败 {i2v_fail} 镜）…")
        out_name = "trailer_16_9.mp4" if aspect == "16_9" else "trailer_9_16.mp4"
        out_video = task_dir / out_name

        # 若全部是真视频片段，用视频拼接；否则用 Ken Burns（图路径）
        all_video = use_comfy_video and all(
            p.suffix.lower() == ".mp4" and p.exists() for p in video_clip_paths
        )
        if all_video:
            await asyncio.to_thread(
                _compose_clips_with_audio_sync,
                video_clip_paths,
                audio_paths,
                durations,
                out_video,
                out_size,
                sub_timelines,
                create_subs,
                24,
            )
            engine_note = f"{engine_meta['label']} + 旁白拼接"
        else:
            # 混合失败时统一 Ken Burns，保证能出片
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
            engine_note = f"静帧 Ken Burns（{engine_meta['label']} 未全成功或选手动回退）"

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
                    "clip": f"clips/{idx:02d}.mp4" if (clips_dir / f"{idx:02d}.mp4").exists() else None,
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
            f"1. trailer_*.mp4 为网站粗剪预览（{engine_note}）。\n"
            "2. images/ 关键帧；clips/ 为每镜 Wan 图生视频；audio/ 旁白。\n"
            "3. plan.json / selected_shots.json / trailer.srt 对照分镜与字幕。\n"
            "4. 精剪建议导入剪映：替换转场、BGM、音效；clips/ 可单镜替换。\n"
            "5. 视频引擎：Wan 2.2 5B 图生视频 / LTX 2.5 文生视频 / 静帧推镜\n"
            "   工作流源：D:\\sd\\ComfyUI-main\\user\\default\\workflows\\\n"
            "   API 模板：work-flow/wan22_ti2v_5b.json 、 work-flow/ltx25_t2v.json\n"
        )
        (task_dir / "README_剪映.txt").write_text(readme, encoding="utf-8")

        task["video_url"] = f"/output/{task_dir.name}/{out_name}"
        task["video_duration_sec"] = round(t_cursor, 1)
        task["output_directory"] = str(task_dir.resolve())
        task["video_engine"] = mode if all_video else "kenburns"
        task["export_hint"] = (
            f"粗剪已生成（{engine_note}）。素材在任务目录 images / clips / audio，可导入剪映。"
        )
        task["status"] = "done"
        task["stage"] = "done"
        task["progress"] = {"current": 1, "total": 1}
        self._log(task, f"完成：{out_name}（约 {t_cursor:.1f}s · {engine_note}）")
