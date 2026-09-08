"""
音效流水线：复用本地 ACE-Step 1.5 turbo，短时无人声 Foley / SFX。

输出：output/sfx/{date}_sfx_*/
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import Form, HTTPException

from music_pipeline import acestep_ready
from output_layout import (
    alloc_under,
    ensure_reserved_dirs,
    list_task_dirs,
    rel_to_root,
    resolve_task_dir,
)

_SFX_TASKS: Dict[str, dict] = {}

_DEFAULT_ACESTEP_ROOT = Path(r"D:\sd\ACE-Step-1.5")
_WORKER = Path(__file__).resolve().parent / "scripts" / "acestep_worker.py"

_SFX_PRESETS = {
    "explosion": "cinematic explosion sound effect, loud boom, debris rattle, short impact, no music bed, no vocals, foley sfx",
    "whoosh": "fast air whoosh transition sound effect, sweep, short, no melody, no vocals, game sfx",
    "ui_click": "clean UI button click sound effect, soft digital tap, short, no music, no vocals",
    "coin": "game coin collect chime sound effect, bright sparkle, short, no music bed, no vocals",
    "hit": "melee hit impact sound effect, punch thud, short, no music, no vocals, game combat sfx",
    "jump": "cartoon jump spring sound effect, boing, short, playful, no vocals",
    "footstep": "footsteps on gravel sound effect, walking pace, short loopable steps, no music, no vocals, foley",
    "door": "wooden door open and close sound effect, creak and latch, short, no music, no vocals, foley",
    "magic": "fantasy magic spell cast sound effect, shimmer sparkle whoosh, short, no vocals, game sfx",
    "laser": "sci-fi laser blaster shot sound effect, zap, short, no music, no vocals",
    "notification": "gentle app notification chime sound effect, short soft ping, no vocals",
    "rain": "ambient rain on window sound effect, soft continuous texture, no music, no vocals, nature foley",
}


def _cn_now_str() -> str:
    return datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d %H:%M:%S")


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


def _acestep_root() -> Path:
    raw = (os.environ.get("ACESTEP_ROOT") or "").strip()
    return Path(raw) if raw else _DEFAULT_ACESTEP_ROOT


def _build_caption(prompt: str, preset: str) -> str:
    p = (prompt or "").strip()
    key = (preset or "").strip().lower()
    base = _SFX_PRESETS.get(key, "")
    if key == "custom" or not base:
        if not p:
            return _SFX_PRESETS["whoosh"]
        low = p.lower()
        if "sound effect" not in low and "sfx" not in low and "音效" not in p and "foley" not in low:
            return f"{p}, sound effect, short foley, no vocals, no music bed"
        return p
    if p:
        return f"{base}. {p}"
    return base


class SfxAPI:
    def __init__(
        self,
        *,
        output_root: Path,
        audio_duration_seconds: Optional[Callable[[Path], float]] = None,
    ):
        self.output_root = Path(output_root)
        self.audio_duration_seconds = audio_duration_seconds
        self.tasks = _SFX_TASKS
        ensure_reserved_dirs(self.output_root)

    def _alloc_dir(self) -> str:
        stamp = datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d_%H-%M")
        return alloc_under(self.output_root, "sfx", f"{stamp}_sfx")

    def _task_dir(self, task: dict) -> Path:
        rel = task.get("output_dir") or ""
        d = resolve_task_dir(self.output_root, rel)
        if d is None:
            d = self.output_root / rel
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _log(self, task: dict, msg: str) -> None:
        line = f"[{_cn_now_str()}] {msg}"
        logs = task.setdefault("logs", [])
        logs.append(line)
        try:
            with open(self._task_dir(task) / "pipeline.log", "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass

    def _public_url(self, path: Path) -> str:
        rel = rel_to_root(self.output_root, path)
        return f"/output/{rel}".replace("\\", "/")

    async def _run_acestep(self, *, task: dict, caption: str, out_wav: Path) -> None:
        root = _acestep_root()
        uv = shutil.which("uv")
        if not uv:
            raise RuntimeError("未找到 uv，无法调用 ACE-Step")
        status = acestep_ready()
        if not status["ready"]:
            raise RuntimeError(
                "本地 ACE-Step 未就绪。请运行 comfyui-api-server/scripts/setup_acestep.py"
            )
        duration = float(task.get("duration") or 10)
        cmd = [
            uv,
            "run",
            "python",
            str(_WORKER),
            "--caption",
            caption,
            "--lyrics",
            "[Instrumental]",
            "--out",
            str(out_wav),
            "--mode",
            "sfx",
            "--duration",
            str(duration),
            "--lang",
            "unknown",
            "--steps",
            str(int(task.get("steps") or 8)),
        ]
        if int(task.get("seed") or -1) >= 0:
            cmd.extend(["--seed", str(int(task["seed"]))])
        self._log(task, f"ACE-Step 音效启动 duration={duration}s …")
        env = os.environ.copy()
        env["UV_PYTHON"] = env.get("UV_PYTHON") or "3.12"
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(root),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        out_b, _ = await proc.communicate()
        text_out = (out_b or b"").decode("utf-8", errors="replace").strip()
        if text_out:
            for line in text_out.splitlines()[-30:]:
                self._log(task, line)
        if proc.returncode != 0:
            raise RuntimeError(f"ACE-Step 音效失败 (code={proc.returncode})")
        if not out_wav.is_file() or out_wav.stat().st_size < 1024:
            raise RuntimeError("ACE-Step 未写出有效音效")

    async def _execute(self, task_id: str) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        t0 = time.time()
        try:
            task["status"] = "running"
            task["stage"] = "synthesize"
            task_dir = self._task_dir(task)
            out_wav = task_dir / "sfx.wav"
            caption = _build_caption(task.get("prompt") or "", task.get("preset") or "")
            task["caption"] = caption
            (task_dir / "caption.txt").write_text(caption, encoding="utf-8")
            task["engine_used"] = "ace-step-1.5-turbo"
            await self._run_acestep(task=task, caption=caption, out_wav=out_wav)

            dur = None
            if self.audio_duration_seconds:
                try:
                    dur = float(self.audio_duration_seconds(out_wav))
                except Exception:
                    dur = None
            url = self._public_url(out_wav)
            task["audio_url"] = url
            task["audio_urls"] = [url]
            task["duration_sec"] = dur
            elapsed = time.time() - t0
            task["timing"] = {"total_sec": round(elapsed, 2)}
            self._log(
                task,
                f"完成，耗时 {_format_elapsed(elapsed)}"
                + (f"，时长 {dur:.1f}s" if dur else ""),
            )
            task["status"] = "done"
            task["stage"] = "done"
            task["progress"] = {"current": 1, "total": 1}
            meta = {
                "task_id": task_id,
                "prompt": task.get("prompt") or "",
                "preset": task.get("preset") or "",
                "caption": caption,
                "engine_used": task.get("engine_used"),
                "duration_req": task.get("duration"),
                "created_at": task.get("created_at_cn"),
                "duration_sec": dur,
                "audio": "sfx.wav",
            }
            (task_dir / "meta.json").write_text(
                json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except Exception as e:
            task["status"] = "error"
            task["error"] = str(e)
            self._log(task, f"失败：{e}")

    def register(self, app) -> None:
        api = self

        @app.get("/sfx/defaults")
        @app.get("/api/sfx/defaults")
        async def sfx_defaults():
            st = acestep_ready()
            return {
                "success": True,
                "acestep": st,
                "presets": {
                    "explosion": "爆炸冲击",
                    "whoosh": "呼啸 / 转场",
                    "ui_click": "UI 点击",
                    "coin": "金币拾取",
                    "hit": "受击 / 打击",
                    "jump": "跳跃弹跳",
                    "footstep": "脚步",
                    "door": "开关门",
                    "magic": "魔法施法",
                    "laser": "激光射击",
                    "notification": "通知提示音",
                    "rain": "雨声氛围",
                    "custom": "自定义（只用下方描述）",
                },
                "default_preset": "whoosh",
                "default_duration": 10,
                "duration_min": 10,
                "duration_max": 30,
                "hint": "工作流：本地 ACE-Step 1.5 turbo 短时音效（无人声）。引擎最短约 10 秒；适合游戏 Foley / UI / 爆炸等。",
            }

        @app.get("/sfx/status")
        @app.get("/api/sfx/status")
        async def sfx_engine_status():
            return {"success": True, **acestep_ready()}

        @app.post("/sfx/start")
        @app.post("/api/sfx/start")
        async def sfx_start(
            prompt: str = Form(""),
            preset: str = Form("whoosh"),
            duration: str = Form("10"),
            steps: str = Form("8"),
            seed: str = Form("-1"),
        ):
            body = (prompt or "").strip()
            preset_n = (preset or "whoosh").strip().lower() or "whoosh"
            if preset_n == "custom" and not body:
                raise HTTPException(status_code=400, detail="自定义模式请填写音效描述")
            if preset_n not in _SFX_PRESETS and preset_n != "custom":
                if not body:
                    raise HTTPException(status_code=400, detail="请选择预设或填写描述")
                preset_n = "custom"
            try:
                dur = float(duration or "10")
            except Exception:
                dur = 10.0
            dur = max(10.0, min(30.0, dur))
            try:
                steps_i = int(float(steps or "8"))
            except Exception:
                steps_i = 8
            steps_i = max(4, min(32, steps_i))
            try:
                seed_i = int(float(seed or "-1"))
            except Exception:
                seed_i = -1

            task_id = uuid.uuid4().hex
            out_dir = api._alloc_dir()
            task = {
                "task_id": task_id,
                "output_dir": out_dir,
                "status": "queued",
                "stage": "prepare",
                "progress": {"current": 0, "total": 1},
                "logs": [],
                "error": "",
                "created_at": _now_ms(),
                "created_at_cn": _cn_now_str(),
                "prompt": body,
                "preset": preset_n,
                "duration": dur,
                "steps": steps_i,
                "seed": seed_i,
                "caption": "",
                "engine_used": "",
                "audio_url": "",
                "audio_urls": [],
                "timing": {},
            }
            api.tasks[task_id] = task
            api._log(task, f"任务创建 preset={preset_n} duration={dur}s")
            asyncio.create_task(api._execute(task_id))
            return {"success": True, "task_id": task_id, "output_dir": out_dir}

        @app.get("/sfx/task/{task_id}")
        @app.get("/api/sfx/task/{task_id}")
        async def sfx_task(task_id: str):
            task = api.tasks.get(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            return {"success": True, **task}

        @app.get("/sfx/history")
        @app.get("/api/sfx/history")
        async def sfx_history(limit: int = 30):
            items: List[dict] = []
            for d in list_task_dirs(api.output_root, "sfx", limit=max(1, min(100, int(limit or 30)))):
                meta_path = d / "meta.json"
                meta: dict = {}
                if meta_path.is_file():
                    try:
                        meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    except Exception:
                        meta = {}
                wav = d / "sfx.wav"
                rel = rel_to_root(api.output_root, d) or d.name
                items.append(
                    {
                        "folder": rel,
                        "created_at": meta.get("created_at") or "",
                        "prompt": meta.get("prompt") or "",
                        "preset": meta.get("preset") or "",
                        "caption": meta.get("caption") or "",
                        "engine_used": meta.get("engine_used") or "",
                        "duration_req": meta.get("duration_req"),
                        "audio_url": api._public_url(wav) if wav.is_file() else "",
                        "duration_sec": meta.get("duration_sec"),
                    }
                )
            return {"success": True, "items": items}

        @app.post("/sfx/open-dir")
        @app.post("/api/sfx/open-dir")
        async def sfx_open_dir(folder: str = Form("")):
            rel = (folder or "").strip().replace("\\", "/")
            d = resolve_task_dir(api.output_root, rel)
            if d is None or not d.is_dir():
                raise HTTPException(status_code=404, detail="目录不存在")
            try:
                subprocess.Popen(["explorer", str(d)])
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))
            return {"success": True, "path": str(d)}
