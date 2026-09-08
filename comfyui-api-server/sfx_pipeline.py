"""
音效流水线：本地 Stable Audio Open 1.0（文生 SFX / Foley / 氛围）。

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

from output_layout import (
    alloc_under,
    delete_task_dir,
    ensure_reserved_dirs,
    list_task_dirs,
    rel_to_root,
    resolve_task_dir,
)

_SFX_TASKS: Dict[str, dict] = {}

_DEFAULT_SAO_ROOT = Path(r"D:\sd\stable-audio-open")
_WORKER = Path(__file__).resolve().parent / "scripts" / "stable_audio_worker.py"

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


def _sao_root() -> Path:
    raw = (os.environ.get("STABLE_AUDIO_ROOT") or "").strip()
    return Path(raw) if raw else _DEFAULT_SAO_ROOT


def _sao_python() -> Path:
    return _sao_root() / ".venv" / "Scripts" / "python.exe"


def _sao_model_dir() -> Path:
    raw = (os.environ.get("STABLE_AUDIO_MODEL_DIR") or "").strip()
    if raw:
        return Path(raw)
    return _sao_root() / "model"


def stable_audio_ready() -> Dict[str, Any]:
    root = _sao_root()
    py = _sao_python()
    model = _sao_model_dir()
    marker = root / ".tbc_ready"
    has_model = (model / "model_index.json").is_file()
    ready = py.is_file() and has_model and _WORKER.is_file()
    return {
        "ready": ready,
        "root": str(root),
        "model_dir": str(model),
        "has_python": py.is_file(),
        "has_model": has_model,
        "has_marker": marker.is_file(),
        "has_worker": _WORKER.is_file(),
        "engine": "stable-audio-open-1.0" if ready else "unavailable",
    }


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


def _trim_wav_to_peak(src: Path, dst: Path, target_sec: float) -> float:
    """Keep the loudest window of target_sec from src wav. Returns trimmed duration."""
    import numpy as np
    import soundfile as sf

    target = max(0.2, float(target_sec))
    data, sr = sf.read(str(src), always_2d=True)
    if sr <= 0 or data.size == 0:
        raise RuntimeError("empty audio")
    # Drop trailing near-silence first (Stable Audio often pads)
    mono = np.mean(np.abs(data.astype(np.float64)), axis=1)
    thresh = max(1e-4, float(np.max(mono)) * 0.02)
    nonzero = np.where(mono > thresh)[0]
    if nonzero.size:
        end = int(nonzero[-1]) + 1
        start0 = int(nonzero[0])
        data = data[start0:end]
        mono = mono[start0:end]

    total_sec = float(data.shape[0]) / float(sr)
    if target >= total_sec - 0.02:
        if Path(src).resolve() != Path(dst).resolve():
            sf.write(str(dst), data, sr)
        else:
            sf.write(str(dst), data, sr)
        return total_sec

    win = max(1, int(round(target * sr)))
    if mono.size <= win:
        start_i = 0
    else:
        energy = mono * mono
        csum = np.concatenate(([0.0], np.cumsum(energy, dtype=np.float64)))
        scores = csum[win:] - csum[:-win]
        start_i = int(np.argmax(scores))

    end_i = min(mono.size, start_i + win)
    start_i = max(0, end_i - win)
    clipped = data[start_i:end_i]
    sf.write(str(dst), clipped, sr)
    return float(clipped.shape[0]) / float(sr)


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

    async def _run_stable_audio(self, *, task: dict, caption: str, out_wav: Path) -> None:
        status = stable_audio_ready()
        if not status["ready"]:
            raise RuntimeError(
                "本地 Stable Audio Open 未就绪。请运行 comfyui-api-server/scripts/setup_stable_audio.py"
            )
        py = _sao_python()
        seconds = float(task.get("gen_duration") or task.get("duration") or 5.0)
        seconds = max(0.5, min(47.0, seconds))
        cmd = [
            str(py),
            str(_WORKER),
            "--prompt",
            caption,
            "--out",
            str(out_wav),
            "--seconds",
            str(seconds),
            "--steps",
            str(int(task.get("steps") or 50)),
            "--model-dir",
            str(_sao_model_dir()),
        ]
        if int(task.get("seed") or -1) >= 0:
            cmd.extend(["--seed", str(int(task["seed"]))])
        self._log(task, f"Stable Audio Open 启动 seconds={seconds} …")
        env = os.environ.copy()
        env["STABLE_AUDIO_ROOT"] = str(_sao_root())
        env["STABLE_AUDIO_MODEL_DIR"] = str(_sao_model_dir())
        env["TQDM_DISABLE"] = "1"
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(_sao_root()),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        out_b, _ = await proc.communicate()
        text_out = (out_b or b"").decode("utf-8", errors="replace").strip()
        if text_out:
            for line in text_out.splitlines()[-40:]:
                s = line.strip()
                if not s or s.startswith("%") or "|█" in s or "it/s]" in s:
                    continue
                if "UserWarning:" in s or "warnings.warn" in s:
                    continue
                self._log(task, s)
        if proc.returncode != 0:
            raise RuntimeError(f"Stable Audio Open 失败 (code={proc.returncode})")
        if not out_wav.is_file() or out_wav.stat().st_size < 1024:
            raise RuntimeError("Stable Audio Open 未写出有效音效")

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
            raw_wav = task_dir / "sfx_full.wav"
            caption = _build_caption(task.get("prompt") or "", task.get("preset") or "")
            task["caption"] = caption
            (task_dir / "caption.txt").write_text(caption, encoding="utf-8")
            task["engine_used"] = "stable-audio-open-1.0"
            await self._run_stable_audio(task=task, caption=caption, out_wav=out_wav)

            want = float(task.get("duration") or 1.5)
            # Always keep full render, then trim to target when needed (silence pad / long buffer)
            actual = None
            if self.audio_duration_seconds:
                try:
                    actual = float(self.audio_duration_seconds(out_wav))
                except Exception:
                    actual = None
            if actual is None or actual > want + 0.15:
                task["stage"] = "trim"
                self._log(task, f"裁剪到目标约 {want:.2f}s（去静音 + 能量峰值）…")
                shutil.copy2(out_wav, raw_wav)
                trimmed = await asyncio.to_thread(_trim_wav_to_peak, raw_wav, out_wav, want)
                self._log(task, f"裁剪完成 → {trimmed:.2f}s（完整版保留 sfx_full.wav）")

            dur = None
            if self.audio_duration_seconds:
                try:
                    dur = float(self.audio_duration_seconds(out_wav))
                except Exception:
                    dur = None
            url = self._public_url(out_wav)
            task["audio_url"] = url
            task["audio_urls"] = [url]
            if raw_wav.is_file():
                task["audio_full_url"] = self._public_url(raw_wav)
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
                "gen_duration": task.get("gen_duration"),
                "trimmed": bool(raw_wav.is_file()),
                "created_at": task.get("created_at_cn"),
                "duration_sec": dur,
                "audio": "sfx.wav",
                "audio_full": "sfx_full.wav" if raw_wav.is_file() else "",
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
            st = stable_audio_ready()
            return {
                "success": True,
                "stable_audio": st,
                "acestep": st,  # backward compat for old UI field name
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
                "default_duration": 3.0,
                "duration_min": 0.5,
                "duration_max": 47,
                "hint": "工作流：本地 Stable Audio Open 1.0（D:\\sd\\stable-audio-open）。需先在 Hugging Face 同意模型协议并运行 setup_stable_audio.py。适合 Foley / 氛围；短目标会去静音并按峰值裁剪。",
            }

        @app.get("/sfx/status")
        @app.get("/api/sfx/status")
        async def sfx_engine_status():
            return {"success": True, **stable_audio_ready()}

        @app.post("/sfx/start")
        @app.post("/api/sfx/start")
        async def sfx_start(
            prompt: str = Form(""),
            preset: str = Form("whoosh"),
            duration: str = Form("3"),
            steps: str = Form("50"),
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
                dur = float(duration or "3")
            except Exception:
                dur = 3.0
            dur = max(0.5, min(47.0, dur))
            # Ask model for target length; short clips still get silence-pad + trim.
            gen_dur = dur
            try:
                steps_i = int(float(steps or "50"))
            except Exception:
                steps_i = 50
            steps_i = max(10, min(200, steps_i))
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
                "gen_duration": gen_dur,
                "steps": steps_i,
                "seed": seed_i,
                "caption": "",
                "engine_used": "",
                "audio_url": "",
                "audio_urls": [],
                "timing": {},
            }
            api.tasks[task_id] = task
            api._log(task, f"任务创建 preset={preset_n} target={dur}s engine=stable-audio-open")
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

        @app.post("/sfx/delete")
        @app.post("/api/sfx/delete")
        async def sfx_delete(folder: str = Form("")):
            rel = (folder or "").strip().replace("\\", "/")
            if not rel:
                raise HTTPException(status_code=400, detail="缺少 folder")
            try:
                deleted = delete_task_dir(api.output_root, rel, category="sfx")
            except FileNotFoundError as e:
                raise HTTPException(status_code=404, detail=str(e)) from e
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            return {"success": True, "folder": rel_to_root(api.output_root, deleted)}

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
