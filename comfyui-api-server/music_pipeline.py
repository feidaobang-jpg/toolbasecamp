"""
音乐流水线：本地 ACE-Step 1.5（turbo）。

模式：
- bgm：游戏/纯配乐（instrumental）
- song：流行歌（可填歌词；空歌词且勾选自动写词时用 DeepSeek）

输出：output/music/{date}_music_*/
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
from cn_time import CN_TZ, cn_now, cn_now_str, cn_stamp_dir

from fastapi import Form, HTTPException

from output_layout import (
    alloc_under,
    delete_task_dir,
    ensure_reserved_dirs,
    list_task_dirs,
    rel_to_root,
    resolve_task_dir,
)

_MUSIC_TASKS: Dict[str, dict] = {}

_DEFAULT_ACESTEP_ROOT = Path(r"D:\sd\ACE-Step-1.5")
_WORKER = Path(__file__).resolve().parent / "scripts" / "acestep_worker.py"

_BGM_PRESETS = {
    "adventure": "game background music, adventurous orchestral adventure, loopable, no vocals, cinematic strings and soft percussion",
    "calm": "game background music, calm ambient piano, peaceful loopable BGM, no vocals, soft pads",
    "battle": "game battle BGM, energetic electronic rock, fast drums, intense loopable, no vocals",
    "puzzle": "casual puzzle game BGM, light chiptune-inspired melody, cheerful loopable, no vocals",
    "menu": "game menu theme, warm lo-fi chill beats, gentle loopable, no vocals",
    "sad": "emotional game BGM, melancholic piano and strings, slow atmospheric, no vocals, loopable",
}


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


def _acestep_root() -> Path:
    raw = (os.environ.get("ACESTEP_ROOT") or "").strip()
    return Path(raw) if raw else _DEFAULT_ACESTEP_ROOT


def acestep_ready() -> Dict[str, Any]:
    root = _acestep_root()
    uv = shutil.which("uv")
    turbo = root / "checkpoints" / "acestep-v15-turbo"
    has_ckpt = turbo.is_dir() and (
        (turbo / "config.json").is_file()
        or any(turbo.glob("*.safetensors"))
        or any(turbo.glob("*.bin"))
    )
    # Main pack may store turbo files differently after download
    if not has_ckpt:
        ckpts = root / "checkpoints"
        has_ckpt = ckpts.is_dir() and (
            any(ckpts.rglob("*turbo*"))
            or (ckpts / "config.json").is_file()
            or any(ckpts.glob("*.safetensors"))
        )
    marker = root / ".tbc_ready"
    ready = root.is_dir() and bool(uv) and _WORKER.is_file() and has_ckpt
    return {
        "ready": ready,
        "root": str(root),
        "has_uv": bool(uv),
        "has_checkpoint": has_ckpt,
        "has_marker": marker.is_file(),
        "has_worker": _WORKER.is_file(),
        "engine": "ace-step-1.5-turbo" if ready else "unavailable",
    }


def _build_caption(mode: str, prompt: str, preset: str) -> str:
    p = (prompt or "").strip()
    if mode == "bgm":
        base = _BGM_PRESETS.get((preset or "").strip().lower(), "")
        if base and p:
            return f"{base}. {p}"
        if base:
            return base
        if p:
            # force instrumental cues for game BGM
            low = p.lower()
            if "instrumental" not in low and "no vocal" not in low and "无人声" not in p:
                return f"{p}, instrumental, no vocals, loopable game background music"
            return p
        return _BGM_PRESETS["adventure"]
    # song
    if p:
        return p
    return "upbeat chinese pop song, clear vocals, modern production, catchy chorus"


class MusicAPI:
    def __init__(
        self,
        *,
        output_root: Path,
        audio_duration_seconds: Optional[Callable[[Path], float]] = None,
        repo_deepseek_api_key: Optional[Callable[[], str]] = None,
        deepseek_api_url: str = "",
    ):
        self.output_root = Path(output_root)
        self.audio_duration_seconds = audio_duration_seconds
        self.repo_deepseek_api_key = repo_deepseek_api_key
        self.deepseek_api_url = deepseek_api_url or "https://api.deepseek.com/v1/chat/completions"
        self.tasks = _MUSIC_TASKS
        ensure_reserved_dirs(self.output_root)

    def _alloc_dir(self, mode: str) -> str:
        stamp = cn_stamp_dir()
        tag = "bgm" if mode == "bgm" else "song"
        return alloc_under(self.output_root, "music", f"{stamp}_{tag}")

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

    def _gen_lyrics_deepseek(self, topic: str, lang: str) -> str:
        if not self.repo_deepseek_api_key:
            raise RuntimeError("DeepSeek 未配置")
        key = (self.repo_deepseek_api_key() or "").strip()
        if not key:
            raise RuntimeError("DeepSeek API Key 未配置")
        import requests

        lang_hint = "中文" if (lang or "zh").lower().startswith("zh") else "English"
        system = (
            "你是流行歌词作者。只输出歌词正文，使用 [Verse]/[Chorus]/[Bridge] 等结构标签。"
            "不要解释、不要标题外的废话。"
        )
        user = f"语言：{lang_hint}\n主题/情绪：{topic.strip()}\n写一首完整流行歌词（约 2 主歌 + 副歌 + 可选桥段）。"
        payload = {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.85,
        }
        r = requests.post(
            self.deepseek_api_url,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
            timeout=90,
        )
        r.raise_for_status()
        data = r.json()
        text = (
            (((data.get("choices") or [{}])[0].get("message") or {}).get("content")) or ""
        ).strip()
        if len(text) < 8:
            raise RuntimeError("DeepSeek 返回歌词过短")
        return text

    async def _run_acestep(self, *, task: dict, caption: str, lyrics: str, out_wav: Path) -> None:
        root = _acestep_root()
        uv = shutil.which("uv")
        if not uv:
            raise RuntimeError("未找到 uv，无法调用 ACE-Step")
        status = acestep_ready()
        if not status["ready"]:
            raise RuntimeError(
                "本地 ACE-Step 未就绪。请运行 comfyui-api-server/scripts/setup_acestep.py"
            )
        duration = float(task.get("duration") or 60)
        bpm = int(task.get("bpm") or 0)
        lang = task.get("lang") or "zh"
        mode = task.get("mode") or "bgm"
        cmd = [
            uv,
            "run",
            "python",
            str(_WORKER),
            "--caption",
            caption,
            "--lyrics",
            lyrics or "",
            "--out",
            str(out_wav),
            "--mode",
            mode,
            "--duration",
            str(duration),
            "--lang",
            lang,
            "--steps",
            str(int(task.get("steps") or 8)),
        ]
        if bpm > 0:
            cmd.extend(["--bpm", str(bpm)])
        if int(task.get("seed") or -1) >= 0:
            cmd.extend(["--seed", str(int(task["seed"]))])
        self._log(task, f"ACE-Step 启动 mode={mode} duration={duration}s …")
        env = os.environ.copy()
        env["UV_PYTHON"] = env.get("UV_PYTHON") or "3.12"
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUNBUFFERED"] = "1"
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(root),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        out_b, _ = await proc.communicate()
        text_out = (out_b or b"").decode("utf-8", errors="replace").strip()
        if not text_out:
            try:
                text_out = (out_b or b"").decode("gbk", errors="replace").strip()
            except Exception:
                pass
        if text_out:
            for line in text_out.splitlines()[-30:]:
                self._log(task, line)
        if proc.returncode != 0:
            raise RuntimeError(f"ACE-Step 失败 (code={proc.returncode})")
        if not out_wav.is_file() or out_wav.stat().st_size < 1024:
            raise RuntimeError("ACE-Step 未写出有效音频")

    async def _execute(self, task_id: str) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        t0 = time.time()
        try:
            task["status"] = "running"
            task["stage"] = "prepare"
            task_dir = self._task_dir(task)
            out_wav = task_dir / "music.wav"
            mode = task.get("mode") or "bgm"
            caption = _build_caption(mode, task.get("prompt") or "", task.get("preset") or "")
            lyrics = (task.get("lyrics") or "").strip()

            if mode == "song" and not lyrics and task.get("auto_lyrics"):
                task["stage"] = "lyrics"
                self._log(task, "DeepSeek 自动写词…")
                topic = (task.get("prompt") or caption).strip()
                lyrics = await asyncio.to_thread(
                    self._gen_lyrics_deepseek, topic, task.get("lang") or "zh"
                )
                task["lyrics"] = lyrics
                (task_dir / "lyrics.txt").write_text(lyrics, encoding="utf-8")
                self._log(task, f"歌词完成 chars={len(lyrics)}")
            elif lyrics:
                (task_dir / "lyrics.txt").write_text(lyrics, encoding="utf-8")

            if mode == "bgm":
                lyrics = "[Instrumental]"

            (task_dir / "caption.txt").write_text(caption, encoding="utf-8")
            task["caption"] = caption
            task["stage"] = "synthesize"
            task["engine_used"] = "ace-step-1.5-turbo"
            await self._run_acestep(task=task, caption=caption, lyrics=lyrics, out_wav=out_wav)

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
                "mode": mode,
                "prompt": task.get("prompt") or "",
                "preset": task.get("preset") or "",
                "caption": caption,
                "lyrics": lyrics if mode == "song" else "[Instrumental]",
                "auto_lyrics": bool(task.get("auto_lyrics")),
                "engine_used": task.get("engine_used"),
                "lang": task.get("lang"),
                "duration_req": task.get("duration"),
                "bpm": task.get("bpm"),
                "created_at": task.get("created_at_cn"),
                "duration_sec": dur,
                "audio": "music.wav",
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

        @app.get("/music/defaults")
        @app.get("/api/music/defaults")
        async def music_defaults():
            st = acestep_ready()
            return {
                "success": True,
                "acestep": st,
                "modes": {
                    "bgm": "游戏纯 BGM（无人声）",
                    "song": "流行歌（可自动写词）",
                },
                "presets_bgm": {
                    "adventure": "冒险探索",
                    "calm": "平静氛围",
                    "battle": "战斗紧张",
                    "puzzle": "解谜轻快",
                    "menu": "菜单 Lo-fi",
                    "sad": "伤感叙事",
                    "custom": "自定义（只用下方描述）",
                },
                "default_mode": "bgm",
                "default_duration_bgm": 60,
                "default_duration_song": 90,
                "hint": "工作流：本地 ACE-Step 1.5 turbo（D:\\sd\\ACE-Step-1.5）。流行歌可空歌词并勾选自动写词（DeepSeek）。",
            }

        @app.get("/music/status")
        @app.get("/api/music/status")
        async def music_engine_status():
            return {"success": True, **acestep_ready()}

        @app.post("/music/start")
        @app.post("/api/music/start")
        async def music_start(
            mode: str = Form("bgm"),
            prompt: str = Form(""),
            lyrics: str = Form(""),
            preset: str = Form("adventure"),
            auto_lyrics: str = Form("0"),
            duration: str = Form("60"),
            bpm: str = Form("0"),
            lang: str = Form("zh"),
            steps: str = Form("8"),
            seed: str = Form("-1"),
        ):
            md = (mode or "bgm").strip().lower()
            if md not in ("bgm", "song"):
                md = "bgm"
            body = (prompt or "").strip()
            lyr = (lyrics or "").strip()
            auto = str(auto_lyrics or "0").strip().lower() in ("1", "true", "yes", "on")
            if md == "song" and not body and not lyr and not auto:
                raise HTTPException(status_code=400, detail="请填写风格描述或歌词")
            if md == "bgm" and not body and (preset or "").strip().lower() in ("", "custom"):
                raise HTTPException(status_code=400, detail="请选择 BGM 预设或填写描述")
            try:
                dur = float(duration or "60")
            except Exception:
                dur = 60.0
            dur = max(10.0, min(240.0, dur))
            try:
                bpm_i = int(float(bpm or "0"))
            except Exception:
                bpm_i = 0
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
            out_dir = api._alloc_dir(md)
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
                "mode": md,
                "prompt": body,
                "lyrics": lyr,
                "preset": (preset or "").strip() or "adventure",
                "auto_lyrics": auto,
                "duration": dur,
                "bpm": bpm_i,
                "lang": (lang or "zh").strip() or "zh",
                "steps": steps_i,
                "seed": seed_i,
                "caption": "",
                "engine_used": "",
                "audio_url": "",
                "audio_urls": [],
                "timing": {},
            }
            api.tasks[task_id] = task
            api._log(task, f"任务创建 mode={md} duration={dur}s auto_lyrics={auto}")
            asyncio.create_task(api._execute(task_id))
            return {"success": True, "task_id": task_id, "output_dir": out_dir}

        @app.get("/music/task/{task_id}")
        @app.get("/api/music/task/{task_id}")
        async def music_task(task_id: str):
            task = api.tasks.get(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            return {"success": True, **task}

        @app.get("/music/history")
        @app.get("/api/music/history")
        async def music_history(limit: int = 30):
            items: List[dict] = []
            for d in list_task_dirs(api.output_root, "music", limit=max(1, min(100, int(limit or 30)))):
                meta_path = d / "meta.json"
                meta: dict = {}
                if meta_path.is_file():
                    try:
                        meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    except Exception:
                        meta = {}
                wav = d / "music.wav"
                rel = rel_to_root(api.output_root, d) or d.name
                items.append(
                    {
                        "folder": rel,
                        "created_at": meta.get("created_at") or "",
                        "mode": meta.get("mode") or "",
                        "prompt": meta.get("prompt") or "",
                        "preset": meta.get("preset") or "",
                        "caption": meta.get("caption") or "",
                        "lyrics": meta.get("lyrics") or "",
                        "engine_used": meta.get("engine_used") or "",
                        "lang": meta.get("lang") or "",
                        "duration_req": meta.get("duration_req"),
                        "bpm": meta.get("bpm"),
                        "audio_url": api._public_url(wav) if wav.is_file() else "",
                        "duration_sec": meta.get("duration_sec"),
                    }
                )
            return {"success": True, "items": items}

        @app.post("/music/delete")
        @app.post("/api/music/delete")
        async def music_delete(folder: str = Form("")):
            rel = (folder or "").strip().replace("\\", "/")
            if not rel:
                raise HTTPException(status_code=400, detail="缺少 folder")
            try:
                deleted = delete_task_dir(api.output_root, rel, category="music")
            except FileNotFoundError as e:
                raise HTTPException(status_code=404, detail=str(e)) from e
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            return {"success": True, "folder": rel_to_root(api.output_root, deleted)}

        @app.post("/music/open-dir")
        @app.post("/api/music/open-dir")
        async def music_open_dir(folder: str = Form("")):
            rel = (folder or "").strip().replace("\\", "/")
            d = resolve_task_dir(api.output_root, rel)
            if d is None or not d.is_dir():
                raise HTTPException(status_code=404, detail="目录不存在")
            try:
                subprocess.Popen(["explorer", str(d)])
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))
            return {"success": True, "path": str(d)}
