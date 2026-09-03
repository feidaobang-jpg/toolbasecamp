"""
游戏图流水线：定妆/三视图 → 选主参考 → Wan 5B I2V 抽帧 → rembg → 对齐 → Godot 包。
"""
from __future__ import annotations

import asyncio
import io
import json
import random
import re
import shutil
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

from game_sprite_godot import (
    build_godot_pack,
    copy_into_godot_project,
    zip_project,
)
from game_sprite_postprocess import (
    pack_project_meta,
    process_animation_frames,
)
from output_layout import (
    alloc_under,
    ensure_reserved_dirs,
    list_task_dirs,
    rel_to_root,
    resolve_task_dir,
)

if not hasattr(Image, "ANTIALIAS"):
    Image.ANTIALIAS = Image.Resampling.LANCZOS

_GAME_SPRITE_TASKS: Dict[str, dict] = {}

_VISUAL_STYLES = {
    "pixel": {
        "label": "像素",
        "suffix": "pixel art game sprite, limited palette, crisp pixels, no anti-aliasing",
        "zh": "像素风游戏精灵，清晰像素",
    },
    "cartoon": {
        "label": "卡通",
        "suffix": "stylized cartoon game character sprite, clean outlines, flat colors",
        "zh": "卡通游戏角色，干净描边",
    },
    "anime": {
        "label": "二次元",
        "suffix": "anime game character sprite, cel shading, clean lineart",
        "zh": "二次元游戏角色，赛璐璐",
    },
    "handdrawn": {
        "label": "手绘",
        "suffix": "hand-drawn game sprite illustration, soft shading",
        "zh": "手绘游戏精灵",
    },
}

_ASSET_TYPES = {
    "character": {"label": "角色", "needs_actions": True},
    "monster": {"label": "小怪/精英/Boss", "needs_actions": True},
    "prop": {"label": "道具", "needs_actions": False},
    "building": {"label": "建筑", "needs_actions": False},
    "scene": {"label": "场景", "needs_actions": False},
}

_DEFAULT_ACTIONS = [
    "idle",
    "walk",
    "run",
    "jump",
    "fall",
    "attack",
    "attack2",
    "skill",
    "defend",
    "hit",
    "down",
    "getup",
    "death",
]

_OPTIONAL_ACTIONS = ["cast", "dodge", "climb", "swim", "emote"]

_ACTION_MOTIONS = {
    "idle": "subtle idle breathing, slight sway, feet planted, loopable idle pose",
    "walk": "side-view walk cycle, clear leg steps, arms swing, constant ground contact rhythm",
    "run": "side-view run cycle, faster stride, body lean forward, dynamic legs",
    "jump": "character jumps upward then peaks, legs tuck, arms lift",
    "fall": "character falling downward, limbs slightly spread, descending motion",
    "attack": "side-view melee attack swing, clear wind-up and strike, torso twist",
    "attack2": "alternate attack, strong follow-through slash or punch",
    "skill": "casting or special skill pose with glowing energy motion",
    "defend": "raise guard / block, shield or arms up, braced stance",
    "hit": "hit reaction, flinch backward, brief stun",
    "down": "collapse to the ground, lying down",
    "getup": "getting up from the ground back to standing",
    "death": "death collapse, final fall, then still",
    "cast": "spell cast gesture, hands forward, energy release",
    "dodge": "quick dodge roll or sidestep",
    "climb": "climbing upward motion",
    "swim": "swimming stroke side-view",
    "emote": "friendly wave or celebration emote",
}

_CANVAS_PRESETS = {
    "64": (64, 64),
    "128": (128, 128),
    "256": (256, 256),
    "512": (512, 512),
}


def _now_ms() -> int:
    return int(time.time() * 1000)


def _safe_slug(text: str, fallback: str = "char") -> str:
    s = "".join(c if c.isalnum() or c in "-_" else "_" for c in (text or "").strip())
    s = s.strip("_")[:48]
    return s or fallback


def _parse_actions(raw: str) -> List[str]:
    allowed = set(_DEFAULT_ACTIONS + _OPTIONAL_ACTIONS)
    items: List[str] = []
    s = (raw or "").strip()
    if not s:
        return ["idle"]
    if s.startswith("["):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                items = [str(x).strip().lower() for x in parsed]
        except Exception:
            items = []
    if not items:
        items = [x.strip().lower() for x in s.replace(";", ",").split(",") if x.strip()]
    out: List[str] = []
    seen = set()
    for a in items:
        if a in allowed and a not in seen:
            seen.add(a)
            out.append(a)
    return out or ["idle"]


def _style_suffix(style: str) -> str:
    m = _VISUAL_STYLES.get((style or "").strip().lower()) or _VISUAL_STYLES["cartoon"]
    return m["suffix"]


# Z-Image 无法可靠直出透明 PNG：统一绿幕，定妆后 rembg 成透明
_STILL_CHROMA = (
    "solid pure chroma-key green background #00FF00, flat even lighting, "
    "no gradients, no floor shadow, no environment, no studio gray"
)
_STILL_CHROMA_NEG = (
    "white background, black background, gray backdrop, studio gray, beige wall, "
    "photo studio, textured ground, scenery, perspective, dutch angle, "
    "foreshortening, three-quarter view, 3/4 view, dynamic pose, "
    "close-up bust only, cropped legs, multi-panel, collage, transparent background"
)
# 设定里常写「侧视横版」——生成正/背时必须剥掉，否则会压过视角指令
_VIEW_POISON_RE = re.compile(
    r"(?i)"
    r"(侧视|侧面|横版|正视|正面|背面|背视|三视图|正交|"
    r"side[\s\-]?view|side[\s\-]?scroll(?:er)?|profile view|"
    r"front[\s\-]?view|back[\s\-]?view|rear[\s\-]?view|"
    r"three[\s\-]?quarter|3[\s\/]?4[\s\-]?view|orthographic)"
)


def _brief_core_for_view(brief: str, view: str) -> str:
    core = (brief or "").strip() or "game character"
    if (view or "").strip().lower() in ("front", "back", "left", "right"):
        core = _VIEW_POISON_RE.sub(" ", core)
        core = re.sub(r"\s{2,}", " ", core).strip(" ,;，；") or "game character"
    return core


def _build_still_prompt(
    brief: str,
    *,
    asset_type: str,
    style: str,
    view: str = "side",
) -> str:
    """
    view:
      front / back — 设定对照（正交）
      side — 侧视定妆，动作图生视频只用这一张作主参考
      left / right — 可选侧面（当前默认不出）
      concept — 道具/建筑/场景
    """
    sty = _style_suffix(style)
    view_n = (view or "side").strip().lower()
    core = _brief_core_for_view(brief, view_n)
    if asset_type in ("prop", "building", "scene"):
        kind = {
            "prop": "game prop item icon/sprite",
            "building": "game building facade sprite",
            "scene": "game environment concept still",
        }.get(asset_type, "game asset")
        return (
            f"{kind}, {core}, {sty}, centered, full subject visible, {_STILL_CHROMA}, "
            "suitable for 2D game asset, high clarity"
        )

    view_specs = {
        "front": (
            "CAMERA LOCK: orthographic FRONT elevation only. "
            "Both eyes visible, both ears if any, both shoulders equal width, chest facing camera, "
            "symmetric A-pose, feet pointing at camera. "
            "Forbidden: profile, side silhouette, 3/4 turn, looking left/right, cape from the side."
        ),
        "back": (
            "CAMERA LOCK: orthographic BACK elevation only. "
            "Character faces directly away; show back of helmet/head, backplates, cape from behind. "
            "No face, no nose, no eyes. Symmetric A-pose matching a front turnaround. "
            "Forbidden: profile, side silhouette, 3/4 turn."
        ),
        "left": (
            "CAMERA LOCK: orthographic LEFT PROFILE, true 90-degree silhouette facing left, "
            "one eye max, A-pose. Forbidden: front, three-quarter."
        ),
        "right": (
            "CAMERA LOCK: orthographic RIGHT PROFILE, true 90-degree silhouette facing right, "
            "one eye max, A-pose. Forbidden: front, three-quarter."
        ),
        "side": (
            "CAMERA LOCK: 2D side-scroll sprite START FRAME, true RIGHT profile facing right, "
            "full-body idle standing, feet planted, clear silhouette for animation, side-view"
        ),
    }
    pose = view_specs.get(view_n) or view_specs["side"]
    # 视角指令放最前，避免被设定/风格词淹没
    return (
        f"{pose}. square 1:1 canvas, single character only, ONE camera angle only, "
        f"character design (ignore any camera words in design text): {core}, {sty}, "
        f"{_STILL_CHROMA}, full body head-to-toe centered, crisp game art turnaround sheet panel"
    )


def _normalize_still_count(raw: Any) -> int:
    """定妆张数：仅允许 1（侧视）或 3（正+背+侧）。旧值 2（曾表示两张侧视）视为 3。"""
    try:
        n = int(raw)
    except Exception:
        n = 3
    return 1 if n <= 1 else 3


def _character_still_jobs(
    brief: str, asset_type: str, style: str, still_count: int = 3
) -> List[Tuple[str, str]]:
    """
    still_count=1：仅侧视定妆（动作主参考，无需再选）。
    still_count=3：正面 + 背面 + 侧视定妆（动作仍用侧视）。
    """
    side_prompt = _build_still_prompt(brief, asset_type=asset_type, style=style, view="side")
    side_job = ("side_00", side_prompt)
    if _normalize_still_count(still_count) <= 1:
        return [side_job]
    return [
        ("front", _build_still_prompt(brief, asset_type=asset_type, style=style, view="front")),
        ("back", _build_still_prompt(brief, asset_type=asset_type, style=style, view="back")),
        side_job,
    ]


def _build_action_prompt(brief: str, action: str, style: str) -> str:
    motion = _ACTION_MOTIONS.get(action, f"perform {action} action")
    sty = _style_suffix(style)
    core = (brief or "").strip() or "same character"
    return (
        f"Use the provided start image as frame 1. Keep the exact same character design, outfit, "
        f"proportions, and side-view camera. {core}. Action: {action}. {motion}. "
        f"{sty}. Full body visible, feet on ground plane when applicable, "
        f"solid chroma-key green background #00FF00, "
        f"no camera cut, no morphing into different character, temporal continuity."
    )


def _frame_similarity(a: Image.Image, b: Image.Image) -> float:
    """简单均方误差相似度：1=相同，0=差很大（纯 PIL，无 numpy）。"""
    aa = a.convert("RGB").resize((48, 48), Image.Resampling.BILINEAR)
    bb = b.convert("RGB").resize((48, 48), Image.Resampling.BILINEAR)
    pa = list(aa.getdata())
    pb = list(bb.getdata())
    if not pa:
        return 1.0
    acc = 0.0
    for (r1, g1, b1), (r2, g2, b2) in zip(pa, pb):
        acc += (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2
    mse = acc / (len(pa) * 3.0)
    return 1.0 / (1.0 + mse / 100.0)


def extract_frames_from_video(
    video_path: Path,
    out_dir: Path,
    *,
    target_count: int = 8,
    dedupe_threshold: float = 0.985,
) -> List[Path]:
    """从视频均匀抽帧并去重，返回保存的 PNG 路径。"""
    from moviepy.editor import VideoFileClip

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    clip = VideoFileClip(str(video_path))
    try:
        dur = float(clip.duration or 0.1)
        n = max(2, min(48, int(target_count)))
        times = [dur * i / max(1, n - 1) for i in range(n)]
        kept: List[Image.Image] = []
        paths: List[Path] = []
        for t in times:
            t = min(max(0.0, t), max(0.0, dur - 0.001))
            arr = clip.get_frame(t)
            im = Image.fromarray(arr.astype("uint8")).convert("RGBA")
            if kept and _frame_similarity(kept[-1], im) >= dedupe_threshold:
                continue
            kept.append(im)
            p = out_dir / f"{len(paths):02d}_raw.png"
            im.save(p, "PNG")
            paths.append(p)
        if not paths and kept:
            p = out_dir / "00_raw.png"
            kept[0].save(p, "PNG")
            paths.append(p)
        return paths
    finally:
        try:
            clip.close()
        except Exception:
            pass


def _length_for_sec(duration_sec: float, fps: int = 24) -> int:
    frames = int(round(float(duration_sec) * float(fps)))
    length = max(17, min(241, frames))
    if (length - 1) % 4 != 0:
        length = ((length - 1) // 4) * 4 + 1
    return length


class GameSpriteAPI:
    def __init__(self, **deps: Any):
        self.deps = deps
        self.tasks = _GAME_SPRITE_TASKS

    def _log(self, task: dict, msg: str) -> None:
        logs = task.get("logs")
        if not isinstance(logs, list):
            logs = []
            task["logs"] = logs
        logs.append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

    def _alloc_dir(self, char_id: str) -> str:
        root: Path = self.deps["output_root"]
        ensure_reserved_dirs(root)
        base = datetime.now().strftime("%Y-%m-%d_%H-%M") + f"_gs_{char_id}"
        return alloc_under(root, "game_sprites", base)

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

    def _load_task_from_dir(self, folder_or_id: str) -> dict:
        root: Path = self.deps["output_root"]
        d = resolve_task_dir(root, folder_or_id)
        if d is None:
            d = self._lookup_indexed_dir(folder_or_id)
        if d is None:
            # try match by task_id inside task.json under game_sprites + legacy
            needle = (folder_or_id or "").strip()
            for p in list_task_dirs(
                root,
                "game_sprites",
                legacy_pred=lambda x: "_gs_" in x.name,
                limit=120,
            ):
                tj = p / "task.json"
                if not tj.exists():
                    continue
                try:
                    meta = json.loads(tj.read_text(encoding="utf-8"))
                except Exception:
                    continue
                if str(meta.get("task_id") or "") == needle:
                    d = p
                    break
        if d is None or not d.is_dir():
            raise FileNotFoundError("历史任务目录不存在（可能已删除）")
        tj = d / "task.json"
        if not tj.exists():
            raise FileNotFoundError("缺少 task.json，无法重开")
        meta = json.loads(tj.read_text(encoding="utf-8"))
        if not isinstance(meta, dict):
            raise ValueError("task.json 无效")
        rel = rel_to_root(root, d)
        meta["output_dir"] = rel
        tid = str(meta.get("task_id") or "").strip() or uuid.uuid4().hex
        meta["task_id"] = tid
        meta["cancel"] = False
        # 刷新公开 URL（目录可能迁过）
        stills = []
        for s in meta.get("stills_ui") or []:
            if not isinstance(s, dict):
                continue
            path = s.get("path") or ""
            kind = s.get("kind") or ""
            if kind == "upload" or str(s.get("id") or "").startswith("upload_"):
                url = self._public_url(meta, f"uploads/{Path(path).name}")
            else:
                url = self._public_url(meta, f"stills/{Path(path).name}")
            s2 = dict(s)
            s2["url"] = url
            stills.append(s2)
        meta["stills_ui"] = stills
        # 重启后不能恢复进行中的后台协程
        st = str(meta.get("status") or "").strip()
        if st in ("running", "queued"):
            if stills:
                meta["status"] = "waiting_pick"
                meta["stage"] = "pick"
                logs = meta.get("logs")
                if not isinstance(logs, list):
                    logs = []
                    meta["logs"] = logs
                logs.append(
                    f"[{datetime.now().strftime('%H:%M:%S')}] 服务已重启：定妆进度已从磁盘恢复，请继续选图"
                )
            else:
                meta["status"] = "failed"
                meta["error"] = "服务重启后任务中断，请重新生成定妆"
        anim = meta.get("animations_meta") or {}
        if anim:
            self.tasks[tid] = meta
            try:
                self._finalize_preview(meta)
            except Exception:
                pass
        else:
            meta.setdefault("preview", [])
        meta["status"] = meta.get("status") or "done"
        self.tasks[tid] = meta
        self._save_task_snapshot(meta)
        return meta

    def _public_url(self, task: dict, rel: str) -> str:
        folder = (task.get("output_dir") or "").strip() or task["task_id"]
        rel_n = str(rel).replace("\\", "/").lstrip("/")
        return f"/output/{folder}/{rel_n}"

    def _index_path(self) -> Path:
        root: Path = self.deps["output_root"]
        p = root / "game_sprites" / "_task_index.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def _index_task(self, task_id: Optional[str], task_dir: Path) -> None:
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
        except Exception:
            return None
        if not isinstance(raw, dict):
            return None
        rel = str(raw.get(tid) or "").strip()
        if not rel:
            return None
        return resolve_task_dir(root, rel)

    def _save_task_snapshot(self, task: dict) -> None:
        try:
            d = self._task_dir(task)
            snap = {
                k: v
                for k, v in task.items()
                if k not in ("cancel",)
            }
            (d / "task.json").write_text(
                json.dumps(snap, ensure_ascii=False, indent=2, default=str),
                encoding="utf-8",
            )
            self._index_task(task.get("task_id"), d)
        except Exception:
            pass

    async def _free_vram(self) -> None:
        fn = self.deps.get("free_comfyui_memory")
        if fn:
            try:
                await fn()
            except Exception:
                pass

    async def _txt2img(
        self, prompt: str, width: int, height: int, *, extra_negative: str = ""
    ) -> bytes:
        build = self.deps["build_z_image_workflow"]
        run = self.deps["run_comfyui_and_get_last_image"]
        neg_fn = self.deps.get("default_txt2img_negative")
        prefix = self.deps.get("image_no_text_prefix") or ""
        neg = neg_fn("", width=width, height=height) if callable(neg_fn) else ""
        extra = (extra_negative or "").strip()
        if extra:
            neg = f"{neg}, {extra}" if neg else extra
        wf = build(
            prefix + prompt,
            seed=random.randint(1, 2_000_000_000),
            width=width,
            height=height,
            negative_text=neg or None,
        )
        return await run(wf)

    async def _rembg(self, image_bytes: bytes) -> bytes:
        upload = self.deps["upload_image_bytes"]
        build_rembg = self.deps["build_rembg_workflow"]
        run = self.deps["run_comfyui_and_get_last_image"]
        fname, _sub = await upload(image_bytes, name_prefix="gs_rembg_")
        wf = build_rembg(fname)
        return await run(wf)

    async def _i2v(self, image_bytes: bytes, prompt: str, duration_sec: float) -> bytes:
        upload = self.deps["upload_image_bytes"]
        build = self.deps["build_wan22_ti2v_5b_workflow"]
        run_v = self.deps["run_comfyui_and_get_last_video"]
        fname, _sub = await upload(image_bytes, name_prefix="gs_i2v_")
        # 16GB 友好：约 480 短边侧视
        w, h = 640, 480
        length = _length_for_sec(duration_sec, 24)
        wf = build(
            fname,
            prompt,
            negative_text=(
                "morphing face, different character, extra limbs, text, watermark, "
                "camera cut, scene change, blurry, low quality"
            ),
            seed=random.randint(1, 2_000_000_000),
            width=w,
            height=h,
            length=length,
            fps=24,
        )
        return await run_v(wf, timeout_sec=max(600.0, duration_sec * 180))

    async def _run_stills(self, task_id: str) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        try:
            task["status"] = "running"
            task["stage"] = "stills"
            self._log(task, "开始生成定妆/概念图…")
            d = self._task_dir(task)
            stills_dir = d / "stills"
            stills_dir.mkdir(parents=True, exist_ok=True)
            asset_type = task["asset_type"]
            style = task["visual_style"]
            brief = task["brief"]
            still_count = _normalize_still_count(task.get("still_count", task.get("candidates")))
            task["still_count"] = still_count
            task["candidates"] = still_count  # 兼容旧前端字段名
            # 正方形画布，方便网格预览与正交参考
            gen_w, gen_h = 768, 768
            # 绿幕 + 正交负面（透视/3/4）
            extra_neg = _STILL_CHROMA_NEG
            prompts: List[Tuple[str, str]] = []
            if asset_type in ("character", "monster"):
                prompts = _character_still_jobs(brief, asset_type, style, still_count)
            else:
                prompts.append(
                    (
                        "concept",
                        _build_still_prompt(
                            brief, asset_type=asset_type, style=style, view="side"
                        ),
                    )
                )

            ui: List[dict] = []
            total = len(prompts)
            done = 0
            task["stills_ui"] = []
            for kind, prompt in prompts:
                if task.get("cancel"):
                    task["status"] = "cancelled"
                    self._log(task, "已取消")
                    self._save_task_snapshot(task)
                    return
                done += 1
                task["progress"] = {"current": done - 1, "total": total}
                self._log(task, f"文生图 {kind} ({done}/{total})…")
                img = await self._txt2img(
                    prompt,
                    gen_w,
                    gen_h,
                    extra_negative=(
                        extra_neg
                        + (
                            ", side view, profile silhouette, looking sideways, cape from the side"
                            if kind in ("front", "back")
                            else ""
                        )
                    ),
                )
                # 先留绿幕原图，再 rembg 成透明 PNG 给预览/选图
                raw_name = f"{kind}_raw.png"
                (stills_dir / raw_name).write_bytes(img)
                self._log(task, f"去背景 {kind}…")
                try:
                    img = await self._rembg(img)
                    await self._free_vram()
                except Exception as rembg_err:
                    self._log(task, f"去背景失败（保留绿幕）: {rembg_err}")
                name = f"{kind}.png"
                path = stills_dir / name
                path.write_bytes(img)
                # 保存提示词便于排查
                try:
                    (stills_dir / f"{kind}.txt").write_text(prompt, encoding="utf-8")
                except Exception:
                    pass
                item = {
                    "id": kind,
                    "kind": kind,
                    "url": self._public_url(task, f"stills/{name}")
                    + f"?t={int(time.time() * 1000)}",
                    "path": name,
                    "prompt": prompt[:240],
                }
                ui.append(item)
                # 每出一张就推给前端轮询显示
                task["stills_ui"] = list(ui)
                task["progress"] = {"current": done, "total": total}
                task["stage"] = "stills"
                self._log(task, f"已出图 {kind}（{done}/{total}）")
                self._save_task_snapshot(task)
                await self._free_vram()

            task["stills_ui"] = ui
            task["progress"] = {"current": total, "total": total}

            # 仅 1 张：自动选用，跳过选图
            if len(ui) == 1:
                task["picked_ref"] = ui[0]
                task["stage"] = "actions"
                task["status"] = "running"
                self._log(task, "仅 1 张定妆，已自动选用，开始后续流程…")
                self._save_task_snapshot(task)
                asyncio.create_task(self._run_actions(task_id))
                return

            # 三视图：默认勾选侧视，仍等待确认（正/背可对照）
            side_pick = next(
                (x for x in ui if str(x.get("id") or "").startswith("side_")),
                ui[-1],
            )
            task["picked_ref"] = side_pick
            task["stage"] = "pick"
            task["status"] = "waiting_pick"
            self._log(
                task,
                f"已生成 {total} 张参考（正面/背面/侧视定妆）。动作请确认「侧视定妆」后继续",
            )
            self._save_task_snapshot(task)
        except Exception as e:
            task["status"] = "failed"
            task["error"] = str(e)
            self._log(task, f"定妆失败: {e}")
            self._save_task_snapshot(task)

    async def _process_still_asset(self, task: dict) -> None:
        """道具/建筑/场景：选图后 rembg + 对齐即可导出。"""
        d = self._task_dir(task)
        pick = task.get("picked_ref") or {}
        rel = pick.get("path") or ""
        src = d / "stills" / rel
        if not src.exists():
            # upload
            up = d / "uploads" / rel
            src = up if up.exists() else src
        if not src.exists():
            raise FileNotFoundError("主参考图不存在")
        self._log(task, "去背景…")
        rembg_bytes = await self._rembg(src.read_bytes())
        raw_dir = d / "raw_frames" / "idle"
        raw_dir.mkdir(parents=True, exist_ok=True)
        raw_path = raw_dir / "00_raw.png"
        raw_path.write_bytes(rembg_bytes)
        cw, ch = task["canvas"]
        meta = process_animation_frames(
            [raw_path],
            d,
            "idle",
            canvas_w=cw,
            canvas_h=ch,
            fps=int(task.get("fps") or 8),
            pixel_art=bool(task.get("pixel_art")),
        )
        pack_project_meta(
            d,
            task["char_id"],
            {"idle": meta},
            canvas_w=cw,
            canvas_h=ch,
            fps=int(task.get("fps") or 8),
            pixel_art=bool(task.get("pixel_art")),
        )
        task["animations_meta"] = {"idle": meta}
        task["stage"] = "export"
        self._log(task, "静帧资产后处理完成，可导出 Godot ZIP")

    async def _run_one_action(self, task: dict, action: str) -> Dict[str, Any]:
        d = self._task_dir(task)
        pick = task.get("picked_ref") or {}
        rel = pick.get("path") or ""
        src = d / "stills" / rel
        if not src.exists():
            up = d / "uploads" / rel
            if up.exists():
                src = up
        if not src.exists():
            # 也可能是绝对 url 对应的已存文件
            ref_path = (pick.get("abs") or "").strip()
            if ref_path and Path(ref_path).exists():
                src = Path(ref_path)
        if not src.exists():
            raise FileNotFoundError(f"主参考图缺失，无法生成动作 {action}")

        # I2V 优先用绿幕原图（透明图易花边/穿帮）；展示用 rembg 透明版
        stem = Path(rel).stem if rel else ""
        raw_alt = d / "stills" / f"{stem}_raw.png" if stem else None
        i2v_src = raw_alt if raw_alt and raw_alt.exists() else src
        ref_bytes = i2v_src.read_bytes()
        prompt = _build_action_prompt(task["brief"], action, task["visual_style"])
        dur = float(task.get("action_duration_sec") or 2.5)
        target_frames = int(task.get("frames_per_action") or 8)

        self._log(task, f"[{action}] Wan 5B I2V…")
        video_bytes = await self._i2v(ref_bytes, prompt, dur)
        await self._free_vram()

        vid_dir = d / "videos"
        vid_dir.mkdir(parents=True, exist_ok=True)
        vid_path = vid_dir / f"{action}.mp4"
        vid_path.write_bytes(video_bytes)

        raw_dir = d / "raw_frames" / action
        if raw_dir.exists():
            shutil.rmtree(raw_dir)
        raw_paths = await asyncio.to_thread(
            extract_frames_from_video,
            vid_path,
            raw_dir,
            target_count=target_frames,
        )
        self._log(task, f"[{action}] 抽帧 {len(raw_paths)} 张，去背景…")

        rembg_paths: List[Path] = []
        rembg_dir = d / "rembg_frames" / action
        rembg_dir.mkdir(parents=True, exist_ok=True)
        for i, rp in enumerate(raw_paths):
            if task.get("cancel"):
                raise RuntimeError("cancelled")
            out_b = await self._rembg(rp.read_bytes())
            op = rembg_dir / f"{i:02d}.png"
            op.write_bytes(out_b)
            rembg_paths.append(op)
            await self._free_vram()

        cw, ch = task["canvas"]
        meta = await asyncio.to_thread(
            process_animation_frames,
            rembg_paths,
            d,
            action,
            canvas_w=cw,
            canvas_h=ch,
            fps=int(task.get("fps") or 8),
            pixel_art=bool(task.get("pixel_art")),
        )
        self._log(task, f"[{action}] 对齐完成，{meta['frames']} 帧")
        return meta

    async def _run_actions(self, task_id: str, actions: Optional[List[str]] = None) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        try:
            task["status"] = "running"
            task["stage"] = "actions"
            task["error"] = ""
            asset_type = task["asset_type"]
            needs = _ASSET_TYPES.get(asset_type, {}).get("needs_actions", True)

            if not needs:
                await self._process_still_asset(task)
                task["status"] = "done"
                self._finalize_preview(task)
                self._save_task_snapshot(task)
                return

            act_list = actions or list(task.get("actions") or _DEFAULT_ACTIONS)
            total = len(act_list)
            anim_metas: Dict[str, Any] = dict(task.get("animations_meta") or {})
            for i, action in enumerate(act_list):
                if task.get("cancel"):
                    task["status"] = "cancelled"
                    self._log(task, "已取消")
                    self._save_task_snapshot(task)
                    return
                task["progress"] = {"current": i, "total": total}
                task["current_action"] = action
                try:
                    meta = await self._run_one_action(task, action)
                    anim_metas[action] = meta
                    task["animations_meta"] = anim_metas
                    pack_project_meta(
                        self._task_dir(task),
                        task["char_id"],
                        anim_metas,
                        canvas_w=task["canvas"][0],
                        canvas_h=task["canvas"][1],
                        fps=int(task.get("fps") or 8),
                        pixel_art=bool(task.get("pixel_art")),
                    )
                    self._save_task_snapshot(task)
                except Exception as e:
                    self._log(task, f"[{action}] 失败: {e}")
                    task.setdefault("failed_actions", [])
                    if action not in task["failed_actions"]:
                        task["failed_actions"].append(action)

            task["progress"] = {"current": total, "total": total}
            task["stage"] = "export"
            task["status"] = "done" if anim_metas else "failed"
            if not anim_metas:
                task["error"] = "没有成功生成任何动作"
            else:
                self._log(task, f"动作完成：{len(anim_metas)} 个动画，可导出")
                self._finalize_preview(task)
            self._save_task_snapshot(task)
        except Exception as e:
            task["status"] = "failed"
            task["error"] = str(e)
            self._log(task, f"动作流水线失败: {e}")
            self._save_task_snapshot(task)

    def _finalize_preview(self, task: dict) -> None:
        d = self._task_dir(task)
        metas = task.get("animations_meta") or {}
        preview = []
        for anim, meta in metas.items():
            sheet = meta.get("sheet") or ""
            frames = []
            fdir = d / "frames" / anim
            if fdir.is_dir():
                for p in sorted(fdir.glob("*.png")):
                    frames.append(self._public_url(task, f"frames/{anim}/{p.name}"))
            preview.append(
                {
                    "anim": anim,
                    "sheet_url": self._public_url(task, sheet) if sheet else "",
                    "frames": frames,
                    "count": meta.get("frames") or len(frames),
                }
            )
        task["preview"] = preview
        # godot pack + zip
        try:
            pack = build_godot_pack(
                d,
                task["char_id"],
                canvas_w=task["canvas"][0],
                canvas_h=task["canvas"][1],
            )
            zip_name = f"{task['char_id']}_godot.zip"
            zpath = d / zip_name
            zip_project(d, zpath)
            task["godot"] = pack
            task["zip_url"] = self._public_url(task, zip_name)
            task["export_hint"] = (
                f"已生成 SpriteFrames 与 ZIP。解压到 Godot 工程后挂到 AnimatedSprite2D。"
            )
            self._log(task, f"导出包就绪: {zip_name}")
        except Exception as e:
            self._log(task, f"导出打包警告: {e}")

    def _ensure_task(self, task_id: str) -> dict:
        """内存优先；重启后按 task_id / 目录从 task.json 恢复。"""
        tid = (task_id or "").strip()
        if not tid:
            raise HTTPException(status_code=400, detail="缺少 task_id")
        task = self.tasks.get(tid)
        if task:
            return task
        try:
            return self._load_task_from_dir(tid)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e) or "任务不存在") from e
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"任务不存在: {e}") from e

    def register(self, app) -> None:
        api = self

        @app.post("/game-sprite/create")
        @app.post("/api/game-sprite/create")
        async def gs_create(
            brief: str = Form(...),
            char_name: str = Form(""),
            asset_type: str = Form("character"),
            visual_style: str = Form("cartoon"),
            canvas: str = Form("256"),
            fps: str = Form("8"),
            pixel_art: str = Form("0"),
            actions: str = Form(""),
            still_count: str = Form("3"),
            candidates: str = Form(""),
            frames_per_action: str = Form("8"),
            action_duration_sec: str = Form("2.5"),
        ):
            text = (brief or "").strip()
            if len(text) < 2:
                raise HTTPException(status_code=400, detail="请填写角色/资产设定")
            at = (asset_type or "character").strip().lower()
            if at not in _ASSET_TYPES:
                at = "character"
            style = (visual_style or "cartoon").strip().lower()
            if style not in _VISUAL_STYLES:
                style = "cartoon"
            if style == "pixel":
                pixel = True
            else:
                pixel = str(pixel_art or "0").strip().lower() not in ("0", "false", "no", "off")
            ckey = (canvas or "256").strip()
            cw, ch = _CANVAS_PRESETS.get(ckey, (256, 256))
            try:
                fps_i = max(4, min(24, int(fps or 8)))
            except Exception:
                fps_i = 8
            # still_count：1=仅侧视，3=三视图。兼容旧字段 candidates（2 归为 3）
            raw_count = (still_count or "").strip() or (candidates or "").strip() or "3"
            count_n = _normalize_still_count(raw_count)
            try:
                fpa = max(4, min(24, int(frames_per_action or 8)))
            except Exception:
                fpa = 8
            try:
                dur = max(1.5, min(5.0, float(action_duration_sec or 2.5)))
            except Exception:
                dur = 2.5

            char_id = _safe_slug(char_name or text.split()[0], "sprite")
            act_list = _parse_actions(actions) if _ASSET_TYPES[at]["needs_actions"] else ["idle"]

            task_id = uuid.uuid4().hex
            out_dir = api._alloc_dir(char_id)
            task = {
                "task_id": task_id,
                "output_dir": out_dir,
                "status": "queued",
                "stage": "stills",
                "progress": {"current": 0, "total": 1},
                "logs": [],
                "error": "",
                "created_at": _now_ms(),
                "brief": text,
                "char_name": (char_name or "").strip() or char_id,
                "char_id": char_id,
                "asset_type": at,
                "visual_style": style,
                "canvas": [cw, ch],
                "fps": fps_i,
                "pixel_art": pixel,
                "actions": act_list,
                "still_count": count_n,
                "candidates": count_n,
                "frames_per_action": fpa,
                "action_duration_sec": dur,
                "stills_ui": [],
                "picked_ref": None,
                "animations_meta": {},
                "preview": [],
                "failed_actions": [],
                "zip_url": "",
                "export_hint": "",
                "godot": {},
                "cancel": False,
            }
            api.tasks[task_id] = task
            api._save_task_snapshot(task)
            asyncio.create_task(api._run_stills(task_id))
            return {"success": True, "task_id": task_id, "output_dir": out_dir}

        @app.get("/game-sprite/status")
        @app.get("/api/game-sprite/status")
        async def gs_status(task_id: str):
            task = api._ensure_task(task_id)
            out = {k: v for k, v in task.items() if k != "cancel"}
            return {"success": True, **out}

        @app.post("/game-sprite/cancel")
        @app.post("/api/game-sprite/cancel")
        async def gs_cancel(task_id: str = Form(...)):
            task = api._ensure_task(task_id)
            task["cancel"] = True
            api._log(task, "收到取消请求…")
            return {"success": True}

        @app.post("/game-sprite/confirm-pick")
        @app.post("/api/game-sprite/confirm-pick")
        async def gs_confirm_pick(
            task_id: str = Form(...),
            still_id: str = Form(...),
            run_actions: str = Form("1"),
        ):
            task = api._ensure_task(task_id)
            stills = task.get("stills_ui") or []
            pick = None
            for s in stills:
                if s.get("id") == still_id or s.get("path") == still_id:
                    pick = s
                    break
            if not pick:
                raise HTTPException(status_code=400, detail="未找到所选参考图")
            task["picked_ref"] = pick
            task["stage"] = "actions"
            api._log(task, f"已选主参考: {pick.get('id')}")
            api._save_task_snapshot(task)
            do_run = str(run_actions or "1").strip().lower() not in ("0", "false", "no")
            if do_run:
                asyncio.create_task(api._run_actions(task_id))
            return {"success": True, "picked": pick}

        @app.post("/game-sprite/upload-ref")
        @app.post("/api/game-sprite/upload-ref")
        async def gs_upload_ref(
            task_id: str = Form(...),
            image: UploadFile = File(...),
            run_actions: str = Form("0"),
        ):
            task = api._ensure_task(task_id)
            data = await image.read()
            if not data:
                raise HTTPException(status_code=400, detail="空文件")
            d = api._task_dir(task)
            up = d / "uploads"
            up.mkdir(parents=True, exist_ok=True)
            name = f"upload_{uuid.uuid4().hex[:8]}.png"
            try:
                im = Image.open(io.BytesIO(data)).convert("RGBA")
                path = up / name
                im.save(path, "PNG")
            except Exception:
                path = up / name
                path.write_bytes(data)
            pick = {
                "id": f"upload_{name}",
                "kind": "upload",
                "url": api._public_url(task, f"uploads/{name}"),
                "path": name,
                "abs": str(path.resolve()),
            }
            stills = list(task.get("stills_ui") or [])
            stills.append(pick)
            task["stills_ui"] = stills
            task["picked_ref"] = pick
            api._log(task, f"已上传并选为参考: {name}")
            api._save_task_snapshot(task)
            do_run = str(run_actions or "0").strip().lower() not in ("0", "false", "no")
            if do_run:
                asyncio.create_task(api._run_actions(task_id))
            return {"success": True, "picked": pick, "stills_ui": stills}

        @app.post("/game-sprite/run-actions")
        @app.post("/api/game-sprite/run-actions")
        async def gs_run_actions(
            task_id: str = Form(...),
            actions: str = Form(""),
        ):
            task = api._ensure_task(task_id)
            if not task.get("picked_ref"):
                raise HTTPException(status_code=400, detail="请先选择主参考图")
            act = _parse_actions(actions) if (actions or "").strip() else None
            if act:
                task["actions"] = act
            task["cancel"] = False
            asyncio.create_task(api._run_actions(task_id, act))
            return {"success": True}

        @app.post("/game-sprite/rerun-action")
        @app.post("/api/game-sprite/rerun-action")
        async def gs_rerun_action(
            task_id: str = Form(...),
            action: str = Form(...),
        ):
            task = api._ensure_task(task_id)
            a = (action or "").strip().lower()
            if a not in set(_DEFAULT_ACTIONS + _OPTIONAL_ACTIONS):
                raise HTTPException(status_code=400, detail="未知动作")
            if not task.get("picked_ref"):
                raise HTTPException(status_code=400, detail="请先选择主参考图")
            task["cancel"] = False

            async def _one():
                task["status"] = "running"
                task["stage"] = "actions"
                try:
                    meta = await api._run_one_action(task, a)
                    anim = dict(task.get("animations_meta") or {})
                    anim[a] = meta
                    task["animations_meta"] = anim
                    if a in (task.get("failed_actions") or []):
                        task["failed_actions"] = [x for x in task["failed_actions"] if x != a]
                    pack_project_meta(
                        api._task_dir(task),
                        task["char_id"],
                        anim,
                        canvas_w=task["canvas"][0],
                        canvas_h=task["canvas"][1],
                        fps=int(task.get("fps") or 8),
                        pixel_art=bool(task.get("pixel_art")),
                    )
                    api._finalize_preview(task)
                    task["status"] = "done"
                    task["stage"] = "export"
                except Exception as e:
                    task["status"] = "failed"
                    task["error"] = str(e)
                    api._log(task, f"重跑 {a} 失败: {e}")
                api._save_task_snapshot(task)

            asyncio.create_task(_one())
            return {"success": True}

        @app.post("/game-sprite/export")
        @app.post("/api/game-sprite/export")
        async def gs_export(task_id: str = Form(...)):
            task = api._ensure_task(task_id)
            if not (task.get("animations_meta") or {}):
                raise HTTPException(status_code=400, detail="尚无动画帧可导出")
            api._finalize_preview(task)
            api._save_task_snapshot(task)
            return {
                "success": True,
                "zip_url": task.get("zip_url") or "",
                "godot": task.get("godot") or {},
                "export_hint": task.get("export_hint") or "",
            }

        @app.post("/game-sprite/copy-to-godot")
        @app.post("/api/game-sprite/copy-to-godot")
        async def gs_copy_to_godot(
            task_id: str = Form(...),
            godot_project_path: str = Form(...),
        ):
            task = api._ensure_task(task_id)
            root = Path((godot_project_path or "").strip())
            try:
                dest = copy_into_godot_project(
                    api._task_dir(task), root, task["char_id"]
                )
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e))
            api._log(task, f"已复制到 Godot: {dest}")
            return {"success": True, "dest": str(dest)}

        @app.post("/game-sprite/reveal-output")
        @app.post("/api/game-sprite/reveal-output")
        async def gs_reveal(task_id: str = Form(...)):
            task = api._ensure_task(task_id)
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

        @app.get("/game-sprite/defaults")
        @app.get("/api/game-sprite/defaults")
        async def gs_defaults():
            return {
                "success": True,
                "styles": {k: v["label"] for k, v in _VISUAL_STYLES.items()},
                "asset_types": {k: v["label"] for k, v in _ASSET_TYPES.items()},
                "default_actions": _DEFAULT_ACTIONS,
                "optional_actions": _OPTIONAL_ACTIONS,
                "canvas_presets": list(_CANVAS_PRESETS.keys()),
            }

        @app.get("/game-sprite/history")
        @app.get("/api/game-sprite/history")
        async def gs_history(limit: int = 24):
            root: Path = api.deps["output_root"]
            dirs = list_task_dirs(
                root,
                "game_sprites",
                legacy_pred=lambda p: "_gs_" in p.name,
                limit=limit,
            )
            items = []
            for p in dirs:
                meta = {}
                tj = p / "task.json"
                if tj.exists():
                    try:
                        meta = json.loads(tj.read_text(encoding="utf-8"))
                    except Exception:
                        meta = {}
                folder = rel_to_root(root, p)
                items.append(
                    {
                        "folder": folder,
                        "char_id": meta.get("char_id") or "",
                        "brief": (meta.get("brief") or "")[:80],
                        "status": meta.get("status") or "",
                        "task_id": meta.get("task_id") or "",
                        "mtime": int(p.stat().st_mtime),
                    }
                )
            return {"success": True, "items": items}

        @app.post("/game-sprite/open")
        @app.post("/api/game-sprite/open")
        async def gs_open(
            folder: str = Form(""),
            task_id: str = Form(""),
        ):
            key = (folder or "").strip() or (task_id or "").strip()
            if not key:
                raise HTTPException(status_code=400, detail="请提供 folder 或 task_id")
            try:
                task = api._load_task_from_dir(key)
            except FileNotFoundError as e:
                raise HTTPException(status_code=404, detail=str(e))
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e))
            out = {k: v for k, v in task.items() if k != "cancel"}
            return {"success": True, **out}
