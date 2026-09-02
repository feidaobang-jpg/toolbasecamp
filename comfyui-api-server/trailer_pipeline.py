"""
视频生成流水线（半自动）：
  DeepSeek 全剧设定+分镜 → 全剧参考图（AI 候选勾选 / 上传）→
  Z-Image 关键帧 → 视频引擎成片 → 旁白拼接。

成片引擎：Wan 2.2 14B I2V GGUF Q5_K_M / LTX 2.5 文生视频 / 静帧推镜。
单段时长 3～10 秒可选；生成段数默认 1，超过分镜数则封顶。
"""
from __future__ import annotations

import asyncio
import json
import random
import re
import shutil
import time
import uuid
import wave
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import requests
from fastapi import File, Form, HTTPException, UploadFile
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

# Wan 2.2 14B I2V GGUF（4060 Ti 16GB 用偏稳分辨率；约 3.4s / 5s）
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
    "wan22_14b_gguf": {"label": "Wan 2.2 14B 图生视频（GGUF Q5_K_M）", "needs_image": True},
    "ltx25_i2v": {"label": "LTX 2.5 图生视频", "needs_image": True},
    "ltx25_t2v": {"label": "LTX 2.5 文生视频", "needs_image": False},
    "kenburns": {"label": "静帧推镜", "needs_image": False},
}


def _normalize_video_engine(raw: str) -> str:
    m = (raw or "").strip().lower().replace("-", "_")
    if m in ("i2v", "wan", "wan22", "wan2.2_5b", "wan22_ti2v", "wan22_5b", "wan22_14b", "wan22_14b_gguf"):
        return "wan22_14b_gguf"
    if m in ("ltx", "ltx2.5", "ltx25", "ltx_i2v", "ltx25_img"):
        return "ltx25_i2v"
    if m in ("ltx_t2v", "ltx25_t2v", "ltx2.5_t2v"):
        return "ltx25_t2v"
    if m in ("still", "ken_burns", "slideshow"):
        return "kenburns"
    if m in _VIDEO_ENGINES:
        return m
    return "wan22_14b_gguf"



def _parse_video_engines(raw_modes=None, raw_single: str = "") -> List[str]:
    """解析多选引擎；保序去重；非法/空则默认 Wan。"""
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
        m = _normalize_video_engine(it)
        if m not in seen:
            seen.add(m)
            out.append(m)
    return out or ["wan22_14b_gguf"]



def _now_ts_ms() -> int:
    return int(time.time() * 1000)


def _format_elapsed(sec: float, *, coarse: bool = False) -> str:
    """友好耗时：31.2s / 4m12s；coarse 时不足 1 分钟用整数秒（31s）。"""
    sec = max(0.0, float(sec or 0.0))
    if sec < 60:
        if coarse:
            return f"{int(round(sec))}s"
        return f"{sec:.1f}s"
    m = int(sec // 60)
    s = int(round(sec - m * 60))
    if s >= 60:
        m += 1
        s = 0
    return f"{m}m{s:02d}s"


def _timing_bucket(task: dict) -> dict:
    t = task.get("timing")
    if not isinstance(t, dict):
        t = {}
        task["timing"] = t
    return t


def _build_shots_ui_from_folder(task_dir: Path, plan: dict) -> List[dict]:
    images_dir = task_dir / "images"
    shots = plan.get("shots") or []
    shots_ui: List[dict] = []
    for shot in shots:
        idx = int(shot.get("index", 0))
        cands = sorted(images_dir.glob(f"{idx:02d}_c*.png"))
        if not cands:
            # 兼容只有单图命名
            alt = images_dir / f"{idx:02d}.png"
            cands = [alt] if alt.exists() else []
        candidates = []
        for ci, p in enumerate(cands):
            candidates.append(
                {
                    "index": ci,
                    "filename": p.name,
                    "url": f"/output/{task_dir.name}/images/{p.name}",
                }
            )
        if not candidates:
            continue
        shots_ui.append(
            {
                "index": idx,
                "voiceover": shot.get("voiceover") or "",
                "duration_sec": shot.get("duration_sec") or 5,
                "candidates": candidates,
                "default_pick": 0,
            }
        )
    return shots_ui


def _history_item_from_dir(d: Path) -> Optional[dict]:
    images_dir = d / "images"
    if not d.is_dir() or not images_dir.is_dir():
        return None
    imgs = sorted(images_dir.glob("*.png"))
    if not imgs:
        return None
    plan = {}
    plan_path = d / "plan.json"
    if plan_path.exists():
        try:
            plan = json.loads(plan_path.read_text(encoding="utf-8"))
        except Exception:
            plan = {}
    title = (plan.get("title") or d.name).strip()
    video_url = ""
    for name in ("trailer_16_9.mp4", "trailer_9_16.mp4"):
        if (d / name).exists():
            video_url = f"/output/{d.name}/{name}"
            break
    if not video_url:
        extras = sorted(d.glob("trailer_*.mp4"))
        if extras:
            video_url = f"/output/{d.name}/{extras[0].name}"
    video_urls = []
    for p in sorted(d.glob("trailer_*.mp4")):
        # skip primary alias duplicates later in UI if needed
        stem = p.stem  # trailer_16_9 or trailer_wan22_14b_gguf_16_9
        mode_guess = ""
        if stem.startswith("trailer_") and stem.endswith(("_16_9", "_9_16")):
            mid = stem[len("trailer_") : -len("_16_9") if stem.endswith("_16_9") else -len("_9_16")]
            if mid not in ("16_9", "9_16", ""):
                mode_guess = mid
        label = (_VIDEO_ENGINES.get(mode_guess) or {}).get("label") or (mode_guess or p.name)
        video_urls.append(
            {
                "mode": mode_guess or "primary",
                "label": label,
                "filename": p.name,
                "url": f"/output/{d.name}/{p.name}",
            }
        )
    mtime = d.stat().st_mtime
    # 展示用北京时间
    try:
        from zoneinfo import ZoneInfo

        created_display = (
            datetime.fromtimestamp(mtime, tz=ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d %H:%M:%S")
        )
    except Exception:
        created_display = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
    thumbs = [f"/output/{d.name}/images/{p.name}" for p in imgs[:4]]
    return {
        "folder": d.name,
        "title": title,
        "prompt": (plan.get("logline") or plan.get("synopsis") or "")[:120],
        "shot_count": len(plan.get("shots") or []) or len({p.name[:2] for p in imgs}),
        "image_count": len(imgs),
        "thumbs": thumbs,
        "video_url": video_url,
        "video_urls": video_urls,
        "created_display": created_display,
        "mtime": mtime,
    }


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
    bible = _normalize_bible({}, text)
    return {
        "title": (text[:40] or "视频流水线"),
        "logline": text[:120],
        "shot_duration_sec": dur,
        "segment_count": len(shots),
        "target_seconds": round(dur * len(shots), 1),
        "shots": shots,
        "source": "fallback",
        "characters": bible.get("characters") or [],
        "bible": bible,
    }


def _normalize_bible(obj: dict, prompt: str = "") -> dict:
    """全剧设定：风格/世界观/关系等，默认由 DeepSeek 产出，用户只需粗选画风芯片。"""
    raw = obj.get("bible") if isinstance(obj.get("bible"), dict) else {}
    characters = []
    src_chars = raw.get("characters") if isinstance(raw.get("characters"), list) else None
    if not src_chars:
        src_chars = obj.get("characters") if isinstance(obj.get("characters"), list) else []
    for c in src_chars[:12]:
        if not isinstance(c, dict):
            continue
        name = str(c.get("name") or "").strip()
        look = str(c.get("look") or c.get("appearance") or "").strip()
        if not name and not look:
            continue
        characters.append(
            {
                "id": str(c.get("id") or f"c{len(characters) + 1}").strip()[:16],
                "name": name or f"角色{len(characters) + 1}",
                "look": look[:400],
                "role": str(c.get("role") or "").strip()[:80],
            }
        )
    style_notes = str(
        raw.get("style_notes") or raw.get("style") or raw.get("art_style") or ""
    ).strip()[:600]
    world_look = str(raw.get("world_look") or raw.get("world") or raw.get("setting") or "").strip()[
        :600
    ]
    relationships = str(
        raw.get("relationships") or raw.get("character_relations") or ""
    ).strip()[:500]
    palette = str(raw.get("palette") or raw.get("color_palette") or "").strip()[:200]
    mood = str(raw.get("mood") or raw.get("overall_mood") or "").strip()[:120]
    ref_prompts: List[str] = []
    raw_refs = raw.get("ref_prompts") or raw.get("reference_prompts") or []
    if isinstance(raw_refs, list):
        for p in raw_refs[:6]:
            t = str(p or "").strip()
            if t:
                ref_prompts.append(t[:500])
    if not ref_prompts:
        # 从角色/世界观拼出默认参考图提示
        if characters:
            for ch in characters[:3]:
                ref_prompts.append(
                    f"character design sheet of {ch.get('name')}: {ch.get('look')}, "
                    f"full body and face close-up, consistent costume, clean background, "
                    f"key visual, no text, no watermark"
                )
        if world_look:
            ref_prompts.append(
                f"establishing mood board: {world_look}. cinematic environment key art, "
                f"no characters or tiny figures only, no text, no watermark"
            )
        if not ref_prompts:
            tip = (prompt or "cinematic story world").strip()[:120]
            ref_prompts = [
                f"cinematic key visual mood board for: {tip}, consistent art style, no text",
                f"main character design sheet for story: {tip}, full body, face detail, no text",
            ]
    if not style_notes:
        style_notes = "cinematic, coherent color grading, consistent character design across shots"
    return {
        "style_notes": style_notes,
        "world_look": world_look,
        "relationships": relationships,
        "palette": palette,
        "mood": mood,
        "characters": characters,
        "ref_prompts": ref_prompts[:6],
    }


def _bible_prompt_prefix(plan: dict) -> str:
    bible = (plan or {}).get("bible") if isinstance(plan, dict) else None
    if not isinstance(bible, dict):
        return ""
    parts = []
    if bible.get("style_notes"):
        parts.append(f"global style: {bible['style_notes']}")
    if bible.get("palette"):
        parts.append(f"palette: {bible['palette']}")
    if bible.get("world_look"):
        parts.append(f"world: {bible['world_look']}")
    if bible.get("mood"):
        parts.append(f"overall mood: {bible['mood']}")
    chars = bible.get("characters") or []
    if isinstance(chars, list) and chars:
        bits = []
        for c in chars[:6]:
            if not isinstance(c, dict):
                continue
            bits.append(f"{c.get('name')}: {c.get('look')}")
        if bits:
            parts.append("characters: " + "; ".join(bits))
    if not parts:
        return ""
    prefix = "Consistent series bible: " + ". ".join(parts) + ". "
    prefix += (
        "Cast rule: only show characters required by the current shot; "
        "do not force the full ensemble into every frame. "
    )
    return prefix


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

    bible = _normalize_bible(obj, prompt)

    return {
        "title": title,
        "logline": logline,
        "shot_duration_sec": dur,
        "segment_count": len(shots),
        "segment_count_requested": want,
        "target_seconds": round(dur * len(shots), 1),
        "shots": shots,
        "source": "deepseek",
        "characters": bible.get("characters") or [],
        "bible": bible,
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
  "bible": {{
    "style_notes": "英文：全剧画风/光影/镜头气质（供后续文生图统一前缀）",
    "world_look": "英文：时代、地点、整体风貌",
    "palette": "英文：主色调",
    "mood": "英文：整体情绪",
    "relationships": "中文：主要人物关系一两句",
    "characters": [{{"id":"c1","name":"角色名","role":"身份","look":"英文外形/服装描述"}}],
    "ref_prompts": [
      "英文：全剧参考图1提示词（角色定妆或世界观情绪板，无文字无水印）",
      "英文：全剧参考图2提示词"
    ]
  }},
  "characters": [{{"id":"c1","name":"角色名","look":"英文外形描述"}}],
  "shots": [
    {{
      "duration_sec": {dur:g},
      "voiceover": "中文旁白（简短有力，适合配音）",
      "visual_prompt": "英文文生图提示词：主体、动作、环境、光影、镜头景别；须符合 bible 设定；不要出现字幕/文字/水印",
      "camera": "wide|medium|close|detail",
      "mood": "情绪词"
    }}
  ]
}}

硬性要求：
1. shots 数量 {n_lo}～{n_hi}；每镜 duration_sec 一律写 {dur:g}。
2. 叙事节奏随段数伸缩：段数少则单镜信息密度更高；段数多则开场钩子→冲突→高潮→收束。
3. 若输入是知名作品名，基于公开剧情常识写分镜与人物设定；若是原创梗概，紧扣梗概。用户未细写画风时，由你在 bible 里完整定调。
4. voiceover 用中文，单镜汉字数按 {dur:g} 秒语速控制（约每秒 3～4 字，勿过长）；visual_prompt 用英文。
5. 风格一致性：bible.style_notes 与所有 visual_prompt 都要符合「{style['label']}」。
6. 不要在画面提示里要求生成文字、标题卡上的字、logo。
7. 总时长大约 {total_hint:g} 秒（{want}×{dur:g}）。
8. ref_prompts 给 2～4 条，用于生成全剧参考定妆/情绪板（不是分镜），角色外形须与 characters 一致。
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


def _write_silence_wav(path: Path, duration_sec: float = 1.0, sr: int = 24000) -> None:
    import wave

    n = max(1, int(float(duration_sec) * int(sr)))
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(b"\x00\x00" * n)


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


def _ensure_wav(src_or_wav: Path, wav_dst: Path) -> Path:
    """若已是 wav 则返回；否则用 ffmpeg 转成 wav_dst。"""
    wav_dst = Path(wav_dst)
    if wav_dst.exists() and wav_dst.stat().st_size > 0:
        with open(wav_dst, "rb") as f:
            if f.read(4) == b"RIFF":
                return wav_dst
    src = Path(src_or_wav)
    if not src.exists():
        raise FileNotFoundError(f"音频源不存在：{src}")
    if src.resolve() == wav_dst.resolve() and src.suffix.lower() == ".wav":
        return wav_dst
    try:
        import imageio_ffmpeg
        import subprocess

        ff = imageio_ffmpeg.get_ffmpeg_exe()
        wav_dst.parent.mkdir(parents=True, exist_ok=True)
        proc = subprocess.run(
            [ff, "-y", "-i", str(src), "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(wav_dst)],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0 or not wav_dst.exists() or wav_dst.stat().st_size <= 0:
            raise RuntimeError((proc.stderr or proc.stdout or "")[-500:])
        return wav_dst
    except Exception as e:
        # MoviePy 兜底
        clip = AudioFileClip(str(src))
        try:
            clip.write_audiofile(
                str(wav_dst),
                fps=24000,
                nbytes=2,
                codec="pcm_s16le",
                ffmpeg_params=["-ac", "1"],
                logger=None,
            )
        finally:
            try:
                clip.close()
            except Exception:
                pass
        if not wav_dst.exists():
            raise RuntimeError(f"转 wav 失败：{e}")
        return wav_dst


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
            candidates_per_shot: str = Form("1"),
            voice: str = Form("zh-CN-YunxiNeural"),
            speed: str = Form("1.0"),
            shot_duration: str = Form("5"),
            segment_count: str = Form("1"),
            video_mode: str = Form("wan22_14b_gguf"),
            video_modes: str = Form(""),
            use_global_refs: str = Form("1"),
        ):
            text = (prompt or "").strip()
            if len(text) < 2:
                raise HTTPException(status_code=400, detail="请输入书名、影视名或故事梗概")
            aspect_n = _normalize_aspect(aspect)
            style_n = (visual_style or "realistic").strip().lower()
            if style_n not in _VISUAL_STYLES:
                style_n = "realistic"
            modes = _parse_video_engines(video_modes, video_mode)
            mode = modes[0]
            try:
                cand = max(1, min(5, int(candidates_per_shot or 1)))
            except Exception:
                cand = 1
            try:
                spd = float(speed or 1.0)
            except Exception:
                spd = 1.0
            spd = max(0.7, min(1.4, spd))
            shot_dur = _clamp_shot_duration(shot_duration)
            seg_n = _clamp_segment_count(segment_count)
            use_refs = str(use_global_refs or "1").strip().lower() not in ("0", "false", "no", "off")

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
                "video_modes": modes,
                "video_urls": [],
                "candidates_per_shot": cand,
                "voice": (voice or "zh-CN-YunxiNeural").strip(),
                "speed": spd,
                "shot_duration_sec": shot_dur,
                "segment_count": seg_n,
                "target_seconds": round(shot_dur * seg_n, 1),
                "use_global_refs": use_refs,
                "plan": None,
                "shots_ui": [],
                "global_refs_ui": [],
                "global_refs_selected": [],
                "picks": {},
                "video_url": "",
                "export_hint": "",
                "timing": {},
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

        @app.post("/trailer/upload-global-ref")
        @app.post("/api/trailer/upload-global-ref")
        async def trailer_upload_global_ref(
            task_id: str = Form(...),
            file: UploadFile = File(...),
        ):
            task = api.tasks.get(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            if task.get("status") not in ("awaiting_global_refs",):
                raise HTTPException(status_code=400, detail="当前不能上传全剧参考图")
            raw = await file.read()
            if not raw:
                raise HTTPException(status_code=400, detail="空文件")
            if len(raw) > 12 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="图片过大（上限 12MB）")
            task_dir = api._task_dir(task)
            refs_dir = task_dir / "global_refs"
            refs_dir.mkdir(parents=True, exist_ok=True)
            n = len(list(refs_dir.glob("upload_*")))
            name = f"upload_{n:02d}.png"
            # 统一存 PNG
            try:
                from io import BytesIO

                im = Image.open(BytesIO(raw))
                if im.mode not in ("RGB", "RGBA"):
                    im = im.convert("RGBA")
                out = BytesIO()
                im.convert("RGB").save(out, format="PNG")
                raw = out.getvalue()
            except Exception:
                pass
            (refs_dir / name).write_bytes(raw)
            item = {
                "filename": name,
                "url": f"/output/{task_dir.name}/global_refs/{name}",
                "source": "upload",
                "label": (file.filename or name)[:80],
                "selected": True,
            }
            ui = list(task.get("global_refs_ui") or [])
            ui.append(item)
            task["global_refs_ui"] = ui
            api._log(task, f"已上传全剧参考图：{name}")
            return {"success": True, "item": item, "global_refs_ui": ui}

        @app.post("/trailer/confirm-global-refs")
        @app.post("/api/trailer/confirm-global-refs")
        async def trailer_confirm_global_refs(
            task_id: str = Form(...),
            selected_json: str = Form("[]"),
            skip: str = Form("0"),
        ):
            task = api.tasks.get(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            if task.get("status") != "awaiting_global_refs":
                raise HTTPException(status_code=400, detail="当前不在全剧参考图阶段")
            do_skip = str(skip or "0").strip() in ("1", "true", "True")
            selected: List[str] = []
            if not do_skip:
                try:
                    raw_sel = json.loads(selected_json or "[]")
                except Exception:
                    raise HTTPException(status_code=400, detail="selected_json 无效")
                if isinstance(raw_sel, list):
                    selected = [str(x).strip() for x in raw_sel if str(x).strip()]
                # 校验文件存在
                refs_dir = api._task_dir(task) / "global_refs"
                ok = []
                for fn in selected:
                    # 禁止路径穿越
                    safe = Path(fn).name
                    if (refs_dir / safe).is_file():
                        ok.append(safe)
                selected = ok
            task["global_refs_selected"] = selected
            # 同步 UI selected 标记
            for it in task.get("global_refs_ui") or []:
                if isinstance(it, dict):
                    it["selected"] = it.get("filename") in selected
            task["status"] = "running"
            task["stage"] = "images"
            task["error"] = ""
            if do_skip or not selected:
                api._log(task, "跳过全剧参考图勾选（仍使用 DeepSeek 文字 bible）")
            else:
                api._log(task, f"已确认全剧参考图 {len(selected)} 张，开始分镜生图")
            asyncio.create_task(api._continue_after_global_refs(task_id))
            return {"success": True, "task_id": task_id, "selected": selected}

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

        @app.get("/trailer/history")
        @app.get("/api/trailer/history")
        async def trailer_history(limit: int = 24):
            root: Path = api.deps["output_root"]
            if not root.exists():
                return {"success": True, "items": []}
            try:
                lim = max(1, min(60, int(limit)))
            except Exception:
                lim = 24
            dirs = [p for p in root.iterdir() if p.is_dir()]
            dirs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            items = []
            for d in dirs:
                if len(items) >= lim:
                    break
                # 跳过测试目录；优先流水线目录（含 trailer 或 trailer_*.mp4）
                if d.name.startswith("_"):
                    continue
                item = _history_item_from_dir(d)
                if not item:
                    continue
                is_trailer = (
                    "trailer" in d.name.lower()
                    or bool(item.get("video_url"))
                    or (d / "selected_shots.json").exists()
                )
                if not is_trailer:
                    continue
                items.append(item)
            return {"success": True, "items": items}

        @app.post("/trailer/reuse")
        @app.post("/api/trailer/reuse")
        async def trailer_reuse(
            folder: str = Form(...),
            voice: str = Form("zh-CN-YunxiNeural"),
            speed: str = Form("1.0"),
            shot_duration: str = Form(""),
            video_mode: str = Form("wan22_14b_gguf"),
            video_modes: str = Form(""),
            auto_compose: str = Form("0"),
        ):
            root: Path = api.deps["output_root"]
            src_name = Path(str(folder or "").strip()).name
            if not src_name or src_name in (".", ".."):
                raise HTTPException(status_code=400, detail="无效的历史目录")
            src = root / src_name
            if not src.is_dir() or not (src / "images").is_dir():
                raise HTTPException(status_code=404, detail="历史任务不存在或无图片")

            plan_path = src / "plan.json"
            if not plan_path.exists():
                raise HTTPException(status_code=400, detail="历史任务缺少 plan.json，无法复用")
            try:
                plan = json.loads(plan_path.read_text(encoding="utf-8"))
            except Exception:
                raise HTTPException(status_code=400, detail="plan.json 无效")
            if not isinstance(plan, dict) or not (plan.get("shots") or []):
                raise HTTPException(status_code=400, detail="历史分镜为空")

            shots_ui_src = _build_shots_ui_from_folder(src, plan)
            if not shots_ui_src:
                raise HTTPException(status_code=400, detail="历史目录中找不到分镜图片")

            modes = _parse_video_engines(video_modes, video_mode)
            mode = modes[0]
            try:
                spd = float(speed or 1.0)
            except Exception:
                spd = 1.0
            spd = max(0.7, min(1.4, spd))
            if str(shot_duration or "").strip():
                shot_dur = _clamp_shot_duration(shot_duration)
            else:
                shot_dur = _clamp_shot_duration(
                    (plan.get("shots") or [{}])[0].get("duration_sec") or 5
                )

            out_dir = api._alloc_dir()
            dst = root / out_dir
            dst.mkdir(parents=True, exist_ok=True)
            shutil.copytree(src / "images", dst / "images")
            (dst / "plan.json").write_text(
                json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8"
            )

            shots_ui = []
            for shot in shots_ui_src:
                cands = []
                for c in shot.get("candidates") or []:
                    cands.append(
                        {
                            **c,
                            "url": f"/output/{out_dir}/images/{c['filename']}",
                        }
                    )
                shots_ui.append({**shot, "candidates": cands})

            max_cands = max((len(s.get("candidates") or []) for s in shots_ui), default=1)
            do_auto = str(auto_compose or "0").strip() in ("1", "true", "True") or max_cands <= 1

            task_id = uuid.uuid4().hex
            aspect = _normalize_aspect(plan.get("aspect") or "16_9")
            sel_path = src / "selected_shots.json"
            if sel_path.exists():
                try:
                    sel = json.loads(sel_path.read_text(encoding="utf-8"))
                    if isinstance(sel, dict) and sel.get("aspect"):
                        aspect = _normalize_aspect(sel["aspect"])
                    # 兼容旧版 selected_shots 为数组
                    if isinstance(sel, list):
                        pass
                except Exception:
                    pass

            task = {
                "task_id": task_id,
                "output_dir": out_dir,
                "status": "running" if do_auto else "awaiting_picks",
                "stage": "compose" if do_auto else "awaiting_picks",
                "progress": {"current": 0, "total": 1},
                "logs": [],
                "error": "",
                "created_at": _now_ts_ms(),
                "prompt": (plan.get("title") or src_name),
                "visual_style": (plan.get("visual_style") or "realistic"),
                "aspect": aspect,
                "video_mode": mode,
                "video_modes": modes,
                "video_urls": [],
                "candidates_per_shot": max_cands,
                "voice": (voice or "zh-CN-YunxiNeural").strip(),
                "speed": spd,
                "shot_duration_sec": shot_dur,
                "segment_count": len(plan.get("shots") or []),
                "target_seconds": round(shot_dur * len(plan.get("shots") or []), 1),
                "plan": plan,
                "shots_ui": shots_ui,
                "picks": {str(s["index"]): int(s.get("default_pick") or 0) for s in shots_ui},
                "video_url": "",
                "export_hint": "",
                "reused_from": src_name,
            }
            api.tasks[task_id] = task
            api._log(task, f"复用历史关键帧：{src_name} → {out_dir}（{len(shots_ui)} 镜）")
            if do_auto:
                api._log(task, "历史关键帧每镜单图或已勾选自动成片，跳过选图")
                asyncio.create_task(api._run_compose(task_id))
            else:
                api._log(task, "请勾选每镜关键帧后点「确认选图并成片」")
            return {
                "success": True,
                "task_id": task_id,
                "auto_compose": do_auto,
                "shots_ui": shots_ui,
                "plan": plan,
            }

    async def _run_until_picks(self, task_id: str) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        try:
            await self._phase_plan(task)
            if task.get("status") == "cancelled":
                return
            if task.get("use_global_refs", True):
                await self._phase_global_refs(task)
                if task.get("status") == "cancelled":
                    return
                task["status"] = "awaiting_global_refs"
                task["stage"] = "awaiting_global_refs"
                self._log(
                    task,
                    "全剧参考候选已生成：勾选保留的 AI 图，或上传自己的图，再点「确认全剧参考」；也可跳过仅用文字设定",
                )
                return
            await self._continue_after_global_refs(task_id)
        except Exception as e:
            if task.get("status") != "cancelled":
                task["status"] = "error"
                task["stage"] = "error"
                task["error"] = str(e)
                self._log(task, f"失败：{e}")

    async def _continue_after_global_refs(self, task_id: str) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        try:
            if task.get("status") == "cancelled":
                return
            task["status"] = "running"
            await self._phase_images(task)
            if task.get("status") == "cancelled":
                return
            # 每镜仅 1 张：无需人工选图，直接成片
            if int(task.get("candidates_per_shot") or 1) <= 1:
                task["picks"] = {
                    str(s.get("index")): int(s.get("default_pick") or 0)
                    for s in (task.get("shots_ui") or [])
                }
                task["status"] = "running"
                task["stage"] = "compose"
                task["error"] = ""
                self._log(task, "每镜 1 张候选，跳过选图，直接成片")
                await self._run_compose(task_id)
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

    async def _phase_global_refs(self, task: dict) -> None:
        plan = task.get("plan") or {}
        bible = plan.get("bible") if isinstance(plan.get("bible"), dict) else _normalize_bible(plan, task.get("prompt") or "")
        if not isinstance(plan.get("bible"), dict):
            plan["bible"] = bible
            task["plan"] = plan
        prompts = list(bible.get("ref_prompts") or [])[:4]
        if not prompts:
            prompts = _normalize_bible({}, task.get("prompt") or "").get("ref_prompts") or []

        aspect = task["aspect"]
        w, h = _ASPECT_SIZES[aspect]
        style = _style_meta(task["visual_style"])
        task["stage"] = "global_refs"
        task["progress"] = {"current": 0, "total": max(1, len(prompts))}
        self._log(task, f"生成全剧参考图候选 {len(prompts)} 张（定妆/情绪板）…")
        t0 = time.perf_counter()

        task_dir = self._task_dir(task)
        refs_dir = task_dir / "global_refs"
        refs_dir.mkdir(parents=True, exist_ok=True)

        build_wf = self.deps["build_z_image_workflow"]
        run_comfy = self.deps["run_comfyui_and_get_last_image"]
        neg = self.deps["default_txt2img_negative"]("", width=w, height=h)
        no_text = self.deps.get("image_no_text_prefix") or ""
        bible_prefix = _bible_prompt_prefix(plan)

        ui = list(task.get("global_refs_ui") or [])
        # 保留已上传的
        ui = [x for x in ui if isinstance(x, dict) and x.get("source") == "upload"]
        for i, rp in enumerate(prompts):
            if task.get("status") == "cancelled":
                return
            task["progress"] = {"current": i + 1, "total": len(prompts)}
            self._log(task, f"全剧参考图 {i + 1}/{len(prompts)}")
            pos = (
                f"{no_text}{bible_prefix}{rp}. {style['suffix']}. "
                f"{style['zh']}. series style guide still, no text, no watermark, no subtitles, no logo."
            )
            seed = random.randint(1, 2_000_000_000)
            workflow = build_wf(pos, seed=seed, width=w, height=h, negative_text=neg)
            img_bytes = await run_comfy(workflow)
            name = f"bible_{i:02d}.png"
            (refs_dir / name).write_bytes(img_bytes)
            ui.append(
                {
                    "filename": name,
                    "url": f"/output/{task_dir.name}/global_refs/{name}",
                    "source": "ai",
                    "label": f"参考 {i + 1}",
                    "prompt": rp[:200],
                    "selected": True,
                }
            )
        task["global_refs_ui"] = ui
        task["global_refs_selected"] = [x["filename"] for x in ui if x.get("selected")]
        # 写入 bible 摘要便于页面展示
        task["bible_summary"] = {
            "style_notes": bible.get("style_notes") or "",
            "world_look": bible.get("world_look") or "",
            "palette": bible.get("palette") or "",
            "mood": bible.get("mood") or "",
            "relationships": bible.get("relationships") or "",
            "characters": bible.get("characters") or [],
        }
        elapsed = time.perf_counter() - t0
        _timing_bucket(task)["global_refs_sec"] = round(elapsed, 2)
        self._log(
            task,
            f"全剧参考图完成，共 {len(ui)} 张，耗时 {_format_elapsed(elapsed)}",
        )

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
            bible = plan.get("bible") if isinstance(plan.get("bible"), dict) else {}
            if bible.get("style_notes") or bible.get("characters"):
                n_ch = len(bible.get("characters") or [])
                self._log(
                    task,
                    f"全剧设定已写入 bible（角色 {n_ch} 个；画风/世界观由 DeepSeek 自动定调）",
                )

        task["plan"] = plan
        # 便于历史复用时还原画幅/风格
        if isinstance(plan, dict):
            plan["aspect"] = aspect
            plan["visual_style"] = style
            plan["shot_duration_sec"] = shot_dur
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
        t0 = time.perf_counter()
        for shot in shots:
            if task.get("status") == "cancelled":
                return
            idx = int(shot["index"])
            base_prompt = (shot.get("visual_prompt") or "").strip()
            bible_prefix = _bible_prompt_prefix(plan)
            # 有勾选全剧参考时，提示词强调与定妆一致（当前引擎靠文字 bible；参考图文件已落盘供剪映/后续）
            ref_note = ""
            sel = task.get("global_refs_selected") or []
            if sel:
                ref_note = (
                    "Keep character looks and art style consistent with the series bible / look refs "
                    f"({len(sel)} sheets). Compose THIS shot from the shot prompt only; "
                    "include ONLY characters required by this shot; do not copy reference group lineup. "
                )
            pos = (
                f"{no_text}{bible_prefix}{ref_note}{base_prompt}. {style['suffix']}. "
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
        elapsed = time.perf_counter() - t0
        _timing_bucket(task)["images_sec"] = round(elapsed, 2)
        self._log(
            task,
            f"生图完成，共 {len(shots)} 镜 {done} 张，耗时 {_format_elapsed(elapsed)}",
        )

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
        if not shots or not shots_ui:
            raise RuntimeError("缺少分镜或候选图")

        modes = _parse_video_engines(task.get("video_modes"), task.get("video_mode") or "wan22_14b_gguf")
        task["video_modes"] = modes
        multi = len(modes) > 1
        n_engines = len(modes)
        video_urls: List[dict] = []
        last_result: Optional[dict] = None
        engine_notes: List[str] = []
        tts_total = 0.0
        video_total = 0.0

        for ei, mode in enumerate(modes):
            if task.get("status") == "cancelled":
                return
            task["video_mode"] = mode
            label = (_VIDEO_ENGINES.get(mode) or {}).get("label") or mode
            self._log(task, f"对比成片 {ei + 1}/{n_engines}：{label}" if multi else f"成片引擎：{label}")
            result = await self._phase_compose_one(
                task,
                mode=mode,
                engine_index=ei,
                engine_total=n_engines,
                multi=multi,
            )
            if task.get("status") == "cancelled":
                return
            if result:
                video_urls.append(result)
                last_result = result
                engine_notes.append(str(result.get("engine_note") or label))
                tts_total += float(result.get("tts_sec") or 0)
                video_total += float(result.get("video_for_summary") or 0)

        if task.get("status") == "cancelled":
            return
        if not last_result:
            raise RuntimeError("全部成片引擎均失败")

        task_dir = self._task_dir(task)
        aspect = task["aspect"]
        primary_name = "trailer_16_9.mp4" if aspect == "16_9" else "trailer_9_16.mp4"
        primary_path = task_dir / primary_name
        src_path = task_dir / Path(last_result["url"]).name
        # last_result url is /output/folder/name — resolve by filename
        cand = task_dir / Path(str(last_result.get("filename") or "")).name
        if cand.exists():
            if primary_path.resolve() != cand.resolve():
                shutil.copy2(cand, primary_path)
        elif src_path.exists() and primary_path.resolve() != src_path.resolve():
            shutil.copy2(src_path, primary_path)

        timing = _timing_bucket(task)
        images_sec = float(timing.get("images_sec") or 0.0)
        timing["tts_sec"] = round(tts_total, 2)
        timing["video_total_sec"] = round(video_total, 2)
        timing["pipeline_sec"] = round(images_sec + tts_total + video_total, 2)

        task["video_url"] = f"/output/{task_dir.name}/{primary_name}"
        task["video_urls"] = video_urls
        task["video_duration_sec"] = float(last_result.get("duration_sec") or 0)
        task["output_directory"] = str(task_dir.resolve())
        task["video_engine"] = str(last_result.get("mode") or modes[-1])
        note_join = "；".join(engine_notes) if multi else (engine_notes[0] if engine_notes else "")
        task["export_hint"] = (
            f"粗剪已生成（{note_join}）。"
            + ("多引擎对比成片已分别保存，可在预览区切换。" if multi else "")
            + (
                "素材在任务目录 images / clips_* / audio_*，可导入剪映。"
                if multi
                else "素材在任务目录 images / clips / audio，可导入剪映。"
            )
        )
        task["status"] = "done"
        task["stage"] = "done"
        task["progress"] = {"current": 1, "total": 1}
        self._log(
            task,
            f"完成：{primary_name}"
            + (f"（对比 {len(video_urls)} 引擎）" if multi else "")
            + f"（约 {task['video_duration_sec']:.1f}s）",
        )
        parts = [
            f"生图 {_format_elapsed(images_sec, coarse=True)}",
            f"视频 {_format_elapsed(video_total, coarse=True)}",
            f"配音 {_format_elapsed(tts_total, coarse=True)}",
        ]
        self._log(
            task,
            f"成片总耗时 {_format_elapsed(timing['pipeline_sec'])}（{' · '.join(parts)}）",
        )


    async def _phase_compose_one(
        self,
        task: dict,
        *,
        mode: str,
        engine_index: int = 0,
        engine_total: int = 1,
        multi: bool = False,
    ) -> Optional[dict]:
        plan = task.get("plan") or {}
        shots = plan.get("shots") or []
        shots_ui = task.get("shots_ui") or []
        picks = task.get("picks") or {}
        if not shots or not shots_ui:
            raise RuntimeError("缺少分镜或候选图")

        task_dir = self._task_dir(task)
        images_dir = task_dir / "images"
        mode = _normalize_video_engine(mode)
        task["video_mode"] = mode
        audio_dir = task_dir / (f"audio_{mode}" if multi else "audio")
        clips_dir = task_dir / (f"clips_{mode}" if multi else "clips")
        audio_dir.mkdir(parents=True, exist_ok=True)
        clips_dir.mkdir(parents=True, exist_ok=True)

        aspect = task["aspect"]
        out_size = _ASPECT_VIDEO[aspect]
        i2v_wh = _ASPECT_I2V[aspect]
        ltx_wh = _ASPECT_LTX[aspect]
        voice = task.get("voice")
        speed = task.get("speed")
        engine_meta = _VIDEO_ENGINES.get(mode) or _VIDEO_ENGINES["wan22_14b_gguf"]
        tts = self.deps["indextts_synthesize"]
        wav_dur = self.deps["wav_duration_seconds"]
        create_subs = self.deps["create_subtitle_overlays_timed"]
        upload_bytes = self.deps.get("upload_image_bytes")
        build_wan = self.deps.get("build_wan22_ti2v_workflow")
        build_ltx_t2v = self.deps.get("build_ltx25_t2v_workflow")
        build_ltx_i2v = self.deps.get("build_ltx25_i2v_workflow")
        run_video = self.deps.get("run_comfyui_and_get_last_video")
        use_wan = (
            mode == "wan22_14b_gguf"
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
        use_tts = use_wan or mode == "kenburns" or not use_comfy_video

        image_paths: List[Path] = []
        video_clip_paths: List[Path] = []
        audio_paths: List[Optional[Path]] = []
        durations: List[float] = []
        sub_timelines: List[Optional[List[Tuple[str, float, float]]]] = []
        srt_lines: List[str] = []
        t_cursor = 0.0
        i2v_fail = 0
        tts_sec = 0.0
        video_sec = 0.0

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

            # 1) Wan / 静帧推镜：IndexTTS 旁白；LTX：直出音轨，跳过配音
            task["progress"] = {
                "current": engine_index * n_shots + i + 1,
                "total": max(1, engine_total * n_shots),
            }
            dur = min(10.0, max(3.0, planned))
            raw_wav = audio_dir / f"{idx:02d}_raw.wav"
            final_wav = audio_dir / f"{idx:02d}.wav"
            tts_len = planned

            if use_tts:
                task["stage"] = "tts"
                self._log(task, f"配音 分镜 {idx + 1}/{n_shots}")
                t_tts0 = time.perf_counter()
                produced = await tts(vo, raw_wav, voice=voice, speed=speed)
                produced_path = Path(produced) if produced else raw_wav
                mp3_fallback = raw_wav.with_suffix(".mp3")
                if not raw_wav.exists() or raw_wav.stat().st_size <= 0:
                    src = (
                        produced_path
                        if produced_path.exists()
                        else (mp3_fallback if mp3_fallback.exists() else None)
                    )
                    if src is None:
                        raise RuntimeError(f"配音文件未生成：{raw_wav}")
                    await asyncio.to_thread(_ensure_wav, src, raw_wav)
                if not raw_wav.exists():
                    raise RuntimeError(
                        f"配音文件未生成：{raw_wav}"
                        + (f"（仅有 {mp3_fallback.name}）" if mp3_fallback.exists() else "")
                    )
                audio_dur_fn = self.deps.get("audio_duration_seconds") or wav_dur
                tts_len = float(await asyncio.to_thread(audio_dur_fn, raw_wav))
                tts_sec += time.perf_counter() - t_tts0
                dur = min(10.0, max(3.0, max(planned, tts_len)))

            # 2) 视频引擎：Wan I2V / LTX I2V / T2V / 稍后 Ken Burns
            clip_path = clips_dir / f"{idx:02d}.mp4"
            made_video = False
            if use_comfy_video:
                task["stage"] = "i2v" if (use_wan or use_ltx_i2v) else "t2v"
                t_vid0 = time.perf_counter()
                try:
                    if use_wan:
                        length = _length_for_duration(dur)
                        self._log(
                            task,
                            f"Wan2.2-14B GGUF 图生视频 分镜 {idx + 1}/{n_shots}（{i2v_wh[0]}×{i2v_wh[1]} · {length}帧）",
                        )
                        comfy_name, _sub = await upload_bytes(
                            img_path.read_bytes(), name_prefix=f"trailer_wan_{idx:02d}_"
                        )
                        if not comfy_name:
                            raise RuntimeError("上传关键帧到 ComfyUI 失败")
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
                            f"LTX-2.5 图生视频 分镜 {idx + 1}/{n_shots}（{ltx_wh[0]}×{ltx_wh[1]} · {planned:g}s·直出音频）",
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
                            f"LTX-2.5 文生视频 分镜 {idx + 1}/{n_shots}（{ltx_wh[0]}×{ltx_wh[1]} · {planned:g}s·直出音频）",
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
                    made_video = True
                    try:
                        vdur = float(VideoFileClip(str(clip_path)).duration)
                    except Exception:
                        vdur = dur
                    if use_wan:
                        dur = max(tts_len, min(10.0, max(vdur, planned * 0.85)))
                    else:
                        dur = max(3.0, min(10.0, max(vdur, planned * 0.85)))
                    dur = max(3.0, dur)
                except Exception as e:
                    i2v_fail += 1
                    self._log(
                        task,
                        f"分镜 {idx + 1} {engine_meta['label']} 失败，该镜回退静帧推镜：{e}",
                    )
                    video_clip_paths.append(img_path)
                finally:
                    video_sec += time.perf_counter() - t_vid0
            else:
                video_clip_paths.append(img_path)

            if use_tts:
                await asyncio.to_thread(_pad_or_trim_wav, raw_wav, final_wav, dur)
                audio_paths.append(final_wav)
            elif made_video:
                audio_paths.append(None)
            else:
                await asyncio.to_thread(_write_silence_wav, final_wav, dur)
                audio_paths.append(final_wav)
            durations.append(dur)
            sub_timelines.append([(vo, 0.0, dur)])
            srt_lines.append(f"{i + 1}\n{_ts(t_cursor)} --> {_ts(t_cursor + dur)}\n{vo}\n")
            t_cursor += dur

        timing = _timing_bucket(task)
        timing["tts_sec"] = round(tts_sec, 2)
        timing["video_sec"] = round(video_sec, 2)

        if use_tts and tts_sec > 0:
            self._log(task, f"配音完成，{n_shots} 镜，耗时 {_format_elapsed(tts_sec)}")

        if use_comfy_video:
            if use_wan or use_ltx_i2v:
                vid_label = "图生视频"
            else:
                vid_label = "文生视频"
            self._log(
                task,
                f"{vid_label}完成，{n_shots} 镜，耗时 {_format_elapsed(video_sec)}"
                + (f"（失败回退 {i2v_fail} 镜）" if i2v_fail else ""),
            )
        elif not use_tts:
            self._log(task, f"跳过配音（LTX 直出音频 / 静帧静音）")

        task["stage"] = "video"
        self._log(task, f"拼接预览成片（约 {t_cursor:.1f}s，失败回退 {i2v_fail} 镜）…")
        t_mux0 = time.perf_counter()
        aspect_tag = "16_9" if aspect == "16_9" else "9_16"
        out_name = f"trailer_{mode}_{aspect_tag}.mp4" if multi else f"trailer_{aspect_tag}.mp4"
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
            if use_wan or use_tts:
                engine_note = f"{engine_meta['label']}（IndexTTS 旁白）"
            else:
                engine_note = f"{engine_meta['label']}（保留直出音轨）"
        elif mode == "kenburns":
            kb_audio = []
            for i, p in enumerate(audio_paths):
                if p and Path(p).exists():
                    kb_audio.append(Path(p))
                else:
                    sil = audio_dir / f"kb_sil_{i:02d}.wav"
                    await asyncio.to_thread(
                        _write_silence_wav, sil, float(durations[i] if i < len(durations) else 5)
                    )
                    kb_audio.append(sil)
            await asyncio.to_thread(
                _compose_trailer_sync,
                image_paths,
                kb_audio,
                durations,
                out_video,
                out_size,
                sub_timelines,
                create_subs,
                25,
            )
            engine_note = f"{engine_meta['label']}（关键帧推拉摇移）"
        else:
            # 混合失败时统一 Ken Burns；缺音频则补静音
            kb_audio = []
            for i, p in enumerate(audio_paths):
                if p and Path(p).exists():
                    kb_audio.append(Path(p))
                else:
                    sil = audio_dir / f"kb_sil_{i:02d}.wav"
                    await asyncio.to_thread(
                        _write_silence_wav, sil, float(durations[i] if i < len(durations) else 5)
                    )
                    kb_audio.append(sil)
            await asyncio.to_thread(
                _compose_trailer_sync,
                image_paths,
                kb_audio,
                durations,
                out_video,
                out_size,
                sub_timelines,
                create_subs,
                25,
            )
            engine_note = f"静帧推镜回退（{engine_meta['label']} 未全成功）"

        mux_sec = time.perf_counter() - t_mux0
        timing["mux_sec"] = round(mux_sec, 2)
        # 「视频」：图生/文生用 Comfy 耗时；静帧推镜主要耗时在拼接（与分项日志一致）
        if use_comfy_video:
            video_for_summary = video_sec
        else:
            video_for_summary = mux_sec
            self._log(
                task,
                f"静帧推镜完成，{n_shots} 镜，耗时 {_format_elapsed(mux_sec)}",
            )
        timing["video_total_sec"] = round(video_for_summary, 2)
        images_sec = float(timing.get("images_sec") or 0.0)
        total_pipeline = images_sec + tts_sec + video_for_summary
        timing["pipeline_sec"] = round(total_pipeline, 2)

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
                    "clip": f"{clips_dir.name}/{idx:02d}.mp4" if (clips_dir / f"{idx:02d}.mp4").exists() else None,
                    "visual_prompt": shot.get("visual_prompt"),
                }
            )
        sel_name = f"selected_shots_{mode}.json" if multi else "selected_shots.json"
        (task_dir / sel_name).write_text(
            json.dumps(
                {
                    "aspect": aspect,
                    "video_mode": mode,
                    "engine_note": engine_note,
                    "shots": picks_export,
                    "timing": timing,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        if not multi or engine_index == 0:
            (task_dir / "trailer.srt").write_text("\n".join(srt_lines), encoding="utf-8")
            (task_dir / "selected_shots.json").write_text(
                (task_dir / sel_name).read_text(encoding="utf-8"),
                encoding="utf-8",
            )
        readme = (
            "剪映精剪说明\n"
            "==============\n"
            f"1. trailer_*.mp4 为网站粗剪预览（{engine_note}）。\n"
            "2. images/ 静帧；clips[_引擎]/ 为每镜视频；audio[_引擎]/ 旁白。\n"
            "3. plan.json / selected_shots*.json / trailer.srt 对照分镜与字幕。\n"
            "4. 多引擎对比时：trailer_<引擎>_16_9.mp4（或 9_16）可并排比较。\n"
            "5. 视频引擎：Wan 2.2 14B I2V GGUF Q5_K_M / LTX 2.5 / 静帧推镜\n"
            "   需 ComfyUI-GGUF + 双路 UnetLoaderGGUF（HighNoise / LowNoise）。\n"
            "   API 模板：work-flow/wan22_i2v_14b_gguf.json 、 work-flow/ltx25_t2v.json\n"
        )
        (task_dir / "README_剪映.txt").write_text(readme, encoding="utf-8")

        self._log(task, f"引擎完成：{out_name}（约 {t_cursor:.1f}s · {engine_note}）")
        return {
            "mode": mode if all_video else "kenburns",
            "label": engine_meta["label"],
            "filename": out_name,
            "url": f"/output/{task_dir.name}/{out_name}",
            "engine_note": engine_note,
            "duration_sec": round(t_cursor, 1),
            "tts_sec": round(tts_sec, 2),
            "video_for_summary": round(video_for_summary, 2),
        }
