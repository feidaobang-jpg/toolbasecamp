import os
import sys
import json
import urllib.request
import urllib.parse
import uuid
import websocket
import threading
import base64
import time
import requests
import asyncio
import subprocess
import shutil
import textwrap
import re
import random
import wave
from pathlib import Path
from typing import Optional, List, Tuple, Iterable
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

# MoviePy 1.x 仍使用 PIL.Image.ANTIALIAS；Pillow 10+ 已移除，需先打补丁再 import moviepy
if not hasattr(Image, "ANTIALIAS"):
    Image.ANTIALIAS = Image.Resampling.LANCZOS

import numpy as np
import io
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, WebSocket
from fastapi.websockets import WebSocketState
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError, ConnectionClosed

from moviepy.editor import AudioFileClip, ImageClip, concatenate_videoclips, concatenate_audioclips, CompositeVideoClip

try:
    import edge_tts
    HAS_EDGE_TTS = True
except ImportError:
    HAS_EDGE_TTS = False

from resource_limits import apply_shared_pc_limits, comfyui_max_concurrent_jobs

_RESOURCE_LIMIT_INFO = apply_shared_pc_limits()
_COMFYUI_JOB_SEM = asyncio.Semaphore(comfyui_max_concurrent_jobs())
COMFYUI_SERVER_ADDRESS = "127.0.0.1:8188"
CLIENT_ID = str(uuid.uuid4())
WORKFLOW_FOLDER = "work-flow"  # 工作流文件夹名称

DEEPSEEK_API_URL = (os.environ.get("DEEPSEEK_API_URL") or "https://api.deepseek.com/v1/chat/completions").strip()

OUTPUT_FOLDER = "output"
FILES_FOLDER = "files"

_OUTPUT_ROOT = Path(os.path.dirname(__file__)) / OUTPUT_FOLDER
_FILES_ROOT = _OUTPUT_ROOT / FILES_FOLDER
# files 文件夹不再自动创建
_OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="ComfyUI Image Processor API")

# 添加 output 目录的静态文件挂载，用于 text-to-video 直接访问
app.mount("/output", StaticFiles(directory=str(_OUTPUT_ROOT)), name="output")
app.mount("/api/output", StaticFiles(directory=str(_OUTPUT_ROOT)), name="api_output")

# 配置 CORS（勿与 allow_credentials=True 同时使用 "*"）
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://web.xiaohui.work",
        "https://www.zhengxiaohui.cn",
        "https://zhengxiaohui.cn",
        "https://comfy.zhengxiaohui.cn",
    ],
    allow_origin_regex=r"https?://((localhost|127\.0\.0\.1)(:\d+)?|([a-z0-9-]+\.)?zhengxiaohui\.cn|.*\.tcloudbaseapp\.com)",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """
    健康检查：API 进程 + ComfyUI 是否可达（8188）。
    """
    comfy_ok = False
    comfy_err = None
    qwen_ckpt = None
    try:
        r = await asyncio.to_thread(
            requests.get, "http://{}/system_stats".format(COMFYUI_SERVER_ADDRESS), timeout=5
        )
        comfy_ok = r.status_code == 200
        if not comfy_ok:
            comfy_err = "HTTP {}".format(r.status_code)
    except Exception as e:
        comfy_err = str(e)

    if comfy_ok:
        names = await asyncio.to_thread(_fetch_checkpoint_names)
        pref = "AllInOne\\qwen\\Qwen-Rapid-AIO-NSFW-v10.safetensors"
        resolved = _resolve_qwen_checkpoint(pref)
        qwen_ckpt = resolved if resolved in names else None

    return {
        "status": "ok" if comfy_ok else "degraded",
        "message": "Service is running" if comfy_ok else "API up but ComfyUI unreachable",
        "comfyui": comfy_ok,
        "comfyui_address": COMFYUI_SERVER_ADDRESS,
        "comfyui_error": comfy_err,
        "qwen_checkpoint_ready": bool(qwen_ckpt),
        "qwen_checkpoint": qwen_ckpt,
        "qwen_img2img_quality": _QWEN_IMG2IMG_QUALITY,
        "gpu_hint": "Qwen 高质量档约 1.5MP·8 步，16GB 显存可试；OOM 请用标准档（1MP·4 步）。",
        "resource_limits": _RESOURCE_LIMIT_INFO,
    }


_TEXT_TO_VIDEO_TASKS = {}
_PHOTO_RESTORE_TASKS = {}
_IMG2IMG_TASKS = {}

# 文字配图：各平台常用尺寸（宽, 高）
_TEXT_TO_IMAGES_ASPECT_PRESETS = {
    "xhs_34": (1080, 1440),
    "xhs_11": (1080, 1080),
    "wx_post": (1080, 1080),
    "wx_emoji": (512, 512),
}


def _split_text_to_segments(text: str, scene_min_len: int = 12, scene_max_len: int = 45):
    """分镜：按句号/叹号/问号/逗号断句（中英文逗号均切分）。"""
    del scene_min_len, scene_max_len
    raw = (text or "").strip()
    if not raw:
        return []

    _SEG_END = "。！？!?，,"

    def _split_by_sentence_end(s: str) -> List[str]:
        s = (s or "").strip()
        if not s:
            return []
        if not re.search(r"[。！？!?，,]", s):
            return [s]

        out: List[str] = []
        buf = ""
        for ch in s:
            if ch in _SEG_END:
                buf += ch
                piece = buf.strip()
                if piece:
                    out.append(piece)
                buf = ""
            else:
                buf += ch
        if buf.strip():
            out.append(buf.strip())
        return out

    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    parts: List[str] = []
    for ln in lines:
        parts.extend(_split_by_sentence_end(ln))
    return parts


def _split_text_to_phrases(text: str) -> List[str]:
    raw = (text or "").strip()
    if not raw:
        return []
    parts = [p.strip() for p in re.split(r"[，,。！？!?；;]\s*", raw) if p.strip()]
    cleaned: List[str] = []
    for p in parts:
        # Trim common quote wrappers that may become standalone tokens after split.
        s = p.strip().strip('"\'“”‘’（）()《》<>「」『』')
        if not s:
            continue
        # Drop punctuation-only tokens (e.g. '”')
        if not re.sub(r"[\W_]+", "", s, flags=re.UNICODE):
            continue
        cleaned.append(s)
    return cleaned


def _subtitle_simplify(text: str) -> str:
    s = (text or "").strip()
    if not s:
        return ""
    # Remove quote-like wrappers and some noisy punctuation, keep basic sentence separators.
    s = s.replace("\n", " ")
    s = re.sub(r"[\"\'“”‘’《》<>「」『』]", "", s)
    s = re.sub(r"[（）()\[\]【】]", " ", s)
    # Replace long dashes / ellipsis-like with space
    s = re.sub(r"[—–…]+", " ", s)
    # Collapse repeated punctuation into a single separator
    s = re.sub(r"[，,]+", "，", s)
    # Keep '.' as '.', do not convert to Chinese period.
    s = re.sub(r"[。]+", "。", s)
    s = re.sub(r"[\.]+", ".", s)
    s = re.sub(r"[！!]+", "！", s)
    s = re.sub(r"[？?]+", "？", s)
    # Tighten spaces
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _repo_deepseek_api_key() -> str:
    """优先环境变量 DEEPSEEK_API_KEY；否则尝试从 web-tool 生成资讯脚本读取（与 build_news 同源）。"""
    k = (os.environ.get("DEEPSEEK_API_KEY") or "").strip()
    if k:
        return k
    try:
        news_py = Path(__file__).resolve().parents[1] / "web-tool" / "scripts" / "build_news.py"
        if news_py.is_file():
            raw = news_py.read_text(encoding="utf-8", errors="ignore")
            m = re.search(r"DEEPSEEK_API_KEY\s*=\s*[\"']([^\"']+)[\"']", raw)
            if m:
                return m.group(1).strip()
    except Exception:
        pass
    return ""


# 勿写入 CLIP 的中文占位（会被画进图）；DeepSeek 失败回退时尤其不能用
_CLIP_GENERIC_THEME_EN = (
    "cinematic realistic scene matching narration mood, no readable text on screen"
)

# 用户作品以古诗词为主：人物须为中国人；古诗意境下为古代中国人/汉服
_NEG_NON_CHINESE_CAST = (
    "caucasian, western european, african american, blonde hair, blue eyes, green eyes, "
    "western cowboy, modern business suit tie, jeans hoodie streetwear, european castle street, "
    "白人, 西方人长相, 金发碧眼, 西式建筑街景, 现代西装领带, 牛仔裤卫衣"
)


def _looks_like_classical_chinese_poetry(text: str) -> bool:
    """粗判全文是否为古诗词/文言风格（用于古代人物与场景）。"""
    s = re.sub(r"\s+", "", (text or "").strip())
    if len(s) < 4:
        return False
    if re.search(r"手机|电脑|汽车|微信|比特币|NBA|迪士尼|高铁|飞机|西装革履", s):
        return False
    han = len(re.findall(r"[\u4e00-\u9fff]", s))
    if han < max(4, len(s) // 2):
        return False
    score = 0
    if re.search(r"[之乎者也兮矣哉]", s):
        score += 2
    if re.search(r"[，。；]", s):
        score += 1
    if re.search(r"君|郎|妾|愁|赋|辞|朕|诸侯|大漠|长安|江南|明月|青山|白云|古道|西风", s):
        score += 1
    return score >= 1


def _chinese_cast_positive_fragment(classical_poetry: bool) -> str:
    frag = (
        "Chinese people only, East Asian ethnicity and facial features, Chinese cultural environment, "
    )
    if classical_poetry:
        frag += (
            "ancient China historical period, Han Chinese in traditional hanfu, "
            "Tang or Song dynasty clothing and hairstyles when people appear, "
            "classical Chinese architecture pavilion courtyard, no modern clothing or props, "
        )
    return frag

# 从正向提示中剔除的历史/错误占位（偶发 DeepSeek 失败 + 旧逻辑时会注入）
_CLIP_BANNED_CHINESE_FRAGMENTS = (
    "叙事意境与氛围",
    "叙事与意象场景",
    "口播全文意境",
)


def _segment_to_visual_hints_en(seg: str, group_idx: int) -> str:
    """按分镜句意生成英文画面关键词（不引用原句汉字）。"""
    s = (seg or "").strip()
    rules = [
        (r"垂纶|稚子|鱼|莓|苔|招手|借问|不应", "young Chinese child in ancient hanfu, Tang dynasty, fishing by mossy riverbank, hiding from passersby"),
        (r"雪|冰封|素裹|飞雪|银", "vast snowy plains and ice-covered landscape"),
        (r"长城|万里", "Great Wall winding over snowy hills"),
        (r"黄河|大河|河|江|川|滔滔", "great river valley, flowing water"),
        (r"山|峰|银蛇|蜡象", "rolling mountain ranges and ridges"),
        (r"日|红|阳|晴|霞|妖娆", "sunrise or sunset glow over landscape"),
        (r"天|空|欲与|比高", "dramatic wide sky over epic terrain"),
        (r"风|飘|莽莽", "windy open landscape with mist"),
        (r"英雄|风流|秦皇|汉武|唐宗|宋祖|成吉思汗|历史|惜", "epic historical atmosphere"),
        (r"园|春|沁", "classical Chinese literary mood, refined scenery"),
        (r"北国|风光", "northern China scenic panorama"),
    ]
    matched: List[str] = []
    for pat, desc in rules:
        if re.search(pat, s) and desc not in matched:
            matched.append(desc)
    if matched:
        return " ".join(matched[:3])
    variants = [
        "quiet riverside with greenery",
        "wide northern China winter panorama",
        "snowy mountains under dramatic clouds",
        "river valley at golden hour",
        "misty historical landscape",
    ]
    h = hash(s) & 0x7FFFFFFF
    return variants[(group_idx + h) % len(variants)]


def _build_rule_based_image_prompt_for_group(
    user_topic_supplied: bool,
    topic: str,
    group_segments: List[str],
    group_idx: int,
    classical_poetry: bool = False,
) -> str:
    visual = _segment_to_visual_hints_en(
        " ".join([(x or "").strip() for x in (group_segments or []) if (x or "").strip()]),
        group_idx,
    )
    cast = _chinese_cast_positive_fragment(classical_poetry)
    if user_topic_supplied:
        t = (topic or "").strip() or "主题"
        return (
            f"Scene for narration theme 「{t}」: {visual}. "
            f"{cast} "
            "Photorealistic, cinematic lighting, no text calligraphy subtitles or watermarks."
        )
    return (
        f"{_CLIP_GENERIC_THEME_EN}. {visual}. "
        f"{cast} "
        "Photorealistic, cinematic lighting, no text calligraphy subtitles or watermarks."
    )


# 文生图正向前缀：减轻「把提示里的汉字画出来」；负面词单独处理海报构图
_IMAGE_NO_TEXT_PREFIX = (
    "cinematic still, no readable text in image, no lettering, no calligraphy, no subtitles, no watermark, "
)

# 竖屏数据里常见「顶部标题/海报」布局，与口播叠字强相关，追加到负面提示
_NEG_PORTRAIT_LAYOUT_EXTRA = (
    "movie poster, vertical poster, title card, headline at top, cover design, opening credits, "
    "promotional banner, magazine cover, social media story with text, cinematic typography, "
    "竖版海报, 顶部大字标题, 片头字幕条, 对联条幅作主视觉, 封面标题区"
)


def _topic_for_clip(user_supplied: bool, resolved_topic: str, segments: List[str]) -> str:
    """未填主题时一律用英文占位，禁止「叙事意境与氛围」等中文进 CLIP。"""
    if user_supplied:
        return (resolved_topic or "").strip() or "主题"
    return _CLIP_GENERIC_THEME_EN


def _sanitize_clip_positive_prompt(prompt: str) -> str:
    out = (prompt or "").strip()
    for frag in _CLIP_BANNED_CHINESE_FRAGMENTS:
        out = out.replace(frag, " ")
    out = re.sub(r"【总主题】[^。]*。", " ", out)
    out = re.sub(r"主题：[^。；;]+", " ", out)
    out = re.sub(r"[ \t\u3000]+", " ", out)
    return out.strip()


def _topic_line_for_deepseek(user_supplied: bool, resolved_topic: str) -> str:
    """DeepSeek 【总主题】块：未填主题时不要写入自动推导的首句（否则模型易复述进画面提示）。"""
    if user_supplied:
        return (resolved_topic or "").strip() or "主题"
    return "口播全文意境（用户未单独填写主题；请以各组分镜 lines 为准，输出中不要复述 lines 原文）"


def _strip_verbatim_script_from_image_prompt(prompt: str, segments: Iterable[str]) -> str:
    """从正向提示中移除与口播完全一致的片段，避免 CLIP 把原句画进图里。"""
    out = prompt
    parts = sorted({(s or "").strip() for s in segments if (s or "").strip()}, key=len, reverse=True)
    for p in parts:
        if len(p) < 2:
            continue
        out = out.replace(p, " ")
    out = re.sub(r"[ \t\u3000]+", " ", out)
    out = re.sub(r"\s*([，。；：、])\s*", r"\1", out)
    return out.strip()


def _ensure_image_prompt_has_substance(prompt: str, topic: str) -> str:
    compact = re.sub(r"[\s\u3000，。、；：！？…《》【】\"'a-zA-Z0-9]+", "", prompt)
    if len(compact) >= 8:
        return prompt
    return (
        f"{prompt} {_CLIP_GENERIC_THEME_EN}, photorealistic scenic atmosphere, "
        "no readable text or calligraphy in frame."
    )


def _deepseek_batch_image_prompts(
    topic: str,
    groups: List[List[str]],
    classical_poetry: bool = False,
) -> Optional[List[str]]:
    """
    一次请求为所有分镜组生成文生图正向提示词；与总主题、各组口播强绑定。
    失败返回 None，由调用方回退规则拼接。
    """
    api_key = _repo_deepseek_api_key()
    if not api_key or not groups:
        return None

    n = len(groups)
    topic_s = (topic or "").strip() or "主题"
    payload_groups = []
    for i, segs in enumerate(groups):
        lines = [(s or "").strip() for s in (segs or []) if (s or "").strip()]
        payload_groups.append({"index": i, "lines": lines})

    cast_rule = (
        "古诗词/文言意境下人物须为中国古代人，穿汉服或唐宋风格服饰，配合古典中国建筑与环境，不要现代服装与道具。"
        if classical_poetry
        else "人物须为中国当代或传统华人形象，不要欧美面孔。"
    )

    user_prompt = f"""你是影视分镜与文生图提示词专家。用户在做「文字成片」：下面共有 {n} 个分镜组，按顺序各生成一张配图。

【总主题】
{topic_s}

【分镜组】（JSON，每项 index 对应第几张图；lines 为该组口播。多句时融为一场景；仅一句时画面只聚焦该句的可视化，仍须紧扣总主题）
{json.dumps(payload_groups, ensure_ascii=False)}

请严格输出一个 JSON 对象，仅包含字段 "prompts"：字符串数组，长度必须等于 {n}。
第 i 个元素（0 起始）是第 i 张图的中文正向提示词，要求：
1. 必须紧扣总主题「{topic_s}」，画面意象与主题强相关（可自然重复主题关键词）。
2. 概括该组全部口播的核心信息与情绪，写成「看得见」的具体场景：主体、环境、动作、光影、氛围、时代或地域感；避免空洞口号和纯抽象句。若该组仅一句口播，画面应主要表现这一句，不要加入与该句明显无关的元素。
3. 禁止在正向提示词中直接抄写、引用或复述上面 JSON 里 lines 的原句（尤其是诗句、对联、短标语）；仅用景物、人物动作、光线与氛围描述来传达同一含义。
4. 禁止要求生成画面内文字、字幕、标语、Logo、水印、二维码。
5. 画面应完整自然：避免出现扭曲的人脸或肢体、崩坏、穿模、重影、杂乱构图、明显画质瑕疵或类似报错/乱码的视觉效果。
6. 风格：写实、电影质感、摄影级细节；可少量英文质量词（如 cinematic lighting），不要整段只有英文标签堆砌。
7. 单条 80～220 字为宜（中文为主）。
8. 若画面中出现人物：必须是中国人/东亚面孔，禁止西方人、金发碧眼、现代西式街景与西装领带造型。{cast_rule}

只输出 JSON，不要 markdown 代码块。"""

    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    data = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "你是一个只输出合法 JSON 的助手。"},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.35,
        "response_format": {"type": "json_object"},
    }

    max_retries = 2
    for attempt in range(max_retries):
        try:
            resp = requests.post(DEEPSEEK_API_URL, headers=headers, json=data, timeout=120)
            if resp.status_code != 200:
                if resp.status_code >= 500 and attempt + 1 < max_retries:
                    time.sleep(3)
                    continue
                return None
            body = resp.json()
            content_str = (body.get("choices") or [{}])[0].get("message", {}).get("content") or ""
            content_str = content_str.replace("```json", "").replace("```", "").strip()
            obj = json.loads(content_str)
            prompts = obj.get("prompts")
            if not isinstance(prompts, list) or len(prompts) != n:
                return None
            out: List[str] = []
            for p in prompts:
                if not isinstance(p, str) or not p.strip():
                    return None
                s = p.strip()
                if len(s) > 400:
                    s = s[:397].rstrip() + "…"
                out.append(s)
            return out
        except json.JSONDecodeError:
            if attempt + 1 < max_retries:
                time.sleep(2)
                continue
            return None
        except Exception:
            if attempt + 1 < max_retries:
                time.sleep(2)
                continue
            return None
    return None


def _wav_duration_seconds(wav_path: Path) -> float:
    with wave.open(str(wav_path), "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        if not rate:
            return 0.0
        return frames / float(rate)


def _concat_wavs(in_paths: List[Path], out_path: Path) -> None:
    if not in_paths:
        raise ValueError("No wavs to concat")
    with wave.open(str(in_paths[0]), "rb") as wf0:
        params = wf0.getparams()
        frames0 = wf0.readframes(wf0.getnframes())

    with wave.open(str(out_path), "wb") as out:
        out.setparams(params)
        out.writeframes(frames0)
        for p in in_paths[1:]:
            with wave.open(str(p), "rb") as wf:
                wf_params = wf.getparams()
                # 注意：nframes 每段不同是正常的，不参与一致性校验
                if (wf_params.nchannels, wf_params.sampwidth, wf_params.framerate, wf_params.comptype, wf_params.compname) != (
                    params.nchannels,
                    params.sampwidth,
                    params.framerate,
                    params.comptype,
                    params.compname,
                ):
                    raise RuntimeError(f"WAV params mismatch when concatenating: {p}")
                out.writeframes(wf.readframes(wf.getnframes()))


def _now_ts_ms():
    return int(time.time() * 1000)


def _write_silence_wav(path: Path, duration_ms: int = 220, sr: int = 24000):
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = max(1, int(sr * (duration_ms / 1000.0)))
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(b"\x00\x00" * frames)


def _build_z_image_turbo_workflow(
    prompt_text: str,
    seed: Optional[int] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    negative_text: Optional[str] = None,
):
    workflow_path = os.path.join(os.path.dirname(__file__), WORKFLOW_FOLDER, 'z_image_turbo.json')
    if not os.path.exists(workflow_path):
        raise FileNotFoundError(f"Workflow file not found: {workflow_path}")

    with open(workflow_path, 'r', encoding='utf-8') as f:
        workflow = json.load(f)

    if "6" in workflow and workflow["6"].get("class_type") == "CLIPTextEncode":
        workflow["6"]["inputs"]["text"] = prompt_text
    else:
        found = False
        for node_id, node in workflow.items():
            if node.get("class_type") == "CLIPTextEncode" and isinstance(node.get("inputs"), dict) and "text" in node["inputs"]:
                node["inputs"]["text"] = prompt_text
                found = True
                break
        if not found:
            raise ValueError("CLIPTextEncode node not found in z_image_turbo workflow")

    # Negative prompt injection (avoid text/watermark/logo etc.)
    if negative_text is not None:
        ne = negative_text
        try:
            if width is not None and height is not None and int(height) > int(width):
                ne = f"{ne}, {_NEG_PORTRAIT_LAYOUT_EXTRA}"
        except Exception:
            pass
        try:
            if "7" in workflow and workflow["7"].get("class_type") == "CLIPTextEncode" and isinstance(workflow["7"].get("inputs"), dict) and "text" in workflow["7"]["inputs"]:
                workflow["7"]["inputs"]["text"] = ne
            else:
                for node_id, node in workflow.items():
                    if node.get("class_type") == "CLIPTextEncode" and isinstance(node.get("inputs"), dict) and "text" in node["inputs"]:
                        # Heuristic: if template negative prompt contains common bad words
                        if isinstance(node["inputs"].get("text"), str) and "bad" in node["inputs"]["text"].lower():
                            node["inputs"]["text"] = ne
                            break
        except Exception:
            pass

    # Output size
    if width is not None and height is not None:
        try:
            if "13" in workflow and isinstance(workflow["13"].get("inputs"), dict):
                if "width" in workflow["13"]["inputs"]:
                    workflow["13"]["inputs"]["width"] = int(width)
                if "height" in workflow["13"]["inputs"]:
                    workflow["13"]["inputs"]["height"] = int(height)
        except Exception:
            pass

    if seed is not None:
        if "3" in workflow and workflow["3"].get("class_type") == "KSampler":
            workflow["3"]["inputs"]["seed"] = int(seed)
        else:
            for node_id, node in workflow.items():
                if node.get("class_type") == "KSampler" and isinstance(node.get("inputs"), dict) and "seed" in node["inputs"]:
                    node["inputs"]["seed"] = int(seed)
                    break

    return workflow


def _build_z_image_img2img_workflow(
    prompt_text: str,
    comfy_image_filename: str,
    negative_text: Optional[str] = None,
    seed: Optional[int] = None,
    denoise: Optional[float] = None,
):
    workflow_path = os.path.join(os.path.dirname(__file__), WORKFLOW_FOLDER, "z_image_turbo_img2img.json")
    if not os.path.exists(workflow_path):
        raise FileNotFoundError(f"Workflow file not found: {workflow_path}")

    with open(workflow_path, "r", encoding="utf-8") as f:
        workflow = json.load(f)

    if "6" in workflow and workflow["6"].get("class_type") == "CLIPTextEncode":
        workflow["6"]["inputs"]["text"] = prompt_text
    else:
        raise ValueError("CLIPTextEncode positive node missing in img2img workflow")

    if negative_text is not None:
        try:
            if "7" in workflow and workflow["7"].get("class_type") == "CLIPTextEncode":
                workflow["7"]["inputs"]["text"] = negative_text
        except Exception:
            pass

    if "19" in workflow and workflow["19"].get("class_type") == "LoadImage":
        workflow["19"]["inputs"]["image"] = comfy_image_filename
    else:
        raise ValueError("LoadImage node missing in img2img workflow")

    if seed is not None:
        if "3" in workflow and workflow["3"].get("class_type") == "KSampler":
            workflow["3"]["inputs"]["seed"] = int(seed)

    if denoise is not None:
        try:
            d = float(denoise)
            d = max(0.05, min(1.0, d))
            if "3" in workflow and workflow["3"].get("class_type") == "KSampler":
                workflow["3"]["inputs"]["denoise"] = d
        except Exception:
            pass

    return workflow


def _patch_qwen_edit_workflow(workflow: dict) -> dict:
    """补全新版 ComfyUI 必填项；去掉仅 UI 用、API 易报错的节点。"""
    for drop_id in ("74", "80"):
        workflow.pop(drop_id, None)
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        if node.get("class_type") == "ImageScaleToTotalPixels":
            inputs = node.setdefault("inputs", {})
            if "resolution_steps" not in inputs:
                inputs["resolution_steps"] = 1
    return workflow


def build_qwen_image_edit_img2img_workflow(
    prompt_text: str,
    input_filename: str,
    seed: Optional[int] = None,
    quality: str = "standard",
):
    """指令改图：基于已验证的老照片修复工作流，去掉对比/拼接节点，写入用户 prompt。"""
    photo_paths = [
        os.path.join(os.path.dirname(__file__), WORKFLOW_FOLDER, "qwen_image_edit_img2img.json"),
    ]
    wf_dir = os.path.join(os.path.dirname(__file__), WORKFLOW_FOLDER)
    if os.path.isdir(wf_dir):
        for f in os.listdir(wf_dir):
            if ("老照片修复" in f or "Qwen-Image-Edit" in f) and f.endswith(".json"):
                photo_paths.insert(0, os.path.join(wf_dir, f))

    workflow = None
    for path in photo_paths:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as fp:
                workflow = json.load(fp)
            break
    if workflow is None:
        raise FileNotFoundError("Qwen Image Edit workflow not found (qwen_image_edit_img2img.json or 老照片修复)")

    workflow = _patch_qwen_edit_workflow(workflow)

    if "1" in workflow and workflow["1"].get("class_type") == "CheckpointLoaderSimple":
        preferred = workflow["1"]["inputs"].get("ckpt_name", "")
        workflow["1"]["inputs"]["ckpt_name"] = _resolve_qwen_checkpoint(preferred)

    if "7" in workflow and workflow["7"].get("class_type") == "LoadImage":
        workflow["7"]["inputs"]["image"] = input_filename
        workflow["7"]["inputs"]["upload"] = "image"
    else:
        raise ValueError("LoadImage node missing in qwen img2img workflow")

    if "81" in workflow and workflow["81"].get("class_type") == "TextEncodeQwenImageEdit":
        workflow["81"]["inputs"]["prompt"] = (prompt_text or "").strip()
    else:
        raise ValueError("TextEncodeQwenImageEdit node missing in qwen img2img workflow")

    if seed is not None and "2" in workflow and workflow["2"].get("class_type") == "KSampler":
        workflow["2"]["inputs"]["seed"] = int(seed)

    workflow = _apply_qwen_img2img_quality(workflow, quality)
    return workflow


_checkpoint_names_cache: Optional[list] = None


def _fetch_checkpoint_names() -> list:
    global _checkpoint_names_cache
    if _checkpoint_names_cache is not None:
        return _checkpoint_names_cache
    try:
        r = requests.get(
            "http://{}/object_info/CheckpointLoaderSimple".format(COMFYUI_SERVER_ADDRESS),
            timeout=8,
        )
        r.raise_for_status()
        info = r.json().get("CheckpointLoaderSimple", {})
        names = info.get("input", {}).get("required", {}).get("ckpt_name", [[]])[0]
        _checkpoint_names_cache = list(names) if isinstance(names, list) else []
    except Exception as e:
        print(f"WARN: fetch checkpoint list failed: {e}")
        _checkpoint_names_cache = []
    return _checkpoint_names_cache


def _resolve_qwen_checkpoint(preferred: str) -> str:
    names = _fetch_checkpoint_names()
    if not names:
        return preferred
    if preferred in names:
        return preferred
    pref_norm = (preferred or "").replace("\\", "/").lower()
    for n in names:
        if n.replace("\\", "/").lower() == pref_norm:
            return n
    for n in names:
        low = n.lower()
        if "qwen-rapid" in low or ("qwen" in low and "aio" in low):
            print(f"INFO: qwen checkpoint fallback {preferred!r} -> {n!r}")
            return n
    return preferred


def _format_comfyui_prompt_error(response) -> str:
    try:
        body = response.json()
    except Exception:
        return (response.text or "")[:800] or "HTTP {}".format(response.status_code)
    parts = []
    err = body.get("error")
    if err:
        if isinstance(err, dict):
            parts.append(str(err.get("message") or err))
        else:
            parts.append(str(err))
    for nid, info in (body.get("node_errors") or {}).items():
        if not isinstance(info, dict):
            continue
        for item in info.get("errors") or []:
            if isinstance(item, dict):
                msg = item.get("message") or item.get("details") or str(item)
                parts.append("节点 {}: {}".format(nid, msg))
            else:
                parts.append("节点 {}: {}".format(nid, item))
    if parts:
        return "; ".join(parts)
    return (response.text or "")[:800] or "HTTP {}".format(response.status_code)


def _normalize_img2img_engine(raw: str) -> str:
    v = (raw or "qwen").strip().lower()
    if v in ("z", "z_image", "z-image", "turbo", "z_image_turbo"):
        return "z_image"
    return "qwen"


_QWEN_IMG2IMG_QUALITY = {
    "standard": {"steps": 4, "megapixels": 1.0},
    "high": {"steps": 8, "megapixels": 1.5},
}


def _normalize_img2img_quality(raw: str) -> str:
    v = (raw or "standard").strip().lower()
    if v in ("high", "hq", "quality", "1", "2", "better"):
        return "high"
    return "standard"


def _apply_qwen_img2img_quality(workflow: dict, quality: str) -> dict:
    q = _QWEN_IMG2IMG_QUALITY.get(_normalize_img2img_quality(quality), _QWEN_IMG2IMG_QUALITY["standard"])
    if "2" in workflow and workflow["2"].get("class_type") == "KSampler":
        workflow["2"]["inputs"]["steps"] = int(q["steps"])
    for node in workflow.values():
        if isinstance(node, dict) and node.get("class_type") == "ImageScaleToTotalPixels":
            node.setdefault("inputs", {})["megapixels"] = float(q["megapixels"])
    return workflow


# 文生图 / 图生图：统一默认负面（用户可不填）；竖屏时追加抗「海报标题」类构图
_DEFAULT_TXT2IMG_NEGATIVE_CORE = (
    "blurry ugly bad worst low quality jpeg artifacts noise distorted glitch broken messy "
    "deformed disfigured duplicate limbs fused fingers bad anatomy wrong hands wrong face wrong eyes "
    "text watermark logo subtitle captions words letters typography signature UI QR code barcode "
    "calligraphy poetry scroll meme chart diagram error screenshot moire banding oversaturated "
    "out of focus cropped head cut off disconnected limbs duplicate objects "
    "文字 水印 字幕 标语 logo 畸形 崩坏 穿模 重影 书法 题字 多余肢体 比例失调 杂乱背景"
)


def _default_txt2img_negative(
    user_extra: str = "",
    width: Optional[int] = None,
    height: Optional[int] = None,
) -> str:
    parts = [_DEFAULT_TXT2IMG_NEGATIVE_CORE, _NEG_NON_CHINESE_CAST]
    try:
        if width is not None and height is not None and int(height) > int(width):
            parts.append(_NEG_PORTRAIT_LAYOUT_EXTRA)
    except Exception:
        pass
    u = (user_extra or "").strip()
    if u:
        parts.append(u)
    return ", ".join(parts)


def _enhance_txt2img_positive(user_prompt: str) -> str:
    """文生图：轻量包装正向提示，提高清晰度与贴合度。"""
    core = (user_prompt or "").strip()
    if not core:
        return core
    classical = _looks_like_classical_chinese_poetry(core)
    cast = _chinese_cast_positive_fragment(classical)
    return (
        "cinematic high-resolution shot, sharp focus, coherent composition, faithful to subject, "
        f"{cast} "
        f"{core} "
        "consistent lighting and colors, physically plausible scene, no extra random objects, "
        "no readable text or watermarks."
    )


# 图生图全图重采样时易随机加头盔/换装；用提示约束 + 负面抑制（非真正局部编辑，见页面说明）
_IMG2IMG_NEG_PRESERVE_EXTRA = (
    "random helmet, hat, cap, glasses, jewelry, armor, new costume, outfit swap, clothing change, "
    "identity drift, different person, background replacement, new props not in original scene"
)


def _enhance_img2img_positive(user_prompt: str) -> str:
    """图生图：强调「同一场景、只改描述处」，避免再套文生图那套「电影大片」引导导致全图重画。"""
    core = (user_prompt or "").strip()
    if not core:
        return core
    classical = _looks_like_classical_chinese_poetry(core)
    cast = _chinese_cast_positive_fragment(classical)
    return (
        "photo edit of the same image, same camera angle and lighting; "
        "preserve all regions not mentioned in the instruction—same people, poses, faces, clothes, and background; "
        f"{cast} "
        f"apply only this edit: {core}. "
        "Do not add helmets, hats, armor, or accessories unless explicitly requested in the edit. "
        "No unrelated object changes."
    )


def _clamp_image_side(n: int, lo: int = 256, hi: int = 2048) -> int:
    try:
        v = int(n)
    except Exception:
        v = 1024
    return max(lo, min(hi, v))


def _parse_seed_optional(seed_raw: str) -> Optional[int]:
    s = (seed_raw or "").strip()
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


async def _run_comfyui_and_get_last_image(workflow: dict, timeout_sec: Optional[float] = None):
    async with _COMFYUI_JOB_SEM:
        return await _run_comfyui_and_get_last_image_impl(workflow, timeout_sec)


async def _run_comfyui_and_get_last_image_impl(workflow: dict, timeout_sec: Optional[float] = None):
    if timeout_sec is None:
        timeout_sec = float(os.environ.get("COMFYUI_JOB_TIMEOUT", "600"))
    deadline = time.monotonic() + timeout_sec
    ws = websocket.WebSocket()
    prompt_id = None
    try:
        await asyncio.to_thread(ws.connect, "ws://{}/ws?clientId={}".format(COMFYUI_SERVER_ADDRESS, CLIENT_ID), timeout=10)
        prompt_response = await queue_prompt(workflow)
        prompt_id = prompt_response['prompt_id']

        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise RuntimeError(f"ComfyUI job timed out after {int(timeout_sec)}s")
            ws.settimeout(min(30.0, max(1.0, remaining)))
            try:
                out = await asyncio.to_thread(ws.recv)
            except websocket.WebSocketTimeoutException:
                continue
            if isinstance(out, str):
                message = json.loads(out)
                if message.get('type') == 'executing':
                    data = message.get('data', {})
                    if data.get('node') is None and str(data.get('prompt_id')) == str(prompt_id):
                        break
            else:
                continue

        history = (await get_history(prompt_id)).get(prompt_id)
        if not history:
            raise RuntimeError("ComfyUI history missing")
        outputs = history.get('outputs', {})

        output_images = []
        for node_id in outputs:
            node_output = outputs[node_id]
            if 'images' in node_output:
                for image in node_output['images']:
                    image_data = await get_image(image['filename'], image.get('subfolder', ''), image.get('type'))
                    output_images.append(image_data)

        if not output_images:
            raise RuntimeError("No output images generated")
        return output_images[-1]
    finally:
        try:
            await asyncio.to_thread(ws.close)
        except Exception:
            pass


async def _indextts_synthesize(text: str, out_path: Path, voice: Optional[str] = None, speed: Optional[float] = None):
    if not HAS_EDGE_TTS:
        raise RuntimeError("edge-tts library not installed. Run: pip install edge-tts")

    clean_text = (text or "").strip()

    # Avoid calling TTS on empty / punctuation-only input: output a short silence wav instead.
    if not re.sub(r"[\W_]+", "", clean_text, flags=re.UNICODE):
        _write_silence_wav(out_path)
        return str(out_path)
    
    voice_val = (voice or os.environ.get("INDEXTTS_VOICE") or "zh-CN-XiaoxiaoNeural").strip()
    speed_val = speed if speed is not None else float(os.environ.get("INDEXTTS_SPEED", "1.0"))
    
    rate_str = f"{int((speed_val - 1.0) * 100):+d}%"  # Always include sign, e.g., '+0%', '-50%'
    
    actual_path = out_path

    async def _synthesize_with_kwargs(kwargs: dict, target_path: Path):
        communicate = edge_tts.Communicate(
            text=clean_text,
            voice=voice_val,
            rate=rate_str,
            **kwargs,
        )
        audio_bytes = 0
        with open(target_path, "wb") as f:
            async for chunk in communicate.stream():
                if chunk.get("type") == "audio":
                    data = chunk.get("data") or b""
                    if data:
                        f.write(data)
                        audio_bytes += len(data)

        # Some edge-tts failures return a stream without audio.
        if audio_bytes <= 0:
            raise RuntimeError("No audio was received. Please verify that your parameters are correct.")
    
    last_err = None
    for attempt in range(3):
        try:
            # 新版 edge-tts 支持 output_format，可直接输出 WAV(RIFF)
            await _synthesize_with_kwargs({"output_format": "riff-24khz-16bit-mono-pcm"}, out_path)
            last_err = None
            break
        except Exception as e:
            # 兼容旧版 edge-tts：Communicate.__init__ 不支持 output_format
            if "unexpected keyword argument" in str(e) and "output_format" in str(e):
                actual_path = out_path.with_suffix(".mp3")
                try:
                    await _synthesize_with_kwargs({}, actual_path)
                    last_err = None
                    break
                except Exception as e2:
                    last_err = e2
            else:
                last_err = e

            # Retry (network / transient service issues)
            if attempt < 2:
                await asyncio.sleep(0.8 * (attempt + 1))
            else:
                break

    if last_err is not None:
        msg = str(last_err)
        lower = msg.lower()
        if ("getaddrinfo failed" in lower) or ("cannot connect to host" in lower) or ("name or service not known" in lower) or ("temporary failure in name resolution" in lower) or ("connection" in lower and "failed" in lower):
            raise RuntimeError(f"Edge-TTS 网络/DNS 连接失败：{msg}")
        raise RuntimeError(f"Edge-TTS synthesis failed: {msg}")
    
    if not actual_path.exists():
        raise RuntimeError(f"Edge-TTS did not produce output file at {actual_path}")

    try:
        if actual_path.stat().st_size <= 0:
            raise RuntimeError("Edge-TTS produced empty audio file")
    except Exception as e:
        raise RuntimeError(f"Edge-TTS 音频文件校验失败：{str(e)}")

    # 如果生成的是 wav，则校验 RIFF 头；mp3 等格式不做该校验
    if actual_path.suffix.lower() == ".wav":
        try:
            with open(actual_path, "rb") as f:
                head = f.read(4)
            if head != b"RIFF":
                raise RuntimeError("WAV 头不正确")
        except Exception as e:
            raise RuntimeError(f"Edge-TTS 音频文件校验失败：{str(e)}")

    return str(actual_path)


def _audio_duration_seconds(path: Path) -> float:
    try:
        with wave.open(str(path), "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            if not rate:
                return 0.0
            return frames / float(rate)
    except Exception:
        clip = AudioFileClip(str(path))
        try:
            return float(clip.duration or 0.0)
        finally:
            try:
                clip.close()
            except Exception:
                pass


def _concat_audio_to_wav(in_paths: List[Path], out_wav: Path) -> None:
    if not in_paths:
        raise ValueError("No audio files to concat")
    clips = [AudioFileClip(str(p)) for p in in_paths]
    try:
        final = concatenate_audioclips(clips)
        # 输出统一为 WAV(PCM)，便于后续 MoviePy/ffmpeg 合成视频
        final.write_audiofile(
            str(out_wav),
            fps=24000,
            nbytes=2,
            codec="pcm_s16le",
            ffmpeg_params=["-ac", "1"],
            logger=None,
        )
    finally:
        for c in clips:
            try:
                c.close()
            except Exception:
                pass


def _safe_task_dir(task_id: str) -> Path:
    task = _TEXT_TO_VIDEO_TASKS.get(task_id) if "_TEXT_TO_VIDEO_TASKS" in globals() else None
    folder = None
    if isinstance(task, dict):
        folder = (task.get("output_dir") or "").strip() or None
    # 直接保存到 output 目录下，去掉 files 和 text-to-video 中间目录
    d = _OUTPUT_ROOT / (folder or task_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _alloc_text_to_video_output_dir() -> str:
    # Example: 2026-01-13_15-23
    base = datetime.now().strftime("%Y-%m-%d_%H-%M")
    # 直接保存到 output 目录下，去掉 files 和 text-to-video 中间目录
    root = _OUTPUT_ROOT
    root.mkdir(parents=True, exist_ok=True)

    candidate = base
    if not (root / candidate).exists():
        return candidate

    # Collision handling within the same minute
    for i in range(1, 1000):
        candidate = f"{base}_{i:02d}"
        if not (root / candidate).exists():
            return candidate
    # Extremely unlikely fallback
    return f"{base}_{uuid.uuid4().hex[:6]}"


def _load_font(font_size: int) -> ImageFont.FreeTypeFont:
    font_candidates = [
        os.path.join(os.environ.get("WINDIR", ""), "Fonts", "msyh.ttc"),
        os.path.join(os.environ.get("WINDIR", ""), "Fonts", "simhei.ttf"),
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    ]
    for path in font_candidates:
        if path and os.path.exists(path):
            try:
                return ImageFont.truetype(path, font_size)
            except Exception:
                continue
    return ImageFont.load_default()


def _fit_subtitle_text(text: str, width: int, font_size: int) -> str:
    max_chars_per_line = max(8, int(width * 0.86 // max(font_size * 0.62, 1)))
    raw = (text or "").replace("\n", " ").strip()
    if not raw:
        return ""

    lines: List[str] = []
    buf = ""
    for ch in raw:
        buf += ch
        if len(buf) >= max_chars_per_line:
            lines.append(buf)
            buf = ""
        if len(lines) >= 2:
            break
    if len(lines) < 2 and buf:
        lines.append(buf)

    if len(raw) > max_chars_per_line * 2:
        lines = lines[:2]
        lines[1] = (lines[1][:-1] + "…") if lines[1] else "…"

    return "\n".join([ln.strip() for ln in lines if ln.strip()])


def _wrap_text_by_measure(draw: ImageDraw.ImageDraw, font: ImageFont.ImageFont, text: str, max_width: int, max_lines: int = 2) -> str:
    raw = (text or "").replace("\n", " ").strip()
    if not raw:
        return ""

    lines: List[str] = []
    cur = ""
    for ch in raw:
        test = cur + ch
        try:
            l, t, r, b = draw.textbbox((0, 0), test, font=font)
            w = r - l
        except Exception:
            w, _ = draw.textsize(test, font=font)

        if cur and w > max_width:
            lines.append(cur)
            cur = ch
            if len(lines) >= max_lines:
                break
        else:
            cur = test

    if len(lines) < max_lines and cur:
        lines.append(cur)

    if len(lines) >= max_lines:
        consumed = "".join(lines)
        if len(consumed) < len(raw):
            lines[-1] = (lines[-1][:-1] + "…") if lines[-1] else "…"

    return "\n".join([ln.strip() for ln in lines if ln.strip()])


def _render_subtitle_image(text: str, width: int, height: int) -> Optional[np.ndarray]:
    text = (text or "").strip()
    if not text:
        return None

    box_height = max(80, height // 7)
    overlay = Image.new("RGBA", (width, box_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    max_text_width = int(width * 0.90)

    # 字号按画面“宽度”做基准：竖屏更窄 -> 字更小；横屏更宽 -> 字更大
    # 再结合 box_height 做上限，避免撑爆字幕区域
    base_by_width = int(width * 0.045)  # 1080->48, 1920->86
    font_size = max(24, min(base_by_width, int(box_height * 0.62)))
    min_font_size = 18
    max_font_size = int(box_height * 0.70)
    if font_size > max_font_size:
        font_size = max_font_size
    font = _load_font(font_size)

    wrapped_text = _wrap_text_by_measure(draw, font, text, max_text_width, max_lines=2)
    if not wrapped_text:
        return None

    while True:
        try:
            text_bbox = draw.multiline_textbbox((0, 0), wrapped_text, font=font, spacing=4, stroke_width=3)
            text_width = text_bbox[2] - text_bbox[0]
            text_height = text_bbox[3] - text_bbox[1]
        except Exception:
            text_width, text_height = draw.multiline_textsize(wrapped_text, font=font, spacing=4)

        if (text_width <= max_text_width and text_height <= int(box_height * 0.92)) or font_size <= min_font_size:
            break
        font_size = max(min_font_size, font_size - 2)
        font = _load_font(font_size)
        wrapped_text = _wrap_text_by_measure(draw, font, text, max_text_width, max_lines=2)
        if not wrapped_text:
            return None

    text_x = max(10, (width - text_width) // 2)
    text_y = max(0, (box_height - text_height) // 2)

    shadow_offset = 2
    # Center-align multi-line subtitle text
    try:
        cx = width // 2
        draw.multiline_text(
            (cx + shadow_offset, text_y + shadow_offset),
            wrapped_text,
            font=font,
            fill=(0, 0, 0, 160),
            spacing=4,
            stroke_width=0,
            align="center",
            anchor="ma",
        )
        draw.multiline_text(
            (cx, text_y),
            wrapped_text,
            font=font,
            fill=(255, 255, 255, 255),
            spacing=4,
            stroke_width=3,
            stroke_fill=(0, 0, 0, 200),
            align="center",
            anchor="ma",
        )
    except Exception:
        # Fallback for older Pillow versions
        draw.multiline_text(
            (text_x + shadow_offset, text_y + shadow_offset),
            wrapped_text,
            font=font,
            fill=(0, 0, 0, 160),
            spacing=4,
            stroke_width=0,
            align="center",
        )
        draw.multiline_text(
            (text_x, text_y),
            wrapped_text,
            font=font,
            fill=(255, 255, 255, 255),
            spacing=4,
            stroke_width=3,
            stroke_fill=(0, 0, 0, 200),
            align="center",
        )

    return np.array(overlay)


def _create_subtitle_overlays_timed(timeline: List[Tuple[str, float, float]], width: int, height: int) -> List[ImageClip]:
    if not timeline:
        return []

    box_height = max(80, height // 7)
    margin_bottom = max(30, height // 20)
    extra_up = 84 if height > width else 0
    y_pos = max(0, height - box_height - margin_bottom - extra_up)

    clips: List[ImageClip] = []
    for text, start, dur in timeline:
        if not text or dur <= 0:
            continue
        img = _render_subtitle_image(text, width, height)
        if img is None:
            continue
        clip = ImageClip(img).set_start(float(start)).set_duration(float(dur))
        clip = clip.set_position(("center", y_pos))
        clips.append(clip)

    return clips


def _compose_video_sync(image_paths: List[Path], audio_paths: List[Path], out_video: Path, fps: int = 25, subtitles: Optional[List[str]] = None, output_size: Optional[Tuple[int, int]] = None):
    if not image_paths:
        raise ValueError("No images to compose")
    
    import random

    def _make_ken_burns_clip(path: Path, duration: float, target_w: int, target_h: int) -> ImageClip:
        base = ImageClip(str(path))
        iw, ih = base.w, base.h
        if iw <= 0 or ih <= 0:
            return base.resize((target_w, target_h)).set_duration(duration)

        scale_cover = max(target_w / iw, target_h / ih)
        base = base.resize(scale_cover)

        bw, bh = base.w, base.h
        cx = bw / 2
        cy = bh / 2

        extra_zoom = random.uniform(1.08, 1.22)
        # Use start/end shifts so there is visible pan, not just zoom.
        shift_x0 = random.uniform(-0.12, 0.12)
        shift_y0 = random.uniform(-0.12, 0.12)
        shift_x1 = random.uniform(-0.12, 0.12)
        shift_y1 = random.uniform(-0.12, 0.12)

        def _crop_at(t: float):
            if duration <= 0:
                k = 0.0
            else:
                k = max(0.0, min(1.0, t / duration))

            z = 1.0 + (extra_zoom - 1.0) * k
            cw = target_w / z
            ch = target_h / z

            max_dx = max(0.0, (bw - cw) / 2)
            max_dy = max(0.0, (bh - ch) / 2)
            sx = shift_x0 + (shift_x1 - shift_x0) * k
            sy = shift_y0 + (shift_y1 - shift_y0) * k
            dx = sx * 2 * max_dx
            dy = sy * 2 * max_dy

            x1 = (cx - cw / 2) + dx
            y1 = (cy - ch / 2) + dy
            x1 = max(0.0, min(bw - cw, x1))
            y1 = max(0.0, min(bh - ch, y1))

            return base.crop(x1=x1, y1=y1, width=cw, height=ch).resize((target_w, target_h))

        return _crop_at(0).fl(lambda gf, t: _crop_at(t).get_frame(0)).set_duration(duration)
    
    clips = []
    for idx, (img_path, audio_path) in enumerate(zip(image_paths, audio_paths)):
        audio_clip = AudioFileClip(str(audio_path))
        duration = audio_clip.duration
        
        if output_size:
            target_w, target_h = int(output_size[0]), int(output_size[1])
        else:
            tmp = ImageClip(str(img_path))
            target_w, target_h = tmp.w, tmp.h
            tmp.close()

        img_clip = _make_ken_burns_clip(img_path, duration, target_w, target_h)
        
        # Set duration and audio
        img_clip = img_clip.set_duration(duration)
        img_clip = img_clip.set_audio(audio_clip)
        
        timeline = None
        if subtitles and idx < len(subtitles):
            timeline = subtitles[idx]
        if isinstance(timeline, list):
            subtitle_clips = _create_subtitle_overlays_timed(timeline, img_clip.w, img_clip.h)
            if subtitle_clips:
                img_clip = CompositeVideoClip([img_clip] + subtitle_clips)
        
        clips.append(img_clip)
    
    final_clip = concatenate_videoclips(clips, method="compose")
    final_clip.write_videofile(str(out_video), fps=fps, codec='libx264', audio_codec='aac')


async def _run_text_to_video_task(task_id: str, text: str, seed: Optional[int], voice: Optional[str], speed: Optional[float], fps: int):
    task = _TEXT_TO_VIDEO_TASKS.get(task_id)
    if not task:
        return

    try:
        def _log(msg: str):
            try:
                logs = task.get("logs")
                if not isinstance(logs, list):
                    logs = []
                    task["logs"] = logs
                logs.append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")
            except Exception:
                # Never fail task due to logging
                pass

        def _to_bool(v, default: bool = False) -> bool:
            if v is None:
                return default
            if isinstance(v, bool):
                return v
            s = str(v).strip().lower()
            return s in ("1", "true", "yes", "y", "on")

        images_only = _to_bool(task.get("images_only"), False)
        gen_video_16_9 = _to_bool(task.get("gen_video_16_9"), False)
        gen_video_9_16 = _to_bool(task.get("gen_video_9_16"), True)
        subtitle_simplify = _to_bool(task.get("subtitle_simplify_punct"), False)

        topic = (task.get("topic") or "").strip()

        try:
            scene_min_len = int(task.get("scene_min_len") or 12)
        except Exception:
            scene_min_len = 12
        try:
            scene_max_len = int(task.get("scene_max_len") or 45)
        except Exception:
            scene_max_len = 45
        scene_min_len = max(4, min(200, scene_min_len))
        scene_max_len = max(scene_min_len + 4, min(400, scene_max_len))

        image_width = 1080
        image_height = 1440
        if images_only:
            preset = (task.get("aspect_preset") or "xhs_34").strip()
            wh = _TEXT_TO_IMAGES_ASPECT_PRESETS.get(preset) or _TEXT_TO_IMAGES_ASPECT_PRESETS["xhs_34"]
            image_width, image_height = wh
            need_landscape = False
            need_portrait = False
            _log(f"文字配图模式：{preset}（{image_width}×{image_height}），仅生成图片")
        else:
            if not (gen_video_16_9 or gen_video_9_16):
                raise RuntimeError("请至少选择一种导出视频（横屏 16:9 或竖屏 9:16）")
            need_landscape = bool(gen_video_16_9)
            need_portrait = bool(gen_video_9_16)

        segments = _split_text_to_segments(text, scene_min_len=scene_min_len, scene_max_len=scene_max_len)
        if not segments:
            raise RuntimeError("Text is empty")

        user_topic_supplied = bool((task.get("topic") or "").strip())
        topic_clip = _topic_for_clip(user_topic_supplied, topic, segments)
        topic_llm = _topic_line_for_deepseek(user_topic_supplied, topic)
        classical_mode = _looks_like_classical_chinese_poetry(text)
        cast_suffix = _chinese_cast_positive_fragment(classical_mode)
        if classical_mode:
            _log("检测到古诗词/文言风格，配图人物将倾向中国古代汉服形象")

        images_per_group = 1
        _log(f"开始任务：分镜数 {len(segments)}；配图：句号/叹号/问号/逗号各切一句一张图")

        task_dir = _safe_task_dir(task_id)
        images_dir = task_dir / "images"
        audio_dir = task_dir / "audio"
        images_dir.mkdir(parents=True, exist_ok=True)
        audio_dir.mkdir(parents=True, exist_ok=True)

        image_paths_16_9: List[Path] = []
        image_paths_9_16: List[Path] = []
        audio_paths = []
        subtitles_timeline: List[List[Tuple[str, float, float]]] = []

        neg_base = (
            "blurry ugly bad worst low quality jpeg artifacts noise distorted glitch broken messy "
            "deformed disfigured duplicate limbs fused fingers bad anatomy error screenshot "
            "moire banding oversaturated"
        )
        neg_extra = (
            "text, watermark, logo, subtitle, captions, words, letters, typography, signature, UI, "
            "calligraphy, poetry scroll, opening titles, Chinese calligraphy, "
            "QR code, barcode, speech bubble, meme, newspaper, chart, diagram, "
            "文字, 水印, 标志, logo, 字幕, 标语, 问答, 报错, 错误提示, 乱码, 畸形, 崩坏, 穿模, 重影, 书法, 题字, 诗句, "
            + _NEG_NON_CHINESE_CAST
        )
        neg_prompt = (neg_base + ", " + neg_extra).strip(", ")

        num_image_groups = (len(segments) + images_per_group - 1) // images_per_group  # 向上取整
        if images_only:
            img_variants = 1
        else:
            img_variants = int(need_landscape) + int(need_portrait)
        img_total = max(1, num_image_groups * max(1, img_variants))
        img_done = 0

        all_groups: List[List[str]] = []
        for group_idx in range(num_image_groups):
            start_idx = group_idx * images_per_group
            end_idx = min(start_idx + images_per_group, len(segments))
            all_groups.append(segments[start_idx:end_idx])

        llm_prompts: Optional[List[str]] = None
        deepseek_key = _repo_deepseek_api_key()
        task["deepseek_prompt_status"] = "pending"
        task["deepseek_prompt_message"] = ""
        deepseek_call_error: Optional[str] = None
        if deepseek_key and num_image_groups > 0:
            task["stage"] = "prompt_llm"
            task["progress"] = {"current": 0, "total": max(1, img_total)}
            _log("正在用 DeepSeek 将各组分镜口播写成画面提示词…")
            try:
                llm_prompts = await asyncio.to_thread(
                    _deepseek_batch_image_prompts, topic_llm, all_groups, classical_mode
                )
            except Exception as e:
                llm_prompts = None
                deepseek_call_error = str(e)
                _log(f"DeepSeek 调用异常，改用规则拼接提示词：{deepseek_call_error}")
            if llm_prompts and len(llm_prompts) == num_image_groups:
                task["deepseek_prompt_status"] = "ok"
                task["deepseek_prompt_message"] = ""
                _log(f"DeepSeek 已为 {len(llm_prompts)} 组分镜生成画面提示词")
            else:
                llm_prompts = None
                task["deepseek_prompt_status"] = "failed"
                if deepseek_call_error:
                    task["deepseek_prompt_message"] = (
                        f"DeepSeek 调用失败：{deepseek_call_error}。"
                        "已改用内置规则按每句分镜配图，画面可能与口播贴合度略低，可稍后重试。"
                    )
                else:
                    task["deepseek_prompt_message"] = (
                        "DeepSeek 未返回有效的画面提示词。"
                        "已改用内置规则按每句分镜配图，画面可能与口播贴合度略低，可稍后重试。"
                    )
                _log("DeepSeek 返回无效或为空，改用规则拼接提示词（按每句分镜单独配图）")
        elif num_image_groups > 0:
            task["deepseek_prompt_status"] = "skipped_no_key"
            task["deepseek_prompt_message"] = (
                "未配置 DeepSeek API 密钥，配图使用内置规则。"
                "在服务器设置环境变量 DEEPSEEK_API_KEY 后重启服务，可获得更贴口的画面。"
            )
            _log("未配置 DeepSeek 密钥（环境变量 DEEPSEEK_API_KEY 或 web-tool/scripts/build_news.py），使用规则拼接提示词")

        # 先按组生成图片
        for group_idx in range(num_image_groups):
            group_segments = all_groups[group_idx]

            if llm_prompts is not None:
                core = (llm_prompts[group_idx] or "").strip()
                if user_topic_supplied:
                    pos_prompt = (
                        f"【总主题】{topic_clip}。"
                        f"{core} "
                        "写实风格，电影级光影，摄影质感，高清细节，画面中不要出现文字、水印或字幕。"
                    )
                else:
                    pos_prompt = (
                        f"{_CLIP_GENERIC_THEME_EN}. {core} "
                        "photorealistic, cinematic lighting, no text watermark or subtitles in frame."
                    )
            else:
                pos_prompt = _build_rule_based_image_prompt_for_group(
                    user_topic_supplied, topic, group_segments, group_idx, classical_mode
                )

            pos_prompt = pos_prompt + " " + cast_suffix

            pos_prompt = _IMAGE_NO_TEXT_PREFIX + pos_prompt
            pos_prompt = _strip_verbatim_script_from_image_prompt(pos_prompt, segments)
            pos_prompt = _sanitize_clip_positive_prompt(pos_prompt)
            pos_prompt = _ensure_image_prompt_has_substance(pos_prompt, topic_clip)

            if images_only:
                task["stage"] = "image"
                img_done += 1
                task["progress"] = {"current": img_done, "total": img_total}
                _log(f"生成配图 {img_done}/{img_total} (第 {group_idx + 1}/{num_image_groups} 句)")
                workflow = _build_z_image_turbo_workflow(
                    pos_prompt,
                    seed=None if seed is None else seed + group_idx,
                    width=image_width,
                    height=image_height,
                    negative_text=neg_prompt,
                )
                img_bytes = await _run_comfyui_and_get_last_image(workflow)
                img_path = images_dir / f"{group_idx:03d}.png"
                img_path.write_bytes(img_bytes)
            elif need_landscape:
                task["stage"] = "image"
                img_done += 1
                task["progress"] = {"current": img_done, "total": img_total}
                _log(f"生成图片（横屏 16:9） {img_done}/{img_total} (分镜组 {group_idx + 1}/{num_image_groups})")
                workflow = _build_z_image_turbo_workflow(
                    pos_prompt,
                    seed=None if seed is None else seed + group_idx,
                    width=1920,
                    height=1080,
                    negative_text=neg_prompt,
                )
                img_bytes = await _run_comfyui_and_get_last_image(workflow)
                img_path = images_dir / f"{group_idx:03d}_16_9.png"
                img_path.write_bytes(img_bytes)
                # 为这个组的每个segment都添加相同的图片路径
                for _ in group_segments:
                    image_paths_16_9.append(img_path)

            if need_portrait:
                task["stage"] = "image"
                img_done += 1
                task["progress"] = {"current": img_done, "total": img_total}
                _log(f"生成图片（竖屏 9:16） {img_done}/{img_total} (分镜组 {group_idx + 1}/{num_image_groups})")
                workflow = _build_z_image_turbo_workflow(
                    pos_prompt,
                    seed=None if seed is None else seed + group_idx + 10000,
                    width=1080,
                    height=1920,
                    negative_text=neg_prompt,
                )
                img_bytes = await _run_comfyui_and_get_last_image(workflow)
                img_path = images_dir / f"{group_idx:03d}_9_16.png"
                img_path.write_bytes(img_bytes)
                # 为这个组的每个segment都添加相同的图片路径
                for _ in group_segments:
                    image_paths_9_16.append(img_path)

        if images_only:
            images_result: List[dict] = []
            for group_idx, group_segments in enumerate(all_groups):
                img_name = f"{group_idx:03d}.png"
                caption = "".join(group_segments).strip()
                images_result.append({
                    "index": group_idx,
                    "caption": caption,
                    "url": f"/output/{task_dir.name}/images/{img_name}",
                    "filename": img_name,
                })
            task["images"] = images_result
            task["status"] = "done"
            task["stage"] = "done"
            task["progress"] = {"current": img_total, "total": img_total}
            try:
                task["output_directory"] = str(task_dir.resolve())
            except Exception:
                task["output_directory"] = str(task_dir)
            _log(f"配图完成，共 {len(images_result)} 张，输出目录 images/")
            return

        # 然后为每个segment生成音频
        for idx, seg in enumerate(segments, start=1):

            task["stage"] = "tts"
            _log(f"合成语音 {idx}/{len(segments)}")
            phrases = _split_text_to_phrases(seg)
            if not phrases:
                phrases = [seg]

            phrase_audios: List[Path] = []
            timeline: List[Tuple[str, float, float]] = []
            cur_t = 0.0

            # 每句单独合成，拿到真实时长，后续字幕按真实时间轴显示
            for j, p in enumerate(phrases, start=1):
                tmp_path = audio_dir / f"{idx:03d}_{j:02d}.wav"
                try:
                    actual = Path(await _indextts_synthesize(p, tmp_path, voice=voice, speed=speed))
                except Exception as e:
                    actual = tmp_path
                    _write_silence_wav(actual, duration_ms=320)
                    _log(f"TTS 失败，已用静音替代：分镜 {idx}/{len(segments)} 句子 {j}/{len(phrases)}，原因：{str(e)}")

                dur = _audio_duration_seconds(actual)
                phrase_audios.append(actual)
                sub_text = _subtitle_simplify(p) if subtitle_simplify else p
                timeline.append((sub_text, cur_t, dur))
                cur_t += dur

            wav_path = audio_dir / f"{idx:03d}.wav"

            # 如果所有片段都是 WAV，则用 wave 拼接；否则用 MoviePy/ffmpeg 拼接并输出 WAV
            if all(p.suffix.lower() == ".wav" for p in phrase_audios):
                _concat_wavs(phrase_audios, wav_path)
            else:
                _concat_audio_to_wav(phrase_audios, wav_path)

            for p in phrase_audios:
                try:
                    if p.resolve() == wav_path.resolve():
                        continue
                    if p.is_file():
                        p.unlink()
                except Exception:
                    pass

            audio_paths.append(wav_path)
            subtitles_timeline.append(timeline)

        # Videos
        video_total = int(bool(gen_video_16_9)) + int(bool(gen_video_9_16))
        if video_total > 0:
            task["stage"] = "video"

        video_cur = 0
        if gen_video_16_9:
            video_cur += 1
            task["progress"] = {"current": video_cur, "total": video_total}
            _log(f"合成视频（横屏 16:9） {video_cur}/{video_total}")
            out_video_16_9 = task_dir / "result_16_9.mp4"
            await asyncio.to_thread(_compose_video_sync, image_paths_16_9, audio_paths, out_video_16_9, fps, subtitles_timeline, (1920, 1080))
            task["video_url_16_9"] = f"/output/{task_dir.name}/result_16_9.mp4"
            _log(f"合成完成（横屏 16:9） {video_cur}/{video_total}")

        if gen_video_9_16:
            video_cur += 1
            task["progress"] = {"current": video_cur, "total": video_total}
            _log(f"合成视频（竖屏 9:16） {video_cur}/{video_total}")
            out_video_9_16 = task_dir / "result_9_16.mp4"
            await asyncio.to_thread(_compose_video_sync, image_paths_9_16, audio_paths, out_video_9_16, fps, subtitles_timeline, (1080, 1920))
            task["video_url_9_16"] = f"/output/{task_dir.name}/result_9_16.mp4"
            _log(f"合成完成（竖屏 9:16） {video_cur}/{video_total}")

    except RuntimeError as e:
        task["status"] = "error"
        task["error"] = str(e)
        return
    except Exception as e:
        task["status"] = "error"
        task["error"] = str(e)
        return

    task["status"] = "done"
    task["stage"] = "done"
    try:
        task["output_directory"] = str(task_dir.resolve())
    except Exception:
        task["output_directory"] = str(task_dir)
    _log("任务完成")
    # Backward compatibility: keep video_url pointing to one of the generated videos
    if task.get("video_url_16_9"):
        task["video_url"] = task["video_url_16_9"]
    elif task.get("video_url_9_16"):
        task["video_url"] = task["video_url_9_16"]
    else:
        task["video_url"] = None


@app.post('/text-to-images/start')
@app.post('/api/text-to-images/start')
async def text_to_images_start(
    text: str = Form(...),
    aspect_preset: str = Form("xhs_34"),
    scene_min_len: str = Form(""),
    scene_max_len: str = Form(""),
):
    preset = (aspect_preset or "xhs_34").strip()
    if preset not in _TEXT_TO_IMAGES_ASPECT_PRESETS:
        preset = "xhs_34"

    task_id = str(uuid.uuid4())
    output_dir = _alloc_text_to_video_output_dir()
    _TEXT_TO_VIDEO_TASKS[task_id] = {
        "task_id": task_id,
        "output_dir": output_dir,
        "status": "running",
        "stage": "init",
        "created_at": _now_ts_ms(),
        "progress": {"current": 0, "total": 0},
        "logs": [],
        "images_only": True,
        "aspect_preset": preset,
        "images": [],
        "video_url": None,
        "video_url_16_9": None,
        "video_url_9_16": None,
        "gen_video_16_9": "0",
        "gen_video_9_16": "0",
        "subtitle_simplify_punct": "0",
        "scene_min_len": scene_min_len,
        "scene_max_len": scene_max_len,
        "deepseek_prompt_status": "pending",
        "deepseek_prompt_message": "",
        "error": None,
    }

    async def _runner():
        await _run_text_to_video_task(task_id, text, None, None, None, 25)

    asyncio.create_task(_runner())
    return {"success": True, "task_id": task_id}


@app.get('/text-to-images/status')
@app.get('/api/text-to-images/status')
async def text_to_images_status(task_id: str):
    return await text_to_video_status(task_id)


@app.post('/text-to-images/cancel')
@app.post('/api/text-to-images/cancel')
async def text_to_images_cancel(task_id: str):
    return await cancel_text_to_video(task_id)


@app.post('/text-to-images/reveal-output')
@app.post('/api/text-to-images/reveal-output')
async def text_to_images_reveal_output(task_id: str = Form(...)):
    return await text_to_video_reveal_output(task_id)


@app.post('/text-to-video/start')
@app.post('/api/text-to-video/start')
async def text_to_video_start(
    text: str = Form(...),
    voice: str = Form(""),
    speed: float = Form(1.0),
    gen_video_16_9: str = Form("0"),
    gen_video_9_16: str = Form("1"),
    subtitle_simplify_punct: str = Form("0"),
    scene_min_len: str = Form(""),
    scene_max_len: str = Form(""),
):
    task_id = str(uuid.uuid4())
    output_dir = _alloc_text_to_video_output_dir()
    _TEXT_TO_VIDEO_TASKS[task_id] = {
        "task_id": task_id,
        "output_dir": output_dir,
        "status": "running",
        "stage": "init",
        "created_at": _now_ts_ms(),
        "progress": {"current": 0, "total": 0},
        "logs": [],
        "video_url": None,
        "video_url_16_9": None,
        "video_url_9_16": None,
        "gen_video_16_9": gen_video_16_9,
        "gen_video_9_16": gen_video_9_16,
        "subtitle_simplify_punct": subtitle_simplify_punct,
        "scene_min_len": scene_min_len,
        "scene_max_len": scene_max_len,
        "deepseek_prompt_status": "pending",
        "deepseek_prompt_message": "",
        "error": None,
    }

    voice_val = (voice or "").strip() or None
    speed_val = float(speed)
    fps_val = 25  # Default FPS
    seed_val = None  # Random seed by default

    async def _runner():
        await _run_text_to_video_task(task_id, text, seed_val, voice_val, speed_val, fps_val)

    asyncio.create_task(_runner())
    return {"success": True, "task_id": task_id}


@app.post('/text-to-video/cancel')
async def cancel_text_to_video(task_id: str):
    if task_id in _TEXT_TO_VIDEO_TASKS:
        # Mark task as cancelled and stop any ongoing operations
        _TEXT_TO_VIDEO_TASKS[task_id]['status'] = 'cancelled'
        # If ComfyUI process is running, terminate it (example using psutil)
        try:
            import psutil
            for proc in psutil.process_iter(['pid', 'name']):
                if 'comfyui' in proc.info['name'].lower():  # Adjust based on actual process name
                    proc.terminate()
        except ImportError:
            raise RuntimeError("psutil not installed, cannot terminate processes")
        return {"success": True}
    raise HTTPException(status_code=404, detail="Task not found")


@app.get('/text-to-video/status')
@app.get('/api/text-to-video/status')
async def text_to_video_status(task_id: str):
    task = _TEXT_TO_VIDEO_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"success": True, **task}


@app.post("/text-to-video/reveal-output")
@app.post("/api/text-to-video/reveal-output")
async def text_to_video_reveal_output(task_id: str = Form(...)):
    """在运行本服务的电脑上打开该任务的输出文件夹（仅适合本机调试；公网部署勿暴露给不信任用户）。"""
    task = _TEXT_TO_VIDEO_TASKS.get(task_id)
    if not task or task.get("status") != "done":
        raise HTTPException(status_code=400, detail="Task not found or not finished")
    out_abs = task.get("output_directory")
    if not out_abs:
        out_abs = str(_safe_task_dir(task_id).resolve())
    p = Path(out_abs)
    if not p.is_dir():
        raise HTTPException(status_code=404, detail="Output folder not found")
    try:
        if sys.platform == "win32":
            os.startfile(str(p))  # noqa: S606
        elif sys.platform == "darwin":
            await asyncio.to_thread(subprocess.Popen, ["open", str(p)])
        else:
            await asyncio.to_thread(subprocess.Popen, ["xdg-open", str(p)])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"success": True, "path": str(p)}


async def queue_prompt(prompt):
    print("API: queue_prompt called")
    p = {"prompt": prompt, "client_id": CLIENT_ID}
    try:
        # 使用 asyncio.to_thread 防止阻塞事件循环
        response = await asyncio.to_thread(requests.post, "http://{}/prompt".format(COMFYUI_SERVER_ADDRESS), json=p, timeout=30)
        if response.status_code != 200:
            detail = _format_comfyui_prompt_error(response)
            print(f"ComfyUI Error ({response.status_code}): {detail}")
            raise RuntimeError(detail)
        return response.json()
    except requests.exceptions.Timeout:
        raise TimeoutError("连接 ComfyUI 超时 (queue_prompt)")
    except RuntimeError:
        raise
    except Exception as e:
        raise e

async def get_image(filename, subfolder, folder_type):
    data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
    url_values = urllib.parse.urlencode(data)
    # urllib.request.urlopen 也是阻塞的，改为异步
    def _fetch_image():
        with urllib.request.urlopen("http://{}/view?{}".format(COMFYUI_SERVER_ADDRESS, url_values), timeout=10) as response:
            return response.read()
    
    return await asyncio.to_thread(_fetch_image)

async def get_history(prompt_id):
    # 添加 timeout=10 并异步执行
    response = await asyncio.to_thread(requests.get, "http://{}/history/{}".format(COMFYUI_SERVER_ADDRESS, prompt_id), timeout=10)
    response.raise_for_status()
    return response.json()

async def upload_image(file: UploadFile, name_prefix="upload_"):
    """
    上传图片到 ComfyUI
    """
    orig = (file.filename or "").lower()
    if orig.endswith((".jpg", ".jpeg")):
        ext, mime = ".jpg", "image/jpeg"
    elif orig.endswith(".webp"):
        ext, mime = ".webp", "image/webp"
    else:
        ext, mime = ".png", "image/png"
    filename = "{}{}{}".format(name_prefix, uuid.uuid4(), ext)

    url = "http://{}/upload/image".format(COMFYUI_SERVER_ADDRESS)
    file_content = await file.read()
    files = {"image": (filename, file_content, mime)}
    data = {'overwrite': 'true'}
    
    # 添加 timeout=30 (上传可能较慢) 并异步执行
    response = await asyncio.to_thread(requests.post, url, files=files, data=data, timeout=30)
    result = response.json()
    
    # 返回 ComfyUI 保存后的文件名和子目录
    return result.get("name"), result.get("subfolder", "")


async def upload_image_bytes(file_content: bytes, name_prefix="upload_"):
    """
    上传图片字节到 ComfyUI
    """
    filename = "{}{}.png".format(name_prefix, uuid.uuid4())
    url = "http://{}/upload/image".format(COMFYUI_SERVER_ADDRESS)
    files = {'image': (filename, file_content, 'image/png')}
    data = {'overwrite': 'true'}
    response = await asyncio.to_thread(requests.post, url, files=files, data=data, timeout=30)
    result = response.json()
    return result.get("name"), result.get("subfolder", "")


@app.post("/txt2img")
@app.post("/api/txt2img")
async def txt2img_generate(
    prompt: str = Form(...),
    negative_prompt: str = Form(""),
    width: int = Form(1024),
    height: int = Form(1024),
    seed: str = Form(""),
):
    """文生图：Z-Image Turbo（与文字成片同一套 ComfyUI 工作流）。"""
    p = (prompt or "").strip()
    if not p:
        raise HTTPException(status_code=400, detail="prompt 不能为空")
    w = _clamp_image_side(width)
    h = _clamp_image_side(height)
    neg = _default_txt2img_negative(negative_prompt, width=w, height=h)
    seed_opt = _parse_seed_optional(seed)
    run_seed = seed_opt if seed_opt is not None else random.randint(0, (1 << 31) - 1)
    try:
        p_use = _enhance_txt2img_positive(p)
        wf = _build_z_image_turbo_workflow(p_use, seed=run_seed, width=w, height=h, negative_text=neg)
        img_bytes = await _run_comfyui_and_get_last_image(wf)
        b64 = base64.b64encode(img_bytes).decode("ascii")
        return {"success": True, "image_base64": b64, "seed_used": run_seed}
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _img2img_build_and_run(
    fname: str,
    prompt: str,
    engine: str,
    negative_prompt: str,
    denoise: float,
    run_seed: int,
    quality: str = "standard",
):
    """图生图核心：已上传到 ComfyUI 的文件名 → 结果 PNG 字节与元数据。"""
    eng = _normalize_img2img_engine(engine)
    p = (prompt or "").strip()
    if eng == "z_image":
        neg_core = _default_txt2img_negative(negative_prompt, width=None, height=None)
        neg = f"{neg_core}, {_IMG2IMG_NEG_PRESERVE_EXTRA}"
        d = float(denoise)
        d = max(0.05, min(1.0, d))
        p_use = _enhance_img2img_positive(p)
        wf = _build_z_image_img2img_workflow(p_use, fname, negative_text=neg, seed=run_seed, denoise=d)
        denoise_used = d
    else:
        names = await asyncio.to_thread(_fetch_checkpoint_names)
        resolved = _resolve_qwen_checkpoint("AllInOne\\qwen\\Qwen-Rapid-AIO-NSFW-v10.safetensors")
        if names and resolved not in names:
            raise RuntimeError(
                "未找到 Qwen-Rapid-AIO checkpoint（models/checkpoints/）。"
                "请从 Aki 复制 AllInOne/qwen/Qwen-Rapid-AIO-NSFW-v10.safetensors 到 models/checkpoints/。"
            )
        wf = build_qwen_image_edit_img2img_workflow(p, fname, seed=run_seed, quality=quality)
        denoise_used = None
    img_bytes = await _run_comfyui_and_get_last_image(wf)
    out = {"image_bytes": img_bytes, "seed_used": run_seed, "engine": eng}
    if eng == "qwen":
        out["quality"] = _normalize_img2img_quality(quality)
    if denoise_used is not None:
        out["denoise"] = denoise_used
    return out


async def _run_img2img_task(task_id: str):
    task = _IMG2IMG_TASKS.get(task_id)
    if not task:
        return
    task["status"] = "running"
    task["updated_at"] = time.time()
    try:
        file_bytes = task.get("file_bytes")
        if not file_bytes:
            raise RuntimeError("缺少任务图片数据")
        p = (task.get("prompt") or "").strip()
        if not p:
            raise RuntimeError("prompt 不能为空")
        seed_opt = task.get("seed_opt")
        run_seed = seed_opt if seed_opt is not None else random.randint(0, (1 << 31) - 1)
        fname, _sub = await upload_image_bytes(file_bytes)
        if not fname:
            raise RuntimeError("上传到 ComfyUI 失败")
        core = await _img2img_build_and_run(
            fname,
            p,
            task.get("engine", "qwen"),
            task.get("negative_prompt") or "",
            float(task.get("denoise") or 0.4),
            run_seed,
            task.get("quality") or "standard",
        )
        b64 = base64.b64encode(core["image_bytes"]).decode("ascii")
        result = {"success": True, "image_base64": b64, "seed_used": core["seed_used"], "engine": core["engine"]}
        if core.get("quality"):
            result["quality"] = core["quality"]
        if core.get("denoise") is not None:
            result["denoise"] = core["denoise"]
        if task.get("enable_watermark"):
            wm_text = (task.get("watermark_text") or "样片确认").strip() or "样片确认"
            watermarked_raw = await asyncio.to_thread(add_watermark, core["image_bytes"], wm_text)
            if watermarked_raw:
                result["watermarked_image_base64"] = base64.b64encode(watermarked_raw).decode("ascii")
        task["result"] = result
        task["status"] = "done"
        task["updated_at"] = time.time()
    except Exception as e:
        task["status"] = "error"
        task["error"] = str(e)
        task["updated_at"] = time.time()
    finally:
        task.pop("file_bytes", None)


def _form_truthy(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in ("1", "true", "yes", "on")


@app.post("/img2img/start")
@app.post("/api/img2img/start")
async def img2img_start(
    image: UploadFile = File(...),
    prompt: str = Form(...),
    negative_prompt: str = Form(""),
    denoise: float = Form(0.4),
    seed: str = Form(""),
    engine: str = Form("qwen"),
    quality: str = Form("standard"),
    enable_watermark: str = Form("false"),
    watermark_text: str = Form("样片确认"),
):
    """图生图异步任务：快速返回 task_id，避免 Cloudflare 隧道长连接 524。"""
    p = (prompt or "").strip()
    if not p:
        raise HTTPException(status_code=400, detail="prompt 不能为空")
    if not image:
        raise HTTPException(status_code=400, detail="请上传图片")
    try:
        file_bytes = await image.read()
        task_id = str(uuid.uuid4())
        _IMG2IMG_TASKS[task_id] = {
            "status": "queued",
            "created_at": time.time(),
            "updated_at": time.time(),
            "file_bytes": file_bytes,
            "prompt": p,
            "negative_prompt": negative_prompt,
            "denoise": denoise,
            "engine": engine,
            "quality": _normalize_img2img_quality(quality),
            "seed_opt": _parse_seed_optional(seed),
            "enable_watermark": _form_truthy(enable_watermark),
            "watermark_text": (watermark_text or "样片确认").strip() or "样片确认",
            "result": None,
            "error": None,
        }
        asyncio.create_task(_run_img2img_task(task_id))
        return {"success": True, "task_id": task_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/img2img/status/{task_id}")
@app.get("/api/img2img/status/{task_id}")
async def img2img_status(task_id: str):
    """查询图生图异步任务状态。"""
    task = _IMG2IMG_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {
        "success": True,
        "task_id": task_id,
        "status": task.get("status"),
        "result": task.get("result"),
        "error": task.get("error"),
        "updated_at": task.get("updated_at"),
    }


@app.post("/img2img")
@app.post("/api/img2img")
async def img2img_generate(
    image: UploadFile = File(...),
    prompt: str = Form(...),
    negative_prompt: str = Form(""),
    denoise: float = Form(0.4),
    seed: str = Form(""),
    engine: str = Form("qwen"),
    quality: str = Form("standard"),
    enable_watermark: str = Form("false"),
    watermark_text: str = Form("样片确认"),
):
    """图生图：默认 Qwen Image Edit 指令改图；可选 engine=z_image 走 Z-Image Turbo 重采样。"""
    p = (prompt or "").strip()
    if not p:
        raise HTTPException(status_code=400, detail="prompt 不能为空")
    if not image:
        raise HTTPException(status_code=400, detail="请上传图片")
    seed_opt = _parse_seed_optional(seed)
    run_seed = seed_opt if seed_opt is not None else random.randint(0, (1 << 31) - 1)
    try:
        fname, _sub = await upload_image(image)
        if not fname:
            raise HTTPException(status_code=500, detail="上传到 ComfyUI 失败")
        core = await _img2img_build_and_run(fname, p, engine, negative_prompt, denoise, run_seed, quality)
        b64 = base64.b64encode(core["image_bytes"]).decode("ascii")
        out = {"success": True, "image_base64": b64, "seed_used": core["seed_used"], "engine": core["engine"]}
        if core.get("quality"):
            out["quality"] = core["quality"]
        if core.get("denoise") is not None:
            out["denoise"] = core["denoise"]
        if _form_truthy(enable_watermark):
            wm_text = (watermark_text or "样片确认").strip() or "样片确认"
            watermarked_raw = await asyncio.to_thread(add_watermark, core["image_bytes"], wm_text)
            if watermarked_raw:
                out["watermarked_image_base64"] = base64.b64encode(watermarked_raw).decode("ascii")
        return out
    except HTTPException:
        raise
    except RuntimeError as e:
        msg = str(e)
        code = 503 if "未找到 Qwen" in msg else 500
        raise HTTPException(status_code=code, detail=msg)
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/upload')
@app.post('/api/upload')
async def upload_endpoint(
    image: UploadFile = File(...),
):
    """前端通用图片上传接口：将图片上传到 ComfyUI，返回保存的文件名（无需登录与积分）。"""

    if not image:
        raise HTTPException(status_code=400, detail='No image file provided')

    try:
        filename, _ = await upload_image(image)
        if not filename:
            raise HTTPException(status_code=500, detail='Failed to upload image')

        return {"success": True, "filename": filename}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in upload_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def _run_photo_restore_task(task_id: str):
    async with _COMFYUI_JOB_SEM:
        await _run_photo_restore_task_impl(task_id)


async def _run_photo_restore_task_impl(task_id: str):
    task = _PHOTO_RESTORE_TASKS.get(task_id)
    if not task:
        return
    task["status"] = "running"
    task["updated_at"] = time.time()

    try:
        file_bytes = task.get("file_bytes")
        if not file_bytes:
            raise RuntimeError("缺少任务图片数据")

        enable_watermark = bool(task.get("enable_watermark"))
        watermark_text = task.get("watermark_text") or "样片确认"

        print(f"正在上传图片到 ComfyUI (老照片修复异步): {COMFYUI_SERVER_ADDRESS}...")
        comfy_filename, subfolder = await upload_image_bytes(file_bytes)
        print(f"上传成功: {comfy_filename}")

        workflow = build_photo_restore_workflow(comfy_filename)

        ws = websocket.WebSocket()
        try:
            await asyncio.to_thread(ws.connect, "ws://{}/ws?clientId={}".format(COMFYUI_SERVER_ADDRESS, CLIENT_ID), timeout=10)

            print(f"正在发送任务到 ComfyUI (老照片修复异步)...")
            prompt_response = await queue_prompt(workflow)
            prompt_id = prompt_response['prompt_id']
            task["prompt_id"] = prompt_id
            task["updated_at"] = time.time()
            print(f"任务已提交, ID: {prompt_id}")

            while True:
                ws.settimeout(5.0)
                try:
                    out = await asyncio.to_thread(ws.recv)
                except websocket.WebSocketTimeoutException:
                    continue
                if isinstance(out, str):
                    message = json.loads(out)
                    if message['type'] == 'executing':
                        data = message['data']
                        if data['node'] is None and data['prompt_id'] == prompt_id:
                            break
                else:
                    continue
        finally:
            await asyncio.to_thread(ws.close)

        history = await get_history(prompt_id)
        history = history[prompt_id]
        outputs = history['outputs']

        output_images = []
        for node_id in outputs:
            node_output = outputs[node_id]
            if 'images' in node_output:
                for image in node_output['images']:
                    image_data = await get_image(image['filename'], image['subfolder'], image['type'])
                    output_images.append(image_data)

        if not output_images:
            raise RuntimeError("No output images generated")

        result_data = output_images[-1]
        clean_base64 = base64.b64encode(result_data).decode('utf-8')

        response_data = {
            "image_data": f"data:image/png;base64,{clean_base64}",
            "watermarked_image_data": None
        }

        if enable_watermark:
            print(f"正在生成水印版本: {watermark_text}")
            watermarked_raw = await asyncio.to_thread(add_watermark, result_data, watermark_text)
            if watermarked_raw:
                wm_base64 = base64.b64encode(watermarked_raw).decode('utf-8')
                response_data["watermarked_image_data"] = f"data:image/png;base64,{wm_base64}"

        task["result"] = response_data
        task["status"] = "done"
        task["updated_at"] = time.time()
        task.pop("file_bytes", None)
    except Exception as e:
        task["status"] = "error"
        task["error"] = str(e)
        task["updated_at"] = time.time()
        task.pop("file_bytes", None)

def add_watermark(image_data, text="样片确认"):
    """
    添加平铺水印
    """
    try:
        # Load image
        img = Image.open(io.BytesIO(image_data)).convert("RGBA")
        width, height = img.size
        
        # Create watermark layer
        watermark = Image.new("RGBA", (width, height), (0,0,0,0))
        draw = ImageDraw.Draw(watermark)
        
        # Font settings - dynamic size based on image width
        font_size = int(max(width, height) / 15)  # Make font slightly larger (1/15 instead of 1/20)
        font = None
        
        # Try common Chinese fonts on Windows first
        font_candidates = ["msyh.ttc", "simhei.ttf", "simsun.ttc", "arial.ttf"]
        
        for font_name in font_candidates:
            try:
                font = ImageFont.truetype(font_name, font_size)
                break
            except:
                continue
                
        if font is None:
            font = ImageFont.load_default()
            
        # Watermark text color (white, 50% opacity -> ~128 alpha)
        # Increased visibility as per user request
        text_color = (255, 255, 255, 128)
        
        # Calculate text size
        try:
            left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
            text_w = right - left
            text_h = bottom - top
        except:
             text_w, text_h = draw.textsize(text, font=font)
             
        # Tiling configuration
        # Rotate text by 30 degrees
        angle = 30
        
        # Calculate spacing
        spacing_x = int(text_w * 2.0) # Tighter spacing
        spacing_y = int(text_h * 3.0)
        
        # Create a temporary image for the text to rotate it properly
        # Make it large enough to hold rotated text
        txt_img_size = int(max(text_w, text_h) * 2)
        txt_img = Image.new('RGBA', (txt_img_size, txt_img_size), (0,0,0,0))
        d = ImageDraw.Draw(txt_img)
        # Draw text in center
        d.text(((txt_img_size - text_w)/2, (txt_img_size - text_h)/2), text, font=font, fill=text_color)
        rot_txt = txt_img.rotate(angle, expand=1)
        rot_w, rot_h = rot_txt.size
        
        # Tile across the image
        # Offset starting point to ensure coverage
        for y in range(-height, height * 2, spacing_y):
            # Shift every other row
            row_offset = (spacing_x // 2) if (y // spacing_y) % 2 == 1 else 0
            for x in range(-width, width * 2, spacing_x):
                watermark.paste(rot_txt, (x + row_offset, y), rot_txt)
                
        # Composite
        combined = Image.alpha_composite(img, watermark)
        
        # Output
        buf = io.BytesIO()
        combined.convert("RGB").save(buf, format="PNG")
        return buf.getvalue()
        
    except Exception as e:
        print(f"Watermark error: {e}")
        return None

def build_rembg_workflow(input_filename):
    """
    从文件读取 API 格式的工作流模板，并注入输入文件名
    """
    workflow_path = os.path.join(os.path.dirname(__file__), WORKFLOW_FOLDER, 'rembg.json')
    
    if not os.path.exists(workflow_path):
        raise FileNotFoundError(f"Workflow file not found: {workflow_path}")
        
    with open(workflow_path, 'r', encoding='utf-8') as f:
        workflow = json.load(f)
    
    # 动态查找 LoadImage 节点并修改
    # 虽然我们知道 ID 是 "23"，但为了稳健性，最好遍历查找
    load_image_node = None
    
    # 优先尝试直接通过 ID 获取
    if "23" in workflow and workflow["23"]["class_type"] == "LoadImage":
        load_image_node = workflow["23"]
    else:
        # 否则遍历查找第一个 LoadImage 节点
        for node_id, node in workflow.items():
            if node["class_type"] == "LoadImage":
                load_image_node = node
                break
    
    if load_image_node:
        load_image_node["inputs"]["image"] = input_filename
        load_image_node["inputs"]["upload"] = "image" 
    else:
        raise ValueError("LoadImage node not found in workflow")

    return workflow

def build_describe_cutout_workflow(input_filename, text_prompt):
    """
    构建描述抠图工作流
    """
    workflow_path = os.path.join(os.path.dirname(__file__), WORKFLOW_FOLDER, 'qwen_describe_cutout.json')
    
    if not os.path.exists(workflow_path):
        raise FileNotFoundError(f"Workflow file not found: {workflow_path}")
        
    with open(workflow_path, 'r', encoding='utf-8') as f:
        workflow = json.load(f)
    
    # 设置图片输入 (Node 5)
    if "5" in workflow and workflow["5"]["class_type"] == "LoadImage":
        workflow["5"]["inputs"]["image"] = input_filename
        workflow["5"]["inputs"]["upload"] = "image"
    else:
        raise ValueError("LoadImage node (ID 5) not found in workflow")

    # 设置描述文本 (Node 3)
    if "3" in workflow and workflow["3"]["class_type"] == "QwenVLDetection":
        workflow["3"]["inputs"]["target"] = text_prompt
    else:
        # 尝试遍历查找 QwenVLDetection 节点
        found = False
        for node_id, node in workflow.items():
            if node["class_type"] == "QwenVLDetection":
                node["inputs"]["target"] = text_prompt
                found = True
                break
        if not found:
            raise ValueError("QwenVLDetection node not found in workflow")

    return workflow

def build_photo_restore_workflow(input_filename):
    """
    构建老照片修复工作流
    """
    workflow_filename = '【All In One】Qwen-Image-Edit-Rapid-AIO-v10-老照片修复.json'
    workflow_path = os.path.join(os.path.dirname(__file__), WORKFLOW_FOLDER, workflow_filename)
    
    if not os.path.exists(workflow_path):
        # Fallback check for encoding issues or if file was renamed
        # Try to find any json with "老照片修复" in name
        found_file = None
        if os.path.exists(os.path.join(os.path.dirname(__file__), WORKFLOW_FOLDER)):
            for f in os.listdir(os.path.join(os.path.dirname(__file__), WORKFLOW_FOLDER)):
                if "老照片修复" in f and f.endswith(".json"):
                    workflow_path = os.path.join(os.path.dirname(__file__), WORKFLOW_FOLDER, f)
                    found_file = True
                    break
        
        if not found_file and not os.path.exists(workflow_path):
            raise FileNotFoundError(f"Workflow file not found: {workflow_path}")
        
    with open(workflow_path, 'r', encoding='utf-8') as f:
        workflow = json.load(f)
    
    # 设置图片输入 (Node 7: LoadImage)
    # The workflow file shows ID "7" is LoadImage
    if "7" in workflow and workflow["7"]["class_type"] == "LoadImage":
        workflow["7"]["inputs"]["image"] = input_filename
        workflow["7"]["inputs"]["upload"] = "image"
    else:
        # Dynamic search fallback
        found = False
        for node_id, node in workflow.items():
            if node["class_type"] == "LoadImage":
                node["inputs"]["image"] = input_filename
                node["inputs"]["upload"] = "image"
                found = True
                break
        if not found:
            raise ValueError("LoadImage node not found in workflow")

    workflow = _patch_qwen_edit_workflow(workflow)
    return workflow

@app.post('/remove-bg')
async def remove_background(
    image: UploadFile = File(...),
    enable_watermark: bool = Form(False),
    watermark_text: str = Form("样片确认"),
):
    """
    移除图片背景 API 端点（无需登录与积分）
    """
    if not image:
        raise HTTPException(status_code=400, detail='No image file provided')
    
    try:
        # 1. 上传图片
        print(f"正在上传图片到 ComfyUI (移除背景): {COMFYUI_SERVER_ADDRESS}...")
        comfy_filename, subfolder = await upload_image(image)
        print(f"上传成功: {comfy_filename}")

        # 2. 构建工作流
        workflow = build_rembg_workflow(comfy_filename)

        # 3. WebSocket 连接
        ws = websocket.WebSocket()
        try:
            await asyncio.to_thread(ws.connect, "ws://{}/ws?clientId={}".format(COMFYUI_SERVER_ADDRESS, CLIENT_ID), timeout=10)

            # 4. 提交任务
            print(f"正在发送任务到 ComfyUI (移除背景)...")
            prompt_response = await queue_prompt(workflow)
            prompt_id = prompt_response['prompt_id']
            print(f"任务已提交, ID: {prompt_id}")

            # 5. 等待执行完成
            while True:
                # 增加 timeout 避免无限阻塞
                ws.settimeout(5.0)
                try:
                    out = await asyncio.to_thread(ws.recv)
                except websocket.WebSocketTimeoutException:
                    continue
                if isinstance(out, str):
                    message = json.loads(out)
                    if message['type'] == 'executing':
                        data = message['data']
                        if data['node'] is None and data['prompt_id'] == prompt_id:
                            break
                else:
                    continue
        finally:
            await asyncio.to_thread(ws.close)
        
        # 6. 获取结果
        history = await get_history(prompt_id)
        history = history[prompt_id]
        outputs = history['outputs']

        output_images = []
        # 收集所有输出图片
        for node_id in outputs:
            node_output = outputs[node_id]
            if 'images' in node_output:
                for image in node_output['images']:
                    image_data = await get_image(image['filename'], image['subfolder'], image['type'])
                    output_images.append(image_data)

        if not output_images:
            raise HTTPException(status_code=500, detail='No output images generated')

        # 取最后一张结果 (通常是最终结果)
        # 注意：ComfyUI输出顺序可能不确定，但在该工作流中只有一个SaveImage节点
        result_data = output_images[-1]
        
        # 编码无水印版本
        clean_base64 = base64.b64encode(result_data).decode('utf-8')

        response_data = {
            'success': True,
            'image_data': f'data:image/png;base64,{clean_base64}'
        }
        
        # 如果需要水印，生成水印版本
        if enable_watermark:
            print(f"正在生成水印版本: {watermark_text}")
            watermarked_raw = await asyncio.to_thread(add_watermark, result_data, watermark_text)
            if watermarked_raw:
                wm_base64 = base64.b64encode(watermarked_raw).decode('utf-8')
                response_data['watermarked_image_data'] = f'data:image/png;base64,{wm_base64}'
            else:
                print("水印生成失败")
                response_data['watermarked_image_data'] = None

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/photo-restore/start')
@app.post('/api/photo-restore/start')
async def photo_restore_start(
    image: UploadFile = File(...),
    enable_watermark: bool = Form(False),
    watermark_text: str = Form("样片确认"),
):
    """
    老照片修复异步任务：提交任务并返回 task_id（无需登录与积分）
    """
    if not image:
        raise HTTPException(status_code=400, detail='No image file provided')

    try:
        file_bytes = await image.read()
        task_id = str(uuid.uuid4())
        _PHOTO_RESTORE_TASKS[task_id] = {
            "status": "queued",
            "created_at": time.time(),
            "updated_at": time.time(),
            "enable_watermark": enable_watermark,
            "watermark_text": watermark_text,
            "file_bytes": file_bytes,
            "result": None,
            "error": None
        }

        asyncio.create_task(_run_photo_restore_task(task_id))

        return {"success": True, "task_id": task_id}
    except Exception as e:
        print(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/photo-restore/status/{task_id}')
@app.get('/api/photo-restore/status/{task_id}')
async def photo_restore_status(task_id: str):
    """
    查询老照片修复任务状态
    """
    task = _PHOTO_RESTORE_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')

    return {
        "success": True,
        "task_id": task_id,
        "status": task.get("status"),
        "result": task.get("result"),
        "error": task.get("error"),
        "updated_at": task.get("updated_at")
    }

@app.post('/describe-cutout')
async def describe_cutout(
    image: UploadFile = File(...),
    text_prompt: str = Form(...),
    enable_watermark: bool = Form(False),
    watermark_text: str = Form("样片确认"),
):
    """
    描述抠图 API 端点（无需登录与积分）
    """
    if not image:
        raise HTTPException(status_code=400, detail='No image file provided')
    
    try:
        # 1. 上传图片
        print(f"正在上传图片到 ComfyUI (描述抠图): {COMFYUI_SERVER_ADDRESS}...")
        comfy_filename, subfolder = await upload_image(image)
        print(f"上传成功: {comfy_filename}")

        # 2. 构建工作流
        workflow = build_describe_cutout_workflow(comfy_filename, text_prompt)

        # 3. WebSocket 连接
        ws = websocket.WebSocket()
        try:
            await asyncio.to_thread(ws.connect, "ws://{}/ws?clientId={}".format(COMFYUI_SERVER_ADDRESS, CLIENT_ID), timeout=10)

            # 4. 提交任务
            print(f"正在发送任务到 ComfyUI (描述抠图)...")
            prompt_response = await queue_prompt(workflow)
            prompt_id = prompt_response['prompt_id']
            print(f"任务已提交, ID: {prompt_id}")

            # 5. 等待执行完成
            while True:
                ws.settimeout(5.0)
                try:
                    out = await asyncio.to_thread(ws.recv)
                except websocket.WebSocketTimeoutException:
                    continue
                if isinstance(out, str):
                    message = json.loads(out)
                    if message['type'] == 'executing':
                        data = message['data']
                        if data['node'] is None and data['prompt_id'] == prompt_id:
                            break
                else:
                    continue
        finally:
            await asyncio.to_thread(ws.close)
        
        # 6. 获取结果
        history = await get_history(prompt_id)
        history = history[prompt_id]
        outputs = history['outputs']

        output_images = []
        # 收集所有输出图片
        for node_id in outputs:
            node_output = outputs[node_id]
            if 'images' in node_output:
                for image in node_output['images']:
                    image_data = await get_image(image['filename'], image['subfolder'], image['type'])
                    output_images.append(image_data)

        if not output_images:
            raise HTTPException(status_code=500, detail='No output images generated')

        # 取最后一张结果 (通常是最终结果)
        # 注意：ComfyUI输出顺序可能不确定，但在该工作流中只有一个SaveImage节点
        result_data = output_images[-1]
        
        # 编码无水印版本
        clean_base64 = base64.b64encode(result_data).decode('utf-8')

        response_data = {
            'success': True,
            'image_data': f'data:image/png;base64,{clean_base64}'
        }
        
        # 如果需要水印，生成水印版本
        if enable_watermark:
            print(f"正在生成水印版本: {watermark_text}")
            watermarked_raw = await asyncio.to_thread(add_watermark, result_data, watermark_text)
            if watermarked_raw:
                wm_base64 = base64.b64encode(watermarked_raw).decode('utf-8')
                response_data['watermarked_image_data'] = f'data:image/png;base64,{wm_base64}'
            else:
                print("水印生成失败")
                response_data['watermarked_image_data'] = None

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post('/photo-restore')
async def photo_restore(
    image: UploadFile = File(...),
    enable_watermark: bool = Form(False),
    watermark_text: str = Form("样片确认"),
):
    """
    老照片修复 API 端点（无需登录与积分）
    """
    if not image:
        raise HTTPException(status_code=400, detail='No image file provided')
    
    try:
        # 1. 上传图片
        print(f"正在上传图片到 ComfyUI (老照片修复): {COMFYUI_SERVER_ADDRESS}...")
        comfy_filename, subfolder = await upload_image(image)
        print(f"上传成功: {comfy_filename}")

        # 2. 构建工作流
        workflow = build_photo_restore_workflow(comfy_filename)

        # 3. WebSocket 连接
        ws = websocket.WebSocket()
        try:
            await asyncio.to_thread(ws.connect, "ws://{}/ws?clientId={}".format(COMFYUI_SERVER_ADDRESS, CLIENT_ID), timeout=10)

            # 4. 提交任务
            print(f"正在发送任务到 ComfyUI (老照片修复)...")
            prompt_response = await queue_prompt(workflow)
            prompt_id = prompt_response['prompt_id']
            print(f"任务已提交, ID: {prompt_id}")

            # 5. 等待执行完成
            while True:
                ws.settimeout(5.0)
                try:
                    out = await asyncio.to_thread(ws.recv)
                except websocket.WebSocketTimeoutException:
                    continue
                if isinstance(out, str):
                    message = json.loads(out)
                    if message['type'] == 'executing':
                        data = message['data']
                        if data['node'] is None and data['prompt_id'] == prompt_id:
                            break
                else:
                    continue
        finally:
            await asyncio.to_thread(ws.close)
        
        # 6. 获取结果
        history = await get_history(prompt_id)
        history = history[prompt_id]
        outputs = history['outputs']

        output_images = []
        # 收集所有输出图片
        for node_id in outputs:
            node_output = outputs[node_id]
            if 'images' in node_output:
                for image in node_output['images']:
                    image_data = await get_image(image['filename'], image['subfolder'], image['type'])
                    output_images.append(image_data)

        if not output_images:
            raise HTTPException(status_code=500, detail='No output images generated')

        # 取最后一张结果 (通常是最终结果)
        # 注意：ComfyUI输出顺序可能不确定，但在该工作流中只有一个SaveImage节点
        result_data = output_images[-1]
        
        # 编码无水印版本
        clean_base64 = base64.b64encode(result_data).decode('utf-8')

        response_data = {
            'success': True,
            'image_data': f'data:image/png;base64,{clean_base64}'
        }
        
        # 如果需要水印，生成水印版本
        if enable_watermark:
            print(f"正在生成水印版本: {watermark_text}")
            watermarked_raw = await asyncio.to_thread(add_watermark, result_data, watermark_text)
            if watermarked_raw:
                wm_base64 = base64.b64encode(watermarked_raw).decode('utf-8')
                response_data['watermarked_image_data'] = f'data:image/png;base64,{wm_base64}'
            else:
                print("水印生成失败")
                response_data['watermarked_image_data'] = None

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def create_cover_image(image_data, title, style="money_yellow", aspect_ratio=(9, 16), focus_point=(0.5, 0.5), font_size=180):
    """
    创建封面图片
    style: money_yellow, money_red_bg, tech_basic, tech_blue, price_green
    aspect_ratio: tuple (w, h) e.g., (9, 16) or (16, 9)
    focus_point: tuple (x, y) 0.0-1.0 relative position of subject
    font_size: int, title font size
    """
    try:
        img = Image.open(io.BytesIO(image_data)).convert("RGBA")
        width, height = img.size
        
        target_ratio = aspect_ratio[0] / aspect_ratio[1]
        img_ratio = width / height
        
        # 1. Crop based on focus point
        try:
            fx = float(focus_point[0])
            fy = float(focus_point[1])
        except Exception:
            fx, fy = 0.5, 0.5
        fx = max(0.0, min(1.0, fx))
        fy = max(0.0, min(1.0, fy))
        if img_ratio > target_ratio:
            # Image is wider than target, crop width
            new_w = int(height * target_ratio)
            
            # Center of the crop should be at focus_x * img_w
            center_x = int(width * fx)
            left = center_x - (new_w // 2)
            
            # Clamp bounds
            if left < 0: left = 0
            if left + new_w > width: left = width - new_w
            
            img = img.crop((left, 0, left + new_w, height))
        else:
            # Image is taller than target, crop height
            new_h = int(width / target_ratio)
            
            # Center of the crop should be at focus_y * img_h
            center_y = int(height * fy)
            top = center_y - (new_h // 2)
            
            # Clamp bounds
            if top < 0: top = 0
            if top + new_h > height: top = height - new_h
            
            img = img.crop((0, top, width, top + new_h))
            
        # Resize to a reasonable standard size for cover
        if aspect_ratio == (9, 16):
            target_size = (1080, 1920)
        else:
            target_size = (1920, 1080)
            
        img = img.resize(target_size, Image.Resampling.LANCZOS)
        width, height = img.size
        
        # 2. Configure Style
        text_color = (255, 255, 255, 255)
        outline_color = (0, 0, 0, 255)
        has_shadow = False
        has_bg = False
        bg_color = (255, 0, 0, 255)
        shadow_color = (0, 0, 0, 160)
        
        if style == "money_yellow":
            # 方案一：招商/搞钱 (黄字 + 黑边)
            text_color = (255, 255, 0, 255)
            outline_color = (0, 0, 0, 255)
        elif style == "money_red_bg":
            # 方案一变体：大字报 (白字 + 红底)
            text_color = (255, 255, 255, 255)
            has_bg = True
            bg_color = (255, 0, 0, 255)
            outline_color = None # 红底通常不需要描边，或者细描边
        elif style == "tech_basic":
            # 方案二：专业/修图 (白字 + 黑边 + 投影)
            text_color = (255, 255, 255, 255)
            outline_color = (0, 0, 0, 255)
            has_shadow = True
        elif style == "tech_blue":
            # 方案二变体：科技感 (白字 + 蓝边)
            text_color = (255, 255, 255, 255)
            outline_color = (0, 85, 255, 255)
        elif style == "price_green":
            # 方案三：价格诱惑 (荧光绿 + 黑边)
            text_color = (0, 255, 0, 255)
            outline_color = (0, 0, 0, 255)

        # 3. Draw Text
        draw = ImageDraw.Draw(img)
        
        # Font settings
        margin_x = int(width * 0.1) # 10% margin
        max_text_width = width - (margin_x * 2)

        # Find font
        windows_font_dir = os.environ.get('WINDIR', r'C:\\Windows')
        windows_font_dir = os.path.join(windows_font_dir, 'Fonts')

        font_candidates = [
            os.path.join(windows_font_dir, 'msyh.ttc'),
            os.path.join(windows_font_dir, 'msyhbd.ttc'),
            os.path.join(windows_font_dir, 'simhei.ttf'),
            os.path.join(windows_font_dir, 'simsun.ttc'),
            os.path.join(windows_font_dir, 'arial.ttf'),
            # Fallback to font names (if the environment can resolve them)
            'msyh.ttc',
            'simhei.ttf',
            'simsun.ttc',
            'arial.ttf',
        ]

        font_path = None
        for name in font_candidates:
            try:
                if os.path.isabs(name) and not os.path.exists(name):
                    continue
                ImageFont.truetype(name, 20)
                font_path = name
                break
            except:
                continue

        if font_path:
            try:
                font = ImageFont.truetype(font_path, int(font_size))
            except:
                font = ImageFont.truetype(font_path, 180)
        else:
            font = ImageFont.load_default()

        # Wrap text into multiple lines without shrinking font size
        def _text_bbox(text):
            try:
                l, t, r, b = draw.textbbox((0, 0), text, font=font)
                return l, t, r, b
            except:
                w, h = draw.textsize(text, font=font)
                return 0, 0, w, h

        def _text_width(text):
            l, t, r, b = _text_bbox(text)
            return r - l

        def wrap_text(text, max_width):
            text = (text or "").strip()
            if not text:
                return [""]

            lines = []
            current = ""
            for ch in text:
                test = current + ch
                if current and _text_width(test) > max_width:
                    lines.append(current)
                    current = ch
                else:
                    current = test
            if current:
                lines.append(current)

            # If a single character is wider than max_width (rare), just return as-is
            if not lines:
                lines = [text]
            return lines

        lines = wrap_text(title, max_text_width)

        # Compute total block height
        line_bboxes = []
        line_heights = []
        max_line_width = 0
        for ln in lines:
            l, t, r, b = _text_bbox(ln)
            w = r - l
            h = b - t
            line_bboxes.append((l, t, r, b))
            line_heights.append(h)
            if w > max_line_width:
                max_line_width = w

        line_spacing = max(6, int(int(font_size) * 0.15))
        total_text_height = sum(line_heights) + line_spacing * (len(lines) - 1)

        # Calculate centered position for the whole block
        start_y = (height - total_text_height) // 2
                
        # Draw Background (if enabled) - cover the whole block
        if has_bg:
            padding = int(int(font_size) * 0.2)
            bg_left = (width - max_line_width) // 2 - padding
            bg_top = start_y - padding
            bg_right = (width + max_line_width) // 2 + padding
            bg_bottom = start_y + total_text_height + padding
            draw.rectangle([bg_left, bg_top, bg_right, bg_bottom], fill=bg_color)

        outline_width = max(2, int(int(font_size) / 30))
        shadow_offset = max(4, int(int(font_size) / 25))

        # Draw each line centered
        y_cursor = start_y
        for idx, ln in enumerate(lines):
            l, t, r, b = line_bboxes[idx]
            text_w = r - l
            text_h = b - t
            x = (width - text_w) // 2 - l
            y = y_cursor - t

            # Shadow
            if has_shadow:
                draw.text((x + shadow_offset, y + shadow_offset), ln, font=font, fill=shadow_color)

            # Outline
            if outline_color:
                for ox in range(-outline_width, outline_width + 1):
                    for oy in range(-outline_width, outline_width + 1):
                        if ox*ox + oy*oy <= outline_width*outline_width:
                            draw.text((x + ox, y + oy), ln, font=font, fill=outline_color)

            # Main
            draw.text((x, y), ln, font=font, fill=text_color)

            y_cursor += text_h + line_spacing
        
        # Output
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode('utf-8')

    except Exception as e:
        raise RuntimeError(f"Cover creation error: {e}")


def create_icon_image(image_data, text, size=100, bg_color="blue", corner_radius=0, font_size=50):
    try:
        safe_size = int(size) if int(size) > 0 else 100
    except Exception:
        safe_size = 100

    safe_size = max(16, min(safe_size, 2048))

    try:
        safe_corner_radius = int(corner_radius)
    except Exception:
        safe_corner_radius = 0

    safe_corner_radius = max(0, min(safe_corner_radius, safe_size // 2))

    bg_map = {
        "blue": (37, 99, 235, 255),
        "red": (220, 38, 38, 255),
        "green": (22, 163, 74, 255),
        "black": (17, 24, 39, 255),
    }
    bg = bg_map.get((bg_color or "").strip().lower(), bg_map["blue"])

    canvas = Image.new("RGBA", (safe_size, safe_size), bg)

    pad = max(4, int(safe_size * 0.06))

    # Optional background image: center-crop to cover the whole icon.
    if image_data:
        try:
            src = Image.open(io.BytesIO(image_data)).convert("RGBA")
            sw, sh = src.size
            if sw > 0 and sh > 0:
                scale = max(safe_size / sw, safe_size / sh)
                tw = max(1, int(sw * scale))
                th = max(1, int(sh * scale))
                src_resized = src.resize((tw, th), Image.Resampling.LANCZOS)
                left = max(0, (tw - safe_size) // 2)
                top = max(0, (th - safe_size) // 2)
                src_cropped = src_resized.crop((left, top, left + safe_size, top + safe_size))
                canvas.alpha_composite(src_cropped, (0, 0))
        except Exception as e:
            print(f"Icon creation warning (open image): {e}")

    draw = ImageDraw.Draw(canvas)

    windows_font_dir = os.environ.get('WINDIR', r'C:\\Windows')
    windows_font_dir = os.path.join(windows_font_dir, 'Fonts')

    font_candidates = [
        os.path.join(windows_font_dir, 'msyhbd.ttc'),
        os.path.join(windows_font_dir, 'msyh.ttc'),
        os.path.join(windows_font_dir, 'simhei.ttf'),
        os.path.join(windows_font_dir, 'simsun.ttc'),
        os.path.join(windows_font_dir, 'arial.ttf'),
        'msyhbd.ttc',
        'msyh.ttc',
        'simhei.ttf',
        'simsun.ttc',
        'arial.ttf',
    ]

    font_path = None
    for name in font_candidates:
        try:
            if os.path.isabs(name) and not os.path.exists(name):
                continue
            ImageFont.truetype(name, 20)
            font_path = name
            break
        except Exception:
            continue

    # Text layout: grid distribution (e.g. 4->2x2, 6->2x3, 8->2x4)
    text = (text or "").strip()
    if not text:
        text = ""

    lines = [ch for ch in text if ch.strip()]
    if not lines:
        lines = [""]

    # Grid calculation
    n = len(lines)
    if n <= 1:
        rows = 1
    else:
        rows = 2
    cols = max(1, int((n + rows - 1) / rows))

    inner_w = safe_size - pad * 2
    inner_h = safe_size - pad * 2
    cell_w = inner_w / cols
    cell_h = inner_h / rows

    # Font size: start from user input, fallback to a proportion.
    try:
        target_font_size = int(font_size)
    except Exception:
        target_font_size = int(safe_size * 0.42)
    target_font_size = max(8, min(target_font_size, safe_size * 4))
    min_font_size = 8

    def _load_font(sz: int):
        if font_path:
            try:
                return ImageFont.truetype(font_path, sz)
            except Exception:
                pass
        return ImageFont.load_default()

    def _text_bbox(font, s: str):
        try:
            l, t, r, b = draw.textbbox((0, 0), s, font=font)
            return l, t, r, b
        except Exception:
            w, h = draw.textsize(s, font=font)
            return 0, 0, w, h

    def _fits_grid(font_obj):
        max_char_w = 0
        max_char_h = 0
        bboxes = []
        for ch in lines:
            l, t, r, b = _text_bbox(font_obj, ch)
            bboxes.append((l, t, r, b))
            max_char_w = max(max_char_w, r - l)
            max_char_h = max(max_char_h, b - t)

        # Keep some padding inside each cell.
        limit_w = cell_w * 0.90
        limit_h = cell_h * 0.90
        return max_char_w <= limit_w and max_char_h <= limit_h, bboxes

    font = _load_font(target_font_size)
    ok, cell_bboxes = _fits_grid(font)
    while not ok and target_font_size > min_font_size:
        target_font_size = max(min_font_size, target_font_size - 2)
        font = _load_font(target_font_size)
        ok, cell_bboxes = _fits_grid(font)

    text_color = (255, 255, 255, 255)

    for i, ch in enumerate(lines):
        row = i // cols
        col = i % cols

        l, t, r, b = cell_bboxes[i]
        tw = r - l
        th = b - t

        cx = pad + col * cell_w + cell_w / 2
        cy = pad + row * cell_h + cell_h / 2
        x = int(cx - tw / 2) - l
        y = int(cy - th / 2) - t

        draw.text((x, y), ch, font=font, fill=text_color)

    if safe_corner_radius > 0:
        mask = Image.new("L", (safe_size, safe_size), 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.rounded_rectangle(
            (0, 0, safe_size - 1, safe_size - 1),
            radius=safe_corner_radius,
            fill=255,
        )
        canvas.putalpha(mask)

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode('utf-8')


@app.post('/icon-maker')
@app.post('/api/icon-maker')
async def icon_maker(
    image: UploadFile = File(None),
    text: str = Form(...),
    size: int = Form(100),
    bg_color: str = Form("blue"),
    corner_radius: int = Form(0),
    font_size: int = Form(50),
):

    try:
        file_content = await image.read() if image else None
        loop = asyncio.get_event_loop()
        icon_b64 = await loop.run_in_executor(None, create_icon_image, file_content, text, size, bg_color, corner_radius, font_size)

        if not icon_b64:
            raise HTTPException(status_code=500, detail='Failed to generate icon')

        return {
            'success': True,
            'icon': f'data:image/png;base64,{icon_b64}',
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post('/cover-maker')
async def cover_maker(
    image: UploadFile = File(...), 
    title: str = Form(...), 
    style: str = Form("money_yellow"),
    focus_x: float = Form(0.5),
    focus_y: float = Form(0.5),
    font_size: int = Form(140)
):
    """
    制作封面 API
    """
    if not image:
        raise HTTPException(status_code=400, detail='No image file provided')
    
    try:
        # Read image
        file_content = await image.read()
        
        # Process concurrently
        loop = asyncio.get_event_loop()
        
        focus_point = (focus_x, focus_y)
        
        # Generate 9:16
        cover_9_16 = await loop.run_in_executor(None, create_cover_image, file_content, title, style, (9, 16), focus_point, font_size)
        
        # Generate 16:9
        cover_16_9 = await loop.run_in_executor(None, create_cover_image, file_content, title, style, (16, 9), focus_point, font_size)
        
        if not cover_9_16 or not cover_16_9:
             raise HTTPException(status_code=500, detail='Failed to generate covers')

        return {
            'success': True,
            'cover_9_16': f'data:image/png;base64,{cover_9_16}',
            'cover_16_9': f'data:image/png;base64,{cover_16_9}'
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post('/upload')
async def upload_file_endpoint(image: UploadFile = File(...)):
    """
    单独上传图片接口，返回 ComfyUI 中的文件名
    """
    try:
        filename, subfolder = await upload_image(image)
        return {"success": True, "filename": filename, "subfolder": subfolder}
    except requests.exceptions.ConnectionError:
        msg = f"无法连接到 ComfyUI 服务 ({COMFYUI_SERVER_ADDRESS})，请确认服务已启动。"
        print(msg)
        raise HTTPException(status_code=502, detail=msg)
    except Exception as e:
        print(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def clear_comfyui_queue():
    """清除 ComfyUI 队列"""
    try:
        await asyncio.to_thread(requests.post, "http://{}/queue".format(COMFYUI_SERVER_ADDRESS), json={"clear": True}, timeout=5)
        print("WS: 已发送清除队列请求给 ComfyUI")
    except Exception as e:
        print(f"WS: 清除队列失败: {e}")

async def interrupt_comfyui():
    """发送中断信号给 ComfyUI"""
    try:
        # 1. 先清除队列，防止排队的任务（可能是刚提交的）执行
        await clear_comfyui_queue()
        
        # 2. 发送中断信号，停止当前正在执行的任务
        await asyncio.to_thread(requests.post, "http://{}/interrupt".format(COMFYUI_SERVER_ADDRESS), timeout=5)
        
        # 3. Double Tap 策略：等待一小段时间再次发送中断，防止竞态条件 (e.g. 任务刚好在清除队列和第一次中断之间开始)
        await asyncio.sleep(0.5)
        await asyncio.to_thread(requests.post, "http://{}/interrupt".format(COMFYUI_SERVER_ADDRESS), timeout=5)
        
        # 4. 释放显存：通知 ComfyUI 卸载模型
        try:
            await asyncio.to_thread(requests.post, "http://{}/free".format(COMFYUI_SERVER_ADDRESS), json={"unload_models": True, "free_memory": True}, timeout=5)
            print("WS: 已发送释放显存请求给 ComfyUI")
        except Exception as e:
            print(f"WS: 发送释放显存请求失败 (忽略): {e}")

        print("WS: 已发送清除队列、中断信号和释放显存请求给 ComfyUI")
    except Exception as e:
        print(f"WS: 发送中断信号失败: {e}")

@app.post("/interrupt")
async def interrupt_endpoint():
    """
    前端主动调用中断接口
    """
    print("API: 收到前端中断请求")
    await interrupt_comfyui()
    return {"status": "ok", "message": "Interruption signal sent"}

@app.websocket("/ws/photo-restore")
async def websocket_photo_restore(client_ws: WebSocket):
    print(f"WS: 收到连接请求")
    await client_ws.accept()
    print(f"WS: 连接已接受")
    try:
        await client_ws.send_json({"type": "status", "message": "后端已连接"})
    except:
        pass

    ws_comfy = None
    prompt_id = None
    task_completed = False

    try:
        # 1. 接收初始化参数
        print(f"WS: 等待接收初始化参数...")
        try:
            data = await client_ws.receive_json()
            print(f"WS: 收到参数: {data}")
        except Exception as e:
            print(f"WS: 接收参数失败: {e}")
            return

        input_filename = data.get("filename")
        enable_watermark = data.get("enable_watermark", False)
        watermark_text = data.get("watermark_text", "样片确认")

        if not input_filename:
            print(f"WS: 缺少 filename 参数")
            await client_ws.send_json({"type": "error", "message": "缺少 filename 参数"})
            await asyncio.sleep(0.5)
            return

        # 2. 构建工作流
        print(f"WS: 正在构建工作流...")
        try:
            await client_ws.send_json({"type": "status", "message": "正在准备工作流..."})
            workflow = build_photo_restore_workflow(input_filename)
            print(f"WS: 工作流构建成功")
        except Exception as e:
            print(f"WS: 工作流构建失败: {e}")
            await client_ws.send_json({"type": "error", "message": f"工作流构建错误: {str(e)}"})
            await asyncio.sleep(0.5)
            return

        # 3. 连接 ComfyUI WebSocket
        print(f"WS: 正在连接 ComfyUI ({COMFYUI_SERVER_ADDRESS})...")
        try:
            await client_ws.send_json({"type": "status", "message": "正在连接 AI 引擎..."})
            # 设置超时
            ws_comfy = websocket.WebSocket()
            await asyncio.to_thread(ws_comfy.connect, "ws://{}/ws?clientId={}".format(COMFYUI_SERVER_ADDRESS, CLIENT_ID), timeout=10)
            print(f"WS: ComfyUI 连接成功")
        except ConnectionRefusedError:
            error_msg = f"无法连接到 ComfyUI 服务 ({COMFYUI_SERVER_ADDRESS})，请确认服务已启动。"
            print(f"WS Error: {error_msg}")
            await client_ws.send_json({"type": "error", "message": error_msg})
            await asyncio.sleep(0.5)
            return
        except Exception as e:
            error_msg = f"连接 ComfyUI 失败: {str(e)}"
            print(f"WS Error: {error_msg}")
            await client_ws.send_json({"type": "error", "message": error_msg})
            await asyncio.sleep(0.5)
            return

        # 4. 提交任务
        print(f"WS: 正在提交任务...")
        try:
            # 提交前再次检查 WebSocket 连接状态，并给一点时间让事件循环处理潜在的中断
            if client_ws.client_state != WebSocketState.CONNECTED:
                 print(f"WS: 客户端已断开，取消提交任务")
                 return
            
            # 双重检查：尝试发送一个 ping，如果失败说明断开了
            try:
                await client_ws.send_json({"type": "ping"})
            except:
                print(f"WS: 客户端无法达，取消提交任务")
                return

            await asyncio.sleep(0.1)

            await client_ws.send_json({"type": "status", "message": "正在提交任务..."})
            prompt_response = await queue_prompt(workflow)
            prompt_id = prompt_response['prompt_id']
            print(f"WS: 任务已提交, prompt_id: {prompt_id}")
            await client_ws.send_json({"type": "info", "message": "任务已排队", "prompt_id": prompt_id})
        except Exception as e:
            print(f"WS: 提交任务失败: {e}")
            await client_ws.send_json({"type": "error", "message": f"提交任务错误: {str(e)}"})
            await asyncio.sleep(0.5)
            return

        # 5. 监听进度并转发
        print(f"WS: 开始监听 ComfyUI 进度...")
        last_ping = time.time()
        
        while True:
            # 检查是否需要发送心跳 (每 2 秒，加快检测客户端断开)
            if time.time() - last_ping > 2:
                try:
                    await client_ws.send_json({"type": "ping"})
                    last_ping = time.time()
                except Exception as e:
                    print(f"WS: 发送心跳失败 (客户端可能已断开): {e}")
                    break

            try:
                # 使用较短的超时，以便能定期检查 client_ws 连接状态
                # 注意：ws_comfy.recv 是阻塞的，必须放到线程中执行，否则会阻塞整个事件循环
                ws_comfy.settimeout(1.0) 
                out = await asyncio.to_thread(ws_comfy.recv)
                
                if isinstance(out, str):
                    message = json.loads(out)
                    msg_type = message.get('type')
                    msg_data = message.get('data', {})
                    
                    if msg_type == 'progress':
                        # 增加调试日志
                        print(f"WS Debug: 收到进度消息 data={msg_data}")
                        # 统一转换为字符串进行比较，防止类型不一致
                        if str(msg_data.get('prompt_id')) == str(prompt_id):
                            value = msg_data.get('value', 0)
                            max_val = msg_data.get('max', 1)
                            percent = int((value / max_val) * 100)
                            # 收到进度也视为一种心跳
                            last_ping = time.time()
                            print(f"WS: 转发进度 {percent}% (value={value}, max={max_val})")
                            await client_ws.send_json({
                                "type": "progress", 
                                "value": value, 
                                "max": max_val, 
                                "percent": percent
                            })

                    elif msg_type == 'execution_start':
                        # 统一转换为字符串进行比较
                        if str(msg_data.get('prompt_id')) == str(prompt_id):
                            print(f"WS: ComfyUI 开始执行")
                            last_ping = time.time()
                            await client_ws.send_json({"type": "status", "message": "正在处理中..."})

                    elif msg_type == 'executing':
                        # 统一转换为字符串进行比较
                        if msg_data.get('node') is None and str(msg_data.get('prompt_id')) == str(prompt_id):
                            # 任务完成
                            print(f"WS: ComfyUI 执行完成")
                            task_completed = True
                            await client_ws.send_json({"type": "status", "message": "处理完成，正在获取结果..."})
                            break
                else:
                    continue
            except websocket.WebSocketTimeoutException:
                # ComfyUI 读取超时，循环继续，这将触发下一次心跳检查
                await asyncio.sleep(0.01) 
                continue
            except Exception as e:
                # 可能是 client_ws.send_json 失败，也可能是 ws_comfy.recv 失败
                print(f"WS: 通信循环异常: {e}")
                # 如果是发送给客户端失败，说明客户端断开了
                # 如果是 ComfyUI 断开，也需要退出
                break
        
        # 循环结束
        if not task_completed:
            print("WS: 任务未完成，循环结束 (可能客户端断开)")
            if prompt_id:
                print(f"WS: 尝试中断 ComfyUI 任务: {prompt_id}")
                await interrupt_comfyui()
            return

        # 6. 获取结果
        print(f"WS: 正在获取结果历史...")
        try:
            history = (await get_history(prompt_id))[prompt_id]
            outputs = history['outputs']
            output_images = []
            
            for node_id in outputs:
                node_output = outputs[node_id]
                if 'images' in node_output:
                    for image in node_output['images']:
                        image_data = await get_image(image['filename'], image['subfolder'], image['type'])
                        output_images.append(image_data)
            
            if not output_images:
                print(f"WS: 未找到输出图片")
                await client_ws.send_json({"type": "error", "message": "未生成任何图片"})
                return

            print(f"WS: 获取到 {len(output_images)} 张图片，正在处理...")
            result_data = output_images[-1]
            clean_base64 = base64.b64encode(result_data).decode('utf-8')
            
            final_response = {
                "type": "complete",
                "image_data": f'data:image/png;base64,{clean_base64}',
                "watermarked_image_data": None
            }

            # 处理水印
            if enable_watermark:
                print(f"WS: 正在添加水印...")
                # add_watermark 是 CPU 密集型操作，放入线程池
                watermarked_raw = await asyncio.to_thread(add_watermark, result_data, watermark_text)
                if watermarked_raw:
                    wm_base64 = base64.b64encode(watermarked_raw).decode('utf-8')
                    final_response['watermarked_image_data'] = f'data:image/png;base64,{wm_base64}'
            
            print(f"WS: 发送最终结果")
            await client_ws.send_json(final_response)

        except Exception as e:
            print(f"WS: 获取结果/处理图片失败: {e}")
            import traceback
            traceback.print_exc()
            await client_ws.send_json({"type": "error", "message": f"结果处理错误: {str(e)}"})

    except Exception as e:
        # 忽略连接关闭错误
        if isinstance(e, (ConnectionClosedOK, ConnectionClosedError, ConnectionClosed)):
            print(f"WS: 连接已关闭 ({type(e).__name__})")
            return

        print(f"WebSocket 顶层异常: {e}")
        import traceback
        traceback.print_exc()
        try:
            await client_ws.send_json({"type": "error", "message": str(e)})
        except:
            pass
    finally:
        print(f"WS: 连接关闭清理")
        # 双重保险：如果任务未完成 (或者循环异常退出)，确保发送中断信号
        # 只要没有明确标记完成，就尝试中断，宁可错杀不可放过
        if not task_completed:
            print(f"WS: 检测到任务未完成 (finally)，发送中断信号。Prompt ID: {prompt_id}")
            await interrupt_comfyui()

        if ws_comfy:
            try:
                ws_comfy.close()
            except:
                pass
        try:
            await client_ws.close()
        except:
            pass

if __name__ == '__main__':
    import uvicorn
    print(f"Server starting on port 5000...")
    print(f"Target ComfyUI: {COMFYUI_SERVER_ADDRESS}")
    uvicorn.run(app, host='0.0.0.0', port=5000)
