"""
图片流水线：按风格/分类/数量排队依次文生图，可公开到主站 Images 墙。

输出目录：output/images/{date}_{title}/
"""
from __future__ import annotations

import asyncio
import json
import random
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import shutil

import requests
from fastapi import File, Form, HTTPException, UploadFile
from PIL import Image

from output_layout import (
    alloc_under,
    ensure_reserved_dirs,
    folder_public_key,
    list_task_dirs,
    rel_to_root,
    resolve_task_dir,
)

if not hasattr(Image, "ANTIALIAS"):
    Image.ANTIALIAS = Image.Resampling.LANCZOS

_IMAGE_PIPE_TASKS: Dict[str, dict] = {}

_STYLES: Dict[str, Dict[str, str]] = {
    "realistic": {
        "label": "写实摄影",
        "suffix": "photorealistic, cinematic lighting, high detail, natural colors",
    },
    "cartoon": {
        "label": "卡通",
        "suffix": "stylized cartoon illustration, clean outlines, vibrant flat colors",
    },
    "anime": {
        "label": "二次元",
        "suffix": "anime style, cel shading, clean lineart, expressive lighting",
    },
    "ink": {
        "label": "水墨",
        "suffix": "Chinese ink wash painting, expressive brushwork, soft paper texture",
    },
    "watercolor": {
        "label": "水彩",
        "suffix": "watercolor painting, soft washes, paper grain, delicate edges",
    },
    "oil": {
        "label": "油画",
        "suffix": "oil painting, visible brush strokes, rich pigments, gallery lighting",
    },
    "cyberpunk": {
        "label": "赛博朋克",
        "suffix": "cyberpunk aesthetic, neon lights, rainy night city, high contrast",
    },
    "flat": {
        "label": "扁平插画",
        "suffix": "flat vector illustration, minimal shapes, bold color blocks",
    },
}

_CATEGORIES: Dict[str, Dict[str, str]] = {
    "landscape": {"label": "风景", "hint": "natural or urban landscape scenery"},
    "character": {"label": "人物", "hint": "character portrait or full-body figure"},
    "product": {"label": "产品", "hint": "product showcase on clean or lifestyle background"},
    "food": {"label": "美食", "hint": "appetizing food photography or illustration"},
    "animal": {"label": "动物", "hint": "animal subject, natural pose"},
    "architecture": {"label": "建筑", "hint": "architecture exterior or interior"},
    "abstract": {"label": "抽象", "hint": "abstract composition, shapes and color"},
    "poster": {"label": "海报构图", "hint": "poster-like composition, strong focal subject"},
    "wallpaper": {"label": "壁纸", "hint": "wallpaper-friendly composition, balanced empty space"},
    "other": {"label": "其他", "hint": "general illustration"},
}

_ASPECTS: Dict[str, Dict[str, Any]] = {
    # size 仅作比例参考；实际像素由 size_tier 的长边决定
    "1_1": {"label": "方形 1:1", "size": (1024, 1024)},
    "16_9": {"label": "横屏 16:9", "size": (1280, 720)},
    "9_16": {"label": "竖屏 9:16", "size": (720, 1280)},
    "3_4": {"label": "竖图 3:4", "size": (768, 1024)},
    "4_3": {"label": "横图 4:3", "size": (1024, 768)},
}

_SIZE_TIERS: Dict[str, Dict[str, Any]] = {
    "sm": {"label": "更低（512）", "long_edge": 512},
    "sd": {"label": "标清（768）", "long_edge": 768},
    "hd": {"label": "高清（1024）", "long_edge": 1024},
    "xl": {"label": "更大（1280）", "long_edge": 1280},
    "custom": {"label": "自定义长边", "long_edge": 768},
}

_SIZE_LONG_EDGE_MIN = 512
_SIZE_LONG_EDGE_MAX = 1280  # 与 Z-Image 工作流侧边上限一致


def _round8(n: int) -> int:
    n = int(n)
    return max(_SIZE_LONG_EDGE_MIN, int(round(n / 8.0) * 8))


def _clamp_long_edge(n: int) -> int:
    n = max(_SIZE_LONG_EDGE_MIN, min(_SIZE_LONG_EDGE_MAX, int(n)))
    return max(_SIZE_LONG_EDGE_MIN, min(_SIZE_LONG_EDGE_MAX, int(round(n / 8.0) * 8)))


def _resolve_wh(aspect_key: str, size_tier: str, long_edge_override: Optional[int] = None) -> tuple:
    """按画幅比例 + 档位长边计算宽高（对齐 8 像素）。"""
    aspect = _ASPECTS.get(aspect_key) or _ASPECTS["1_1"]
    tier = _SIZE_TIERS.get(size_tier) or _SIZE_TIERS["sm"]
    aw, ah = aspect["size"]
    if long_edge_override is not None:
        long_edge = _clamp_long_edge(long_edge_override)
    else:
        long_edge = _clamp_long_edge(int(tier.get("long_edge") or _SIZE_LONG_EDGE_MIN))
    aw = max(1, int(aw))
    ah = max(1, int(ah))
    if aw >= ah:
        w = _round8(long_edge)
        h = _round8(int(round(long_edge * ah / aw)))
    else:
        h = _round8(long_edge)
        w = _round8(int(round(long_edge * aw / ah)))
    return w, h


def _image_meta_from_bytes(img_bytes: bytes) -> Dict[str, int]:
    """原图像素与体积（非缩略图）。"""
    meta = {"width": 0, "height": 0, "bytes": len(img_bytes or b"")}
    if not img_bytes:
        return meta
    try:
        from io import BytesIO

        with Image.open(BytesIO(img_bytes)) as im:
            meta["width"] = int(im.width or 0)
            meta["height"] = int(im.height or 0)
    except Exception:
        pass
    return meta


_VARIATION_HINTS = [
    "换一个更近的机位与构图",
    "改为清晨柔光氛围",
    "改为黄昏暖色光影",
    "主体略偏左侧，留白更明显",
    "主体略偏右侧，景深更浅",
    "天气更晴朗，对比更强",
    "增加前景层次与细节",
    "更远全景，强调环境关系",
    "低角度仰拍",
    "高角度俯拍",
    "夜景霓虹或灯火",
    "极简干净背景",
]


def _safe_slug(text: str, fallback: str = "batch") -> str:
    s = re.sub(r"[^\w\u4e00-\u9fff\-]+", "_", (text or "").strip(), flags=re.UNICODE)
    s = re.sub(r"_+", "_", s).strip("._")
    if not s:
        s = fallback
    return s[:48]


def _now_ts_ms() -> int:
    return int(time.time() * 1000)


def _cn_now_str() -> str:
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S") + "Z"


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


def _parse_manual_prompts(raw: str) -> List[str]:
    lines = []
    for ln in (raw or "").splitlines():
        s = ln.strip()
        if not s:
            continue
        # 允许 "1. xxx" / "- xxx"
        s = re.sub(r"^[\d]+[\.\)、]\s*", "", s)
        s = re.sub(r"^[-*•]\s*", "", s)
        if s:
            lines.append(s)
    return lines


def _rule_vary_prompts(theme: str, style_key: str, category_key: str, count: int) -> List[str]:
    style = _STYLES.get(style_key) or _STYLES["realistic"]
    cat = _CATEGORIES.get(category_key) or _CATEGORIES["other"]
    base = (theme or "").strip() or cat["label"]
    out: List[str] = []
    for i in range(count):
        hint = _VARIATION_HINTS[i % len(_VARIATION_HINTS)]
        out.append(
            f"{base}，分类：{cat['label']}，画风：{style['label']}。"
            f"画面要求：{cat['hint']}；变化：{hint}。"
            f"{style['suffix']}"
        )
    return out


def deepseek_image_batch_prompts(
    *,
    theme: str,
    style_key: str,
    category_key: str,
    count: int,
    extra: str,
    api_key: str,
    api_url: str,
) -> Optional[List[str]]:
    if not api_key or count < 1:
        return None
    style = _STYLES.get(style_key) or _STYLES["realistic"]
    cat = _CATEGORIES.get(category_key) or _CATEGORIES["other"]
    extra_s = (extra or "").strip()
    user_prompt = f"""你是文生图提示词专家。用户要批量生成 {count} 张同主题、同画风、同分类的图片，需彼此有构图/光影/角度差异，避免几乎重复。

【主题】{(theme or '').strip()}
【分类】{cat['label']}（{cat['hint']}）
【画风】{style['label']}；英文风格词可参考：{style['suffix']}
【补充要求】{extra_s or '无'}

请严格输出 JSON 对象，仅含字段 "prompts"：字符串数组，长度必须等于 {count}。
每条是中文为主的正向提示词（可少量英文质量词），要求：
1. 紧扣主题与分类，画面具体可画：主体、环境、光影、氛围、构图。
2. {count} 条之间明显变化（机位、时段、天气、景别、左右构图等），不要只改一两个词。
3. 禁止要求画面内文字、字幕、Logo、水印、二维码。
4. 单条约 60～180 字；写实类避免崩坏肢体；二次元/卡通按对应画风写。
只输出 JSON，不要 markdown。"""

    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    data = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "你是一个只输出合法 JSON 的助手。"},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.55,
        "response_format": {"type": "json_object"},
    }
    for attempt in range(2):
        try:
            resp = requests.post(api_url, headers=headers, json=data, timeout=120)
            if resp.status_code != 200:
                if resp.status_code >= 500 and attempt == 0:
                    time.sleep(2)
                    continue
                return None
            body = resp.json() or {}
            content = (((body.get("choices") or [{}])[0].get("message") or {}).get("content")) or ""
            content = content.strip()
            if content.startswith("```"):
                content = re.sub(r"^```(?:json)?\s*", "", content)
                content = re.sub(r"\s*```$", "", content)
            parsed = json.loads(content)
            prompts = parsed.get("prompts") if isinstance(parsed, dict) else None
            if not isinstance(prompts, list):
                return None
            cleaned = [str(p).strip() for p in prompts if str(p).strip()]
            if len(cleaned) < count:
                return None
            return cleaned[:count]
        except Exception:
            if attempt == 0:
                time.sleep(2)
                continue
            return None
    return None


class ImagePipelineAPI:
    def __init__(self, output_root: Path, **deps):
        self.deps = deps
        self.deps["output_root"] = Path(output_root)
        self.tasks = _IMAGE_PIPE_TASKS

    def _log(self, task: dict, msg: str) -> None:
        line = f"[{_cn_now_str()}] {msg}"
        logs = task.setdefault("logs", [])
        logs.append(line)
        if len(logs) > 400:
            del logs[:-400]
        # 落盘：任务目录 pipeline.log（「打开输出目录」可直接看到）
        try:
            d = self._task_dir(task)
            with open(d / "pipeline.log", "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass

    def _ensure_log_file(self, task: dict) -> None:
        """历史批次若只有内存 logs，补写 pipeline.log。"""
        try:
            logs = task.get("logs") or []
            if not logs:
                return
            d = self._task_dir(task)
            p = d / "pipeline.log"
            if p.is_file() and p.stat().st_size > 0:
                return
            p.write_text("\n".join(str(x) for x in logs) + "\n", encoding="utf-8")
        except Exception:
            pass

    def _public_url(self, task: dict, rel: str) -> str:
        folder = (task.get("output_dir") or "").strip() or task["task_id"]
        rel_n = str(rel).replace("\\", "/").lstrip("/")
        return f"/output/{folder}/{rel_n}"

    def _thumb_rel_for(self, image_file: str) -> str:
        """images/01.png -> images/01.thumb.jpg"""
        rel = (image_file or "").replace("\\", "/").lstrip("/")
        if not rel:
            return ""
        p = Path(rel)
        return str(p.with_name(p.stem + ".thumb.jpg")).replace("\\", "/")

    def _ensure_thumb_bytes(self, png_bytes: bytes, thumb_path: Path, *, max_side: int = 480) -> bool:
        try:
            from io import BytesIO

            with Image.open(BytesIO(png_bytes)) as im:
                im = im.convert("RGB")
                im.thumbnail((int(max_side), int(max_side)), Image.Resampling.LANCZOS)
                thumb_path.parent.mkdir(parents=True, exist_ok=True)
                im.save(thumb_path, format="JPEG", quality=82, optimize=True)
            return thumb_path.is_file()
        except Exception:
            return False

    def _ensure_thumb_file(self, task: dict, image_file: str, *, max_side: int = 480) -> str:
        """按需生成缩略图，返回 thumb 相对路径（相对任务目录）；失败返回原图 file。"""
        file_rel = (image_file or "").replace("\\", "/").lstrip("/")
        if not file_rel:
            return ""
        task_dir = self._task_dir(task)
        src = task_dir / file_rel
        if not src.is_file():
            return file_rel
        thumb_rel = self._thumb_rel_for(file_rel)
        thumb = task_dir / thumb_rel
        try:
            if thumb.is_file() and thumb.stat().st_mtime >= src.stat().st_mtime:
                return thumb_rel
            with Image.open(src) as im:
                im = im.convert("RGB")
                im.thumbnail((int(max_side), int(max_side)), Image.Resampling.LANCZOS)
                thumb.parent.mkdir(parents=True, exist_ok=True)
                im.save(thumb, format="JPEG", quality=82, optimize=True)
            return thumb_rel
        except Exception:
            return file_rel

    def _enrich_image_urls(self, task: dict) -> None:
        images = task.get("images") or []
        task_dir = self._task_dir(task)
        for it in images:
            if not isinstance(it, dict) or not it.get("file"):
                continue
            file_rel = str(it["file"]).replace("\\", "/").lstrip("/")
            it["url"] = self._public_url(task, file_rel)
            thumb_rel = self._ensure_thumb_file(task, file_rel)
            it["thumb_file"] = thumb_rel
            it["thumb_url"] = self._public_url(task, thumb_rel) if thumb_rel else it["url"]
            # 补全原图分辨率 / 体积（历史批次可能缺字段）
            src = task_dir / file_rel
            if src.is_file():
                try:
                    if not it.get("bytes"):
                        it["bytes"] = int(src.stat().st_size)
                except Exception:
                    pass
                if not (it.get("width") and it.get("height")):
                    try:
                        with Image.open(src) as im:
                            it["width"] = int(im.width or 0)
                            it["height"] = int(im.height or 0)
                    except Exception:
                        pass

    def _task_dir(self, task: dict) -> Path:
        root: Path = self.deps["output_root"]
        folder = (task.get("output_dir") or "").strip()
        if folder:
            resolved = resolve_task_dir(root, folder)
            if resolved is not None:
                resolved.mkdir(parents=True, exist_ok=True)
                return resolved
        d = root / "images" / (folder or task["task_id"])
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _save_snapshot(self, task: dict) -> None:
        try:
            d = self._task_dir(task)
            snap = {k: v for k, v in task.items() if k != "cancel"}
            (d / "task.json").write_text(
                json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except Exception:
            pass

    def _index_path(self) -> Path:
        root: Path = self.deps["output_root"]
        p = root / "images" / "_task_index.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def _index_task(self, task_id: str, task_dir: Path) -> None:
        tid = (task_id or "").strip()
        if not tid:
            return
        root: Path = self.deps["output_root"]
        idx_path = self._index_path()
        data: Dict[str, str] = {}
        if idx_path.exists():
            try:
                raw = json.loads(idx_path.read_text(encoding="utf-8"))
                if isinstance(raw, dict):
                    data = {str(k): str(v) for k, v in raw.items()}
            except Exception:
                data = {}
        data[tid] = rel_to_root(root, task_dir)
        try:
            idx_path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except Exception:
            pass

    def _unindex_task(self, task_id: str) -> None:
        tid = (task_id or "").strip()
        if not tid:
            return
        idx_path = self._index_path()
        if not idx_path.exists():
            return
        try:
            raw = json.loads(idx_path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                return
            if tid not in raw:
                return
            raw.pop(tid, None)
            idx_path.write_text(
                json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except Exception:
            pass

    def _attach_ref_url(self, task: dict) -> None:
        rel = str(task.get("ref_file") or "").replace("\\", "/").lstrip("/")
        if not rel:
            task.pop("ref_url", None)
            return
        task["ref_url"] = self._public_url(task, rel)

    def _lookup_indexed_dir(self, task_id: str) -> Optional[Path]:
        tid = (task_id or "").strip()
        if not tid:
            return None
        root: Path = self.deps["output_root"]
        idx_path = self._index_path()
        if not idx_path.exists():
            return None
        try:
            raw = json.loads(idx_path.read_text(encoding="utf-8"))
            rel = (raw or {}).get(tid)
            if not rel:
                return None
            return resolve_task_dir(root, str(rel))
        except Exception:
            return None

    def _load_task_from_dir(self, key: str) -> dict:
        root: Path = self.deps["output_root"]
        d = resolve_task_dir(root, key)
        if d is None:
            d = self._lookup_indexed_dir(key)
        if d is None or not d.is_dir():
            raise FileNotFoundError("找不到该批次目录")
        tj = d / "task.json"
        if not tj.exists():
            raise FileNotFoundError("目录缺少 task.json")
        meta = json.loads(tj.read_text(encoding="utf-8"))
        if not isinstance(meta, dict):
            raise ValueError("task.json 无效")
        meta["output_dir"] = rel_to_root(root, d)
        meta.setdefault("task_id", meta.get("task_id") or "")
        self._enrich_image_urls(meta)
        self._attach_ref_url(meta)
        self._ensure_log_file(meta)
        # 回写 thumb 字段，下次打开更快
        try:
            (d / "task.json").write_text(
                json.dumps(
                    {k: v for k, v in meta.items() if k != "cancel"},
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
        except Exception:
            pass
        return meta

    def _lock_subject_extra(self, task: dict, extra: str) -> str:
        if not task.get("lock_subject"):
            return (extra or "").strip()
        lock_hint = (
            "锁定主体：保持与参考图同一人物/主体的外貌特征一致"
            "（脸型、发型、年龄感、服装基调），姿态、表情、场景与构图可变化"
        )
        base = (extra or "").strip()
        if not base:
            return lock_hint
        if lock_hint in base:
            return base
        return f"{base}；{lock_hint}"

    def _apply_lock_to_prompts(self, task: dict, prompts: List[str]) -> List[str]:
        if not task.get("lock_subject"):
            return prompts
        tag = "同一人物与参考图外貌一致"
        out: List[str] = []
        for p in prompts:
            s = (p or "").strip()
            if tag not in s:
                s = f"{s}，{tag}" if s else tag
            out.append(s)
        return out

    async def _plan_prompts(self, task: dict) -> List[str]:
        mode = (task.get("prompt_mode") or "auto").strip().lower()
        count = int(task.get("count") or 1)
        theme = (task.get("theme") or "").strip()
        style_key = task.get("style") or "realistic"
        category_key = task.get("category") or "other"
        extra = self._lock_subject_extra(task, (task.get("extra") or "").strip())
        manual = (task.get("manual_prompts") or "").strip()

        if mode == "manual":
            lines = _parse_manual_prompts(manual)
            if not lines:
                raise RuntimeError("手动模式请每行一条提示词")
            prompts = lines[:count] if count > 0 else lines
            if len(prompts) < count:
                # 不够则循环补齐
                while len(prompts) < count:
                    prompts.append(lines[len(prompts) % len(lines)])
            task["plan_source"] = "manual"
            return self._apply_lock_to_prompts(task, prompts)

        if mode == "theme_vary":
            task["plan_source"] = "rule"
            prompts = _rule_vary_prompts(theme, style_key, category_key, count)
            if extra:
                prompts = [f"{p}。{extra}" for p in prompts]
            return self._apply_lock_to_prompts(task, prompts)

        # auto → DeepSeek，失败回退规则
        self._log(task, f"规划 {count} 条提示词（DeepSeek）…")
        key_fn = self.deps.get("repo_deepseek_api_key")
        api_key = key_fn() if callable(key_fn) else ""
        api_url = self.deps.get("deepseek_api_url") or "https://api.deepseek.com/chat/completions"
        prompts = None
        if api_key:
            prompts = await asyncio.to_thread(
                deepseek_image_batch_prompts,
                theme=theme,
                style_key=style_key,
                category_key=category_key,
                count=count,
                extra=extra,
                api_key=api_key,
                api_url=api_url,
            )
        if prompts:
            task["plan_source"] = "deepseek"
            self._log(task, "DeepSeek 提示词就绪")
            return self._apply_lock_to_prompts(task, prompts)
        self._log(task, "DeepSeek 不可用，改用规则变化提示词")
        task["plan_source"] = "rule"
        prompts = _rule_vary_prompts(theme, style_key, category_key, count)
        if extra:
            prompts = [f"{p}。{extra}" for p in prompts]
        return self._apply_lock_to_prompts(task, prompts)

    async def _run_task(self, task_id: str) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        build_wf = self.deps["build_z_image_workflow"]
        build_i2i = self.deps.get("build_z_image_img2img_workflow")
        build_qwen = self.deps.get("build_qwen_img2img_workflow")
        upload_bytes = self.deps.get("upload_image_bytes")
        run_img = self.deps["run_comfyui_and_get_last_image"]
        neg_fn = self.deps.get("default_txt2img_negative")
        no_text = self.deps.get("image_no_text_prefix") or ""
        free_mem = self.deps.get("free_comfyui_memory")

        try:
            task["status"] = "running"
            task["stage"] = "plan"
            task["progress"] = {"current": 0, "total": int(task.get("count") or 1)}
            self._save_snapshot(task)

            prompts = await self._plan_prompts(task)
            task["prompts"] = prompts
            task["progress"] = {"current": 0, "total": len(prompts)}
            self._save_snapshot(task)

            tier_k = task.get("size_tier") or "sm"
            long_edge_ov = task.get("size_long_edge")
            try:
                long_edge_ov = int(long_edge_ov) if long_edge_ov is not None else None
            except Exception:
                long_edge_ov = None
            w, h = _resolve_wh(task.get("aspect") or "1_1", tier_k, long_edge_ov)
            task["gen_width"] = w
            task["gen_height"] = h
            style = _STYLES.get(task.get("style") or "realistic") or _STYLES["realistic"]
            user_neg = (task.get("negative") or "").strip()
            neg = neg_fn(user_neg, width=w, height=h) if callable(neg_fn) else user_neg
            seed_base = task.get("seed_base")
            out_dir = self._task_dir(task)
            img_dir = out_dir / "images"
            img_dir.mkdir(parents=True, exist_ok=True)
            images: List[dict] = []
            task["images"] = images
            task["stage"] = "generate"
            batch_t0 = time.perf_counter()
            gen_total = 0.0
            tier_note = f"{tier_k}" + (f" long={long_edge_ov}" if long_edge_ov is not None else "")
            self._log(task, f"目标分辨率 {w}×{h}（{tier_note}）")

            lock = bool(task.get("lock_subject"))
            lock_engine = str(task.get("lock_engine") or "qwen").strip().lower()
            if lock_engine in ("z", "z-image", "z_image_turbo", "turbo"):
                lock_engine = "z_image"
            if lock_engine not in ("qwen", "z_image"):
                lock_engine = "qwen"
            task["lock_engine"] = lock_engine if lock else None

            denoise = 0.55
            try:
                denoise = float(task.get("denoise") if task.get("denoise") is not None else 0.55)
            except Exception:
                denoise = 0.55
            denoise = max(0.35, min(0.85, denoise))
            if lock and lock_engine == "z_image":
                task["denoise"] = denoise
            elif lock:
                task["denoise"] = None

            comfy_ref_name = None
            if lock:
                ref_rel = str(task.get("ref_file") or "").replace("\\", "/").lstrip("/")
                ref_path = out_dir / ref_rel if ref_rel else None
                if not ref_path or not ref_path.is_file():
                    raise RuntimeError("锁定主体需要有效的参考图")
                if not callable(upload_bytes):
                    raise RuntimeError("upload_image_bytes 未注入，无法锁定主体")
                if lock_engine == "qwen" and not callable(build_qwen):
                    raise RuntimeError("Qwen 改图工作流未注入")
                if lock_engine == "z_image" and not callable(build_i2i):
                    raise RuntimeError("Z-Image 图生图工作流未注入")
                ref_bytes = ref_path.read_bytes()
                uploaded = await upload_bytes(ref_bytes, name_prefix="ip_ref_")
                if isinstance(uploaded, (tuple, list)):
                    comfy_ref_name = uploaded[0]
                else:
                    comfy_ref_name = uploaded
                if not comfy_ref_name:
                    raise RuntimeError("参考图上传到 ComfyUI 失败")
                if lock_engine == "qwen":
                    self._log(task, "锁定主体：Qwen 指令改图（推荐，更稳同人）")
                else:
                    self._log(
                        task,
                        f"锁定主体：Z-Image 图生图（z_image_turbo_img2img，denoise={denoise:.2f}）",
                    )

            for i, prompt in enumerate(prompts):
                if task.get("cancel"):
                    task["status"] = "cancelled"
                    task["stage"] = "cancelled"
                    self._log(task, "用户取消")
                    self._save_snapshot(task)
                    return
                full_prompt = (no_text + (prompt or "").strip()).strip()
                if style.get("suffix") and style["suffix"] not in full_prompt:
                    full_prompt = f"{full_prompt}, {style['suffix']}"
                if seed_base is None:
                    seed = random.randint(1, 2**31 - 1)
                else:
                    seed = int(seed_base) + i
                if lock and lock_engine == "qwen":
                    mode_tag = "qwen_edit"
                elif lock:
                    mode_tag = f"z_img2img denoise={denoise:.2f}"
                else:
                    mode_tag = "txt2img"
                self._log(task, f"生成 {i + 1}/{len(prompts)}（{mode_tag}，seed={seed}）…")
                task["progress"] = {"current": i, "total": len(prompts)}
                self._save_snapshot(task)

                t0 = time.perf_counter()
                used_engine = "z_image_turbo"
                if lock:
                    img_bytes = None
                    if lock_engine == "qwen":
                        qwen_prompt = (
                            "Edit this image. Keep the SAME person/subject identity from the reference "
                            "(face, hair, age feel, clothing style). Change pose, expression, scene and "
                            f"composition as described: {(prompt or '').strip()}. "
                            "Photorealistic if the reference is photo-like. No text, no watermark, no logo."
                        )
                        try:
                            wf = build_qwen(qwen_prompt, comfy_ref_name, seed=seed, quality="standard")
                            img_bytes = await run_img(wf)
                            used_engine = "qwen_edit"
                        except Exception as e:
                            self._log(task, f"Qwen 改图失败，回退 Z-Image 图生图：{e}")
                            if not callable(build_i2i):
                                raise
                            wf = build_i2i(
                                full_prompt,
                                comfy_ref_name,
                                negative_text=neg,
                                seed=seed,
                                denoise=denoise,
                                megapixels=1.0,
                            )
                            img_bytes = await run_img(wf)
                            used_engine = "z_image_img2img"
                    else:
                        wf = build_i2i(
                            full_prompt,
                            comfy_ref_name,
                            negative_text=neg,
                            seed=seed,
                            denoise=denoise,
                            megapixels=1.0,
                        )
                        img_bytes = await run_img(wf)
                        used_engine = "z_image_img2img"
                else:
                    wf = build_wf(full_prompt, seed=seed, width=w, height=h, negative_text=neg)
                    img_bytes = await run_img(wf)
                    used_engine = "z_image_turbo"
                elapsed = time.perf_counter() - t0
                gen_total += elapsed
                if not img_bytes:
                    raise RuntimeError(f"第 {i + 1} 张未返回图像")
                name = f"{i + 1:02d}.png"
                path = img_dir / name
                path.write_bytes(img_bytes)
                thumb_name = f"{i + 1:02d}.thumb.jpg"
                thumb_path = img_dir / thumb_name
                thumb_ok = self._ensure_thumb_bytes(img_bytes, thumb_path)
                thumb_file = f"images/{thumb_name}" if thumb_ok else f"images/{name}"
                meta = _image_meta_from_bytes(img_bytes)
                out_w = meta["width"] or w
                out_h = meta["height"] or h
                item = {
                    "index": i + 1,
                    "file": f"images/{name}",
                    "thumb_file": thumb_file,
                    "url": self._public_url(task, f"images/{name}"),
                    "thumb_url": self._public_url(task, thumb_file),
                    "prompt": prompt,
                    "seed": seed,
                    "width": out_w,
                    "height": out_h,
                    "bytes": meta["bytes"],
                    "elapsed_sec": round(elapsed, 2),
                    "published": False,
                    "engine": used_engine,
                }
                images.append(item)
                self._log(
                    task,
                    f"第 {i + 1}/{len(prompts)} 张完成，{out_w}×{out_h} · "
                    f"{meta['bytes']}B，耗时 {_format_elapsed(elapsed)}",
                )
                task["progress"] = {"current": i + 1, "total": len(prompts)}
                self._save_snapshot(task)
                if callable(free_mem) and i + 1 < len(prompts):
                    try:
                        await free_mem()
                    except Exception:
                        pass

            batch_elapsed = time.perf_counter() - batch_t0
            task["status"] = "done"
            task["stage"] = "done"
            task["finished_at"] = _cn_now_str()
            task["timing"] = {
                "generate_sec": round(gen_total, 2),
                "batch_sec": round(batch_elapsed, 2),
            }
            self._log(
                task,
                f"完成，共 {len(images)} 张；生图合计 {_format_elapsed(gen_total)}，"
                f"本批总耗时 {_format_elapsed(batch_elapsed)}",
            )
            self._save_snapshot(task)
        except Exception as e:
            task["status"] = "error"
            task["stage"] = "error"
            task["error"] = str(e)[:500]
            self._log(task, f"失败：{e}")
            self._save_snapshot(task)

    def register(self, app) -> None:
        api = self

        @app.get("/image-pipeline/defaults")
        @app.get("/api/image-pipeline/defaults")
        async def ip_defaults():
            return {
                "success": True,
                "styles": {k: v["label"] for k, v in _STYLES.items()},
                "categories": {k: v["label"] for k, v in _CATEGORIES.items()},
                "aspects": {k: v["label"] for k, v in _ASPECTS.items()},
                "size_tiers": {k: v["label"] for k, v in _SIZE_TIERS.items()},
                "size_tier_default": "sm",
                "size_long_edge_min": _SIZE_LONG_EDGE_MIN,
                "size_long_edge_max": _SIZE_LONG_EDGE_MAX,
                "prompt_modes": {
                    "auto": "自动扩写（推荐）",
                    "theme_vary": "主题规则变化",
                    "manual": "手动多行提示词",
                },
                "max_count": 24,
                "denoise_default": 0.55,
                "denoise_min": 0.35,
                "denoise_max": 0.85,
                "lock_engines": {
                    "qwen": "Qwen 指令改图（推荐）",
                    "z_image": "Z-Image 图生图",
                },
                "lock_engine_default": "qwen",
            }

        @app.post("/image-pipeline/start")
        @app.post("/api/image-pipeline/start")
        async def ip_start(
            title: str = Form(""),
            theme: str = Form(...),
            style: str = Form("realistic"),
            category: str = Form("other"),
            count: str = Form("4"),
            aspect: str = Form("1_1"),
            size_tier: str = Form("sm"),
            size_long_edge: str = Form(""),
            prompt_mode: str = Form("auto"),
            extra: str = Form(""),
            negative: str = Form(""),
            manual_prompts: str = Form(""),
            seed: str = Form(""),
            denoise: str = Form("0.55"),
            lock_subject: str = Form("0"),
            lock_engine: str = Form("qwen"),
            ref_image: Optional[UploadFile] = File(None),
        ):
            theme_s = (theme or "").strip()
            if len(theme_s) < 2:
                raise HTTPException(status_code=400, detail="请填写主题描述")
            style_k = (style or "realistic").strip().lower()
            if style_k not in _STYLES:
                style_k = "realistic"
            cat_k = (category or "other").strip().lower()
            if cat_k not in _CATEGORIES:
                cat_k = "other"
            aspect_k = (aspect or "1_1").strip()
            if aspect_k not in _ASPECTS:
                aspect_k = "1_1"
            tier_k = (size_tier or "sm").strip().lower()
            if tier_k not in _SIZE_TIERS:
                tier_k = "sm"
            long_edge_v: Optional[int] = None
            if tier_k == "custom":
                raw_le = (size_long_edge or "").strip()
                try:
                    long_edge_v = _clamp_long_edge(int(raw_le or _SIZE_TIERS["custom"]["long_edge"]))
                except Exception:
                    long_edge_v = _clamp_long_edge(int(_SIZE_TIERS["custom"]["long_edge"]))
            mode = (prompt_mode or "auto").strip().lower()
            if mode not in ("auto", "theme_vary", "manual"):
                mode = "auto"
            try:
                n = max(1, min(24, int(count or 4)))
            except Exception:
                n = 4
            if mode == "manual":
                lines = _parse_manual_prompts(manual_prompts)
                if not lines:
                    raise HTTPException(status_code=400, detail="手动模式请每行一条提示词")
                n = max(1, min(24, len(lines) if not str(count or "").strip() else n))
            seed_base = None
            seed_raw = (seed or "").strip()
            if seed_raw:
                try:
                    seed_base = int(seed_raw)
                except Exception:
                    raise HTTPException(status_code=400, detail="种子须为整数")

            lock_flag = str(lock_subject or "").strip().lower() in ("1", "true", "yes", "on")
            ref_bytes = None
            if ref_image is not None and getattr(ref_image, "filename", None):
                try:
                    ref_bytes = await ref_image.read()
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"读取参考图失败：{e}") from e
            if ref_bytes:
                lock_flag = True
            if lock_flag and not ref_bytes:
                raise HTTPException(status_code=400, detail="锁定主体请上传一张参考图")

            denoise_v = 0.55
            try:
                denoise_v = float(denoise or 0.55)
            except Exception:
                denoise_v = 0.55
            denoise_v = max(0.35, min(0.85, denoise_v))

            eng = str(lock_engine or "qwen").strip().lower()
            if eng in ("z", "z-image", "z_image_turbo", "turbo"):
                eng = "z_image"
            if eng not in ("qwen", "z_image"):
                eng = "qwen"
            if not lock_flag:
                eng = "qwen"

            title_s = (title or "").strip() or theme_s[:20]
            root: Path = api.deps["output_root"]
            ensure_reserved_dirs(root)
            stamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
            folder = alloc_under(root, "images", f"{stamp}_{_safe_slug(title_s)}")
            task_dir = root / folder
            task_dir.mkdir(parents=True, exist_ok=True)

            ref_file = ""
            if lock_flag and ref_bytes:
                ref_dir = task_dir / "ref"
                ref_dir.mkdir(parents=True, exist_ok=True)
                # 统一存 JPEG，便于预览与再次上传 Comfy
                try:
                    from io import BytesIO

                    with Image.open(BytesIO(ref_bytes)) as im:
                        im = im.convert("RGB")
                        im.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
                        out_path = ref_dir / "source.jpg"
                        im.save(out_path, format="JPEG", quality=90, optimize=True)
                    ref_file = "ref/source.jpg"
                except Exception:
                    # 原样落盘
                    raw_name = Path(str(ref_image.filename or "source.bin")).name
                    ext = Path(raw_name).suffix.lower() or ".bin"
                    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
                        ext = ".bin"
                    out_path = ref_dir / f"source{ext}"
                    out_path.write_bytes(ref_bytes)
                    ref_file = f"ref/{out_path.name}"

            task_id = uuid.uuid4().hex
            task = {
                "task_id": task_id,
                "title": title_s,
                "theme": theme_s,
                "style": style_k,
                "style_label": _STYLES[style_k]["label"],
                "category": cat_k,
                "category_label": _CATEGORIES[cat_k]["label"],
                "count": n,
                "aspect": aspect_k,
                "size_tier": tier_k,
                "size_tier_label": _SIZE_TIERS[tier_k]["label"],
                "size_long_edge": long_edge_v,
                "gen_width": _resolve_wh(aspect_k, tier_k, long_edge_v)[0],
                "gen_height": _resolve_wh(aspect_k, tier_k, long_edge_v)[1],
                "prompt_mode": mode,
                "extra": (extra or "").strip(),
                "negative": (negative or "").strip(),
                "manual_prompts": (manual_prompts or "").strip(),
                "seed_base": seed_base,
                "lock_subject": bool(lock_flag),
                "lock_engine": eng if lock_flag else None,
                "denoise": denoise_v if (lock_flag and eng == "z_image") else None,
                "ref_file": ref_file,
                "output_dir": folder,
                "status": "queued",
                "stage": "init",
                "created_at": _cn_now_str(),
                "progress": {"current": 0, "total": n},
                "logs": [],
                "images": [],
                "prompts": [],
                "error": None,
                "cancel": False,
                "plan_source": "",
            }
            api._attach_ref_url(task)
            api.tasks[task_id] = task
            api._index_task(task_id, task_dir)
            lock_note = ""
            if lock_flag:
                lock_note = " · 锁定主体·Qwen" if eng == "qwen" else " · 锁定主体·Z-Image"
            gw, gh = task["gen_width"], task["gen_height"]
            api._log(
                task,
                f"批次已创建：{title_s} · {n} 张 · {_STYLES[style_k]['label']} · "
                f"{_CATEGORIES[cat_k]['label']} · {_SIZE_TIERS[tier_k]['label']} {gw}×{gh}{lock_note}",
            )
            api._save_snapshot(task)
            asyncio.create_task(api._run_task(task_id))
            return {"success": True, "task_id": task_id, "output_dir": folder}

        @app.get("/image-pipeline/status")
        @app.get("/api/image-pipeline/status")
        async def ip_status(task_id: str):
            tid = (task_id or "").strip()
            task = api.tasks.get(tid)
            if not task:
                try:
                    task = api._load_task_from_dir(tid)
                except Exception:
                    raise HTTPException(status_code=404, detail="任务不存在")
            else:
                need = any(
                    isinstance(it, dict) and it.get("file") and not it.get("thumb_url")
                    for it in (task.get("images") or [])
                )
                if need:
                    api._enrich_image_urls(task)
            api._attach_ref_url(task)
            out = {k: v for k, v in task.items() if k != "cancel"}
            return {"success": True, **out}

        @app.post("/image-pipeline/cancel")
        @app.post("/api/image-pipeline/cancel")
        async def ip_cancel(task_id: str = Form(...)):
            tid = (task_id or "").strip()
            task = api.tasks.get(tid)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在或已结束")
            task["cancel"] = True
            api._log(task, "收到取消请求…")
            return {"success": True}

        @app.post("/image-pipeline/delete-batch")
        @app.post("/api/image-pipeline/delete-batch")
        async def ip_delete_batch(task_id: str = Form(""), folder: str = Form("")):
            key = (folder or "").strip() or (task_id or "").strip()
            if not key:
                raise HTTPException(status_code=400, detail="缺少 task_id 或 folder")
            root: Path = api.deps["output_root"]
            images_root = (root / "images").resolve()
            try:
                task = api._load_task_from_dir(key)
            except FileNotFoundError as e:
                raise HTTPException(status_code=404, detail=str(e)) from e
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            tid = str(task.get("task_id") or "").strip()
            if tid and tid in api.tasks:
                api.tasks[tid]["cancel"] = True
            d = resolve_task_dir(root, task.get("output_dir") or key) or api._lookup_indexed_dir(
                tid or key
            )
            if d is None or not d.is_dir():
                raise HTTPException(status_code=404, detail="目录不存在")
            try:
                resolved = d.resolve()
                resolved.relative_to(images_root)
            except ValueError as e:
                raise HTTPException(status_code=400, detail="非法目录") from e
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"目录校验失败：{e}") from e
            shutil.rmtree(resolved, ignore_errors=True)
            if tid:
                api._unindex_task(tid)
                api.tasks.pop(tid, None)
            return {"success": True, "task_id": tid or None, "folder": rel_to_root(root, resolved)}

        @app.post("/image-pipeline/reveal-output")
        @app.post("/api/image-pipeline/reveal-output")
        async def ip_reveal(task_id: str = Form(""), folder: str = Form("")):
            import os
            import platform
            import subprocess

            root: Path = api.deps["output_root"]
            key = (folder or "").strip() or (task_id or "").strip()
            if not key:
                raise HTTPException(status_code=400, detail="缺少 task_id 或 folder")
            d = resolve_task_dir(root, key) or api._lookup_indexed_dir(key)
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

        @app.get("/image-pipeline/history")
        @app.get("/api/image-pipeline/history")
        async def ip_history(limit: int = 24):
            root: Path = api.deps["output_root"]
            dirs = list_task_dirs(root, "images", limit=limit)
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
                n_img = 0
                img_dir = p / "images"
                if img_dir.is_dir():
                    n_img = len([x for x in img_dir.iterdir() if x.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")])
                items.append(
                    {
                        "folder": folder,
                        "task_id": meta.get("task_id") or "",
                        "title": meta.get("title") or p.name,
                        "theme": (meta.get("theme") or "")[:80],
                        "style": meta.get("style") or "",
                        "category": meta.get("category") or "",
                        "status": meta.get("status") or "",
                        "count": meta.get("count") or n_img,
                        "image_count": n_img,
                        "lock_subject": bool(meta.get("lock_subject")),
                        "lock_engine": meta.get("lock_engine") or "",
                        "mtime": int(p.stat().st_mtime),
                    }
                )
            return {"success": True, "items": items}

        @app.post("/image-pipeline/open")
        @app.post("/api/image-pipeline/open")
        async def ip_open(folder: str = Form(""), task_id: str = Form("")):
            key = (folder or "").strip() or (task_id or "").strip()
            if not key:
                raise HTTPException(status_code=400, detail="请提供 folder 或 task_id")
            try:
                task = api._load_task_from_dir(key)
            except FileNotFoundError as e:
                raise HTTPException(status_code=404, detail=str(e))
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e))
            # 恢复到内存，便于继续 cancel/status
            tid = str(task.get("task_id") or "")
            if tid and tid not in api.tasks:
                api.tasks[tid] = dict(task)
                api.tasks[tid]["cancel"] = False
            return {"success": True, **task}

        @app.post("/image-pipeline/mark-published")
        @app.post("/api/image-pipeline/mark-published")
        async def ip_mark_published(
            task_id: str = Form(""),
            folder: str = Form(""),
            indices: str = Form(""),
        ):
            """前台公开成功后回写本地 task.json 的 published 标记。"""
            key = (folder or "").strip() or (task_id or "").strip()
            if not key:
                raise HTTPException(status_code=400, detail="缺少 task_id 或 folder")
            try:
                task = api._load_task_from_dir(key)
            except Exception as e:
                raise HTTPException(status_code=404, detail=str(e))
            want = set()
            for part in re.split(r"[,;\s]+", indices or ""):
                part = part.strip()
                if not part:
                    continue
                try:
                    want.add(int(part))
                except Exception:
                    pass
            images = task.get("images") or []
            for it in images:
                if not isinstance(it, dict):
                    continue
                idx = int(it.get("index") or 0)
                if not want or idx in want:
                    it["published"] = True
            tid = str(task.get("task_id") or "")
            if tid and tid in api.tasks:
                api.tasks[tid]["images"] = images
                api._save_snapshot(api.tasks[tid])
            else:
                # 仅磁盘
                root: Path = api.deps["output_root"]
                d = resolve_task_dir(root, task.get("output_dir") or key)
                if d:
                    try:
                        (d / "task.json").write_text(
                            json.dumps(task, ensure_ascii=False, indent=2), encoding="utf-8"
                        )
                    except Exception:
                        pass
            return {"success": True, "images": images}

        @app.post("/image-pipeline/delete-image")
        @app.post("/api/image-pipeline/delete-image")
        async def ip_delete_image(
            task_id: str = Form(""),
            folder: str = Form(""),
            index: str = Form(...),
        ):
            key = (folder or "").strip() or (task_id or "").strip()
            if not key:
                raise HTTPException(status_code=400, detail="缺少 task_id 或 folder")
            try:
                idx = int(index)
            except Exception as e:
                raise HTTPException(status_code=400, detail="index 无效") from e
            try:
                task = api._load_task_from_dir(key)
            except Exception as e:
                raise HTTPException(status_code=404, detail=str(e))
            images = [it for it in (task.get("images") or []) if isinstance(it, dict)]
            victim = None
            for it in images:
                if int(it.get("index") or 0) == idx:
                    victim = it
                    break
            if not victim:
                raise HTTPException(status_code=404, detail="找不到该图")
            task_dir = api._task_dir(task)
            for rel_key in ("file", "thumb_file"):
                rel = str(victim.get(rel_key) or "").replace("\\", "/").lstrip("/")
                if not rel:
                    continue
                p = task_dir / rel
                try:
                    if p.is_file():
                        p.unlink()
                except Exception:
                    pass
            images = [it for it in images if int(it.get("index") or 0) != idx]
            task["images"] = images
            task["count"] = len(images)
            api._log(task, f"已删除第 {idx} 张")
            tid = str(task.get("task_id") or "")
            if tid:
                api.tasks[tid] = dict(task)
                api.tasks[tid]["cancel"] = False
                api._save_snapshot(api.tasks[tid])
            else:
                api._save_snapshot(task)
            api._enrich_image_urls(task)
            return {"success": True, "series": None, **{k: v for k, v in task.items() if k != "cancel"}}
