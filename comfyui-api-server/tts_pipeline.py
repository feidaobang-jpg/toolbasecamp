"""
语音 / TTS 流水线：本地 IndexTTS-2.5 声音克隆，失败或无参考音时回退 Edge-TTS。

输出：output/tts/{date}_tts_*/
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

from fastapi import File, Form, HTTPException, UploadFile

from output_layout import (
    alloc_under,
    category_dir,
    delete_task_dir,
    ensure_reserved_dirs,
    list_task_dirs,
    rel_to_root,
    resolve_task_dir,
)

_TTS_TASKS: Dict[str, dict] = {}

_DEFAULT_INDEXTTS_ROOT = Path(r"D:\sd\index-tts")
_WORKER = Path(__file__).resolve().parent / "scripts" / "indextts_worker.py"


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


def _indextts_root() -> Path:
    raw = (os.environ.get("INDEXTTS_ROOT") or "").strip()
    return Path(raw) if raw else _DEFAULT_INDEXTTS_ROOT


def indextts_ready() -> Dict[str, Any]:
    root = _indextts_root()
    uv = shutil.which("uv")
    cfg = root / "checkpoints" / "config.yaml"
    marker = root / ".tbc_ready"
    ready = root.is_dir() and cfg.is_file() and bool(uv) and _WORKER.is_file()
    return {
        "ready": ready,
        "root": str(root),
        "has_uv": bool(uv),
        "has_config": cfg.is_file(),
        "has_marker": marker.is_file(),
        "has_worker": _WORKER.is_file(),
        "engine": "indextts2.5" if ready else "edge-tts",
    }


def _detect_lang(text: str, forced: str) -> str:
    f = (forced or "").strip().upper()
    if f in ("ZH", "EN", "JA", "ES", "AR", "AUTO"):
        if f != "AUTO":
            return f
    # crude: CJK → ZH else EN
    for ch in text:
        if "\u4e00" <= ch <= "\u9fff":
            return "ZH"
    return "EN"


class TtsAPI:
    def __init__(
        self,
        *,
        output_root: Path,
        edge_synthesize: Callable,
        audio_duration_seconds: Optional[Callable[[Path], float]] = None,
    ):
        self.output_root = Path(output_root)
        self.edge_synthesize = edge_synthesize
        self.audio_duration_seconds = audio_duration_seconds
        self.tasks = _TTS_TASKS
        ensure_reserved_dirs(self.output_root)

    def _alloc_dir(self) -> str:
        stamp = datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d_%H-%M")
        return alloc_under(self.output_root, "tts", f"{stamp}_tts")

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
            task_dir = self._task_dir(task)
            with open(task_dir / "pipeline.log", "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass

    def _public_url(self, path: Path) -> str:
        rel = rel_to_root(self.output_root, path)
        return f"/output/{rel}".replace("\\", "/")

    def _voices_root(self) -> Path:
        return category_dir(self.output_root, "voices", ensure=True)

    def _list_voice_items(self) -> List[dict]:
        root = self._voices_root()
        items: List[dict] = []
        if not root.is_dir():
            return items
        for d in sorted(root.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if not d.is_dir() or d.name.startswith("_"):
                continue
            meta_path = d / "meta.json"
            meta: dict = {}
            if meta_path.is_file():
                try:
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))
                except Exception:
                    meta = {}
            ref_name = str(meta.get("ref") or "")
            ref_path = d / ref_name if ref_name else None
            if ref_path is None or not ref_path.is_file():
                for cand in d.glob("ref.*"):
                    ref_path = cand
                    break
            if ref_path is None or not ref_path.is_file():
                continue
            items.append(
                {
                    "id": d.name,
                    "name": str(meta.get("name") or d.name),
                    "created_at": str(meta.get("created_at") or ""),
                    "ref_url": self._public_url(ref_path),
                    "notes": str(meta.get("notes") or ""),
                }
            )
        return items

    def _resolve_voice_ref(self, voice_id: str) -> Optional[Path]:
        vid = (voice_id or "").strip()
        if not vid or ".." in vid or "/" in vid or "\\" in vid:
            return None
        d = self._voices_root() / vid
        if not d.is_dir():
            return None
        meta_path = d / "meta.json"
        if meta_path.is_file():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                ref_name = str(meta.get("ref") or "")
                if ref_name:
                    p = d / Path(ref_name).name
                    if p.is_file():
                        return p
            except Exception:
                pass
        for cand in d.glob("ref.*"):
            return cand
        return None

    async def _run_indextts(
        self,
        *,
        text: str,
        ref_path: Path,
        out_path: Path,
        lang: str,
        duration_factor: float,
        task: dict,
    ) -> None:
        root = _indextts_root()
        uv = shutil.which("uv")
        if not uv:
            raise RuntimeError("未找到 uv，无法调用 IndexTTS")
        cmd = [
            uv,
            "run",
            "python",
            str(_WORKER),
            "--text",
            text,
            "--ref",
            str(ref_path),
            "--out",
            str(out_path),
            "--lang",
            lang,
            "--duration-factor",
            str(duration_factor),
        ]
        self._log(task, f"IndexTTS 启动：{' '.join(cmd[:6])} …")
        env = os.environ.copy()
        env["UV_PYTHON"] = env.get("UV_PYTHON") or "3.11"
        # Run from IndexTTS root so checkpoints resolve
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
            for line in text_out.splitlines()[-20:]:
                self._log(task, line)
        if proc.returncode != 0:
            raise RuntimeError(f"IndexTTS 失败 (code={proc.returncode})")
        if not out_path.is_file() or out_path.stat().st_size < 64:
            raise RuntimeError("IndexTTS 未写出有效音频")

    async def _run_edge(
        self,
        *,
        text: str,
        out_path: Path,
        voice: str,
        speed: float,
        task: dict,
    ) -> None:
        self._log(task, f"Edge-TTS 合成 voice={voice} speed={speed}")
        actual = await self.edge_synthesize(text, out_path, voice=voice or None, speed=speed or None)
        if actual and Path(actual) != out_path:
            shutil.copy2(actual, out_path)

    async def _execute(self, task_id: str) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        t0 = time.time()
        try:
            task["status"] = "running"
            task["stage"] = "synthesize"
            task_dir = self._task_dir(task)
            out_wav = task_dir / "speech.wav"
            text = task["text"]
            engine = task.get("engine") or "auto"
            ref_path = Path(task["ref_path"]) if task.get("ref_path") else None
            status = indextts_ready()
            use_local = False
            if engine in ("indextts", "local", "auto"):
                if ref_path and ref_path.is_file() and status["ready"]:
                    use_local = True
                elif engine in ("indextts", "local") and not status["ready"]:
                    raise RuntimeError(
                        "本地 IndexTTS 未就绪。请运行 comfyui-api-server/scripts/setup_indextts.py"
                    )
                elif engine in ("indextts", "local") and not ref_path:
                    raise RuntimeError("声音克隆需要上传参考音频（建议 5–15 秒清晰人声）")

            if use_local:
                task["engine_used"] = "indextts2.5"
                await self._run_indextts(
                    text=text,
                    ref_path=ref_path,  # type: ignore[arg-type]
                    out_path=out_wav,
                    lang=task.get("lang") or "ZH",
                    duration_factor=float(task.get("duration_factor") or 1.0),
                    task=task,
                )
            else:
                if engine == "auto" and ref_path:
                    self._log(task, "IndexTTS 未就绪，回退 Edge-TTS（无克隆）")
                task["engine_used"] = "edge-tts"
                await self._run_edge(
                    text=text,
                    out_path=out_wav,
                    voice=task.get("voice") or "",
                    speed=float(task.get("speed") or 1.0),
                    task=task,
                )

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
            self._log(task, f"完成，耗时 {_format_elapsed(elapsed)}" + (f"，时长 {dur:.1f}s" if dur else ""))
            task["status"] = "done"
            task["stage"] = "done"
            task["progress"] = {"current": 1, "total": 1}
            # persist meta
            meta = {
                "task_id": task_id,
                "text": text,
                "engine": task.get("engine"),
                "engine_used": task.get("engine_used"),
                "lang": task.get("lang"),
                "voice": task.get("voice"),
                "speed": task.get("speed"),
                "duration_factor": task.get("duration_factor"),
                "created_at": task.get("created_at_cn"),
                "duration_sec": dur,
                "audio": "speech.wav",
            }
            (task_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            task["status"] = "error"
            task["error"] = str(e)
            self._log(task, f"失败：{e}")

    def register(self, app) -> None:
        api = self

        @app.get("/tts/defaults")
        @app.get("/api/tts/defaults")
        async def tts_defaults():
            st = indextts_ready()
            return {
                "success": True,
                "indextts": st,
                "engines": {
                    "auto": "自动（有参考音且本地就绪则克隆，否则 Edge-TTS）",
                    "indextts": "本地 IndexTTS-2.5 声音克隆",
                    "edge": "Edge-TTS（云端，无克隆）",
                },
                "default_engine": "auto",
                "langs": {"ZH": "中文", "EN": "English", "JA": "日本語", "ES": "Español", "AR": "العربية", "AUTO": "自动"},
                "voices_edge": {
                    "zh-CN-XiaoxiaoNeural": "晓晓（女）",
                    "zh-CN-YunxiNeural": "云希（男）",
                    "zh-CN-YunyangNeural": "云扬（男）",
                    "zh-CN-XiaoyiNeural": "晓伊（女）",
                },
                "hint": "工作流：本地 IndexTTS-2.5（D:\\sd\\index-tts）。模型：IndexTeam/IndexTTS-2.5。克隆需上传参考音频。",
            }

        @app.get("/tts/status")
        @app.get("/api/tts/status")
        async def tts_engine_status():
            return {"success": True, **indextts_ready()}

        @app.post("/tts/start")
        @app.post("/api/tts/start")
        async def tts_start(
            text: str = Form(""),
            engine: str = Form("auto"),
            lang: str = Form("AUTO"),
            voice: str = Form("zh-CN-XiaoxiaoNeural"),
            speed: str = Form("1.0"),
            duration_factor: str = Form("1.0"),
            voice_id: str = Form(""),
            ref_audio: Optional[UploadFile] = File(None),
        ):
            body = (text or "").strip()
            if len(body) < 1:
                raise HTTPException(status_code=400, detail="请填写要合成的文本")
            if len(body) > 5000:
                raise HTTPException(status_code=400, detail="文本过长（最多 5000 字）")
            eng = (engine or "auto").strip().lower()
            if eng not in ("auto", "indextts", "local", "edge"):
                eng = "auto"
            try:
                spd = float(speed or "1.0")
            except Exception:
                spd = 1.0
            spd = max(0.5, min(2.0, spd))
            try:
                df = float(duration_factor or "1.0")
            except Exception:
                df = 1.0
            df = max(0.5, min(2.0, df))
            lang_n = _detect_lang(body, lang)

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
                "text": body,
                "engine": eng,
                "lang": lang_n,
                "voice": (voice or "").strip() or "zh-CN-XiaoxiaoNeural",
                "speed": spd,
                "duration_factor": df,
                "voice_id": (voice_id or "").strip(),
                "ref_path": "",
                "audio_url": "",
                "audio_urls": [],
                "timing": {},
            }
            api.tasks[task_id] = task
            task_dir = api._task_dir(task)
            if ref_audio is not None and ref_audio.filename:
                raw = await ref_audio.read()
                if raw:
                    suffix = Path(ref_audio.filename).suffix.lower() or ".wav"
                    if suffix not in (".wav", ".mp3", ".flac", ".ogg", ".m4a", ".webm"):
                        suffix = ".wav"
                    ref_path = task_dir / f"ref{suffix}"
                    ref_path.write_bytes(raw)
                    task["ref_path"] = str(ref_path)
                    api._log(task, f"已保存参考音频 {ref_path.name}（{len(raw)} bytes）")
            elif (voice_id or "").strip():
                lib_ref = api._resolve_voice_ref(voice_id)
                if lib_ref is None:
                    raise HTTPException(status_code=404, detail="音色库中找不到该参考音")
                suffix = lib_ref.suffix.lower() or ".wav"
                ref_path = task_dir / f"ref{suffix}"
                shutil.copy2(lib_ref, ref_path)
                task["ref_path"] = str(ref_path)
                api._log(task, f"已从音色库复制参考音 {voice_id} → {ref_path.name}")
            api._log(task, f"任务创建 engine={eng} lang={lang_n} chars={len(body)}")
            asyncio.create_task(api._execute(task_id))
            return {"success": True, "task_id": task_id, "output_dir": out_dir}

        @app.get("/tts/task/{task_id}")
        @app.get("/api/tts/task/{task_id}")
        async def tts_task(task_id: str):
            task = api.tasks.get(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            return {"success": True, **task}

        @app.get("/tts/history")
        @app.get("/api/tts/history")
        async def tts_history(limit: int = 30):
            items: List[dict] = []
            for d in list_task_dirs(api.output_root, "tts", limit=max(1, min(100, int(limit or 30)))):
                meta_path = d / "meta.json"
                meta = {}
                if meta_path.is_file():
                    try:
                        meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    except Exception:
                        meta = {}
                wav = d / "speech.wav"
                rel = rel_to_root(api.output_root, d) or d.name
                items.append(
                    {
                        "folder": rel,
                        "created_at": meta.get("created_at") or "",
                        "text": meta.get("text") or "",
                        "engine": meta.get("engine") or "",
                        "engine_used": meta.get("engine_used") or "",
                        "lang": meta.get("lang") or "",
                        "voice": meta.get("voice") or "",
                        "speed": meta.get("speed"),
                        "duration_factor": meta.get("duration_factor"),
                        "audio_url": api._public_url(wav) if wav.is_file() else "",
                        "duration_sec": meta.get("duration_sec"),
                    }
                )
            return {"success": True, "items": items}

        @app.post("/tts/delete")
        @app.post("/api/tts/delete")
        async def tts_delete(folder: str = Form("")):
            rel = (folder or "").strip().replace("\\", "/")
            if not rel:
                raise HTTPException(status_code=400, detail="缺少 folder")
            try:
                deleted = delete_task_dir(api.output_root, rel, category="tts")
            except FileNotFoundError as e:
                raise HTTPException(status_code=404, detail=str(e)) from e
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            return {"success": True, "folder": rel_to_root(api.output_root, deleted)}

        @app.get("/tts/voices")
        @app.get("/api/tts/voices")
        async def tts_voices_list():
            return {"success": True, "items": api._list_voice_items()}

        @app.post("/tts/voices")
        @app.post("/api/tts/voices")
        async def tts_voices_save(
            name: str = Form(""),
            notes: str = Form(""),
            ref_audio: UploadFile = File(...),
        ):
            label = (name or "").strip() or (ref_audio.filename or "voice").rsplit(".", 1)[0]
            raw = await ref_audio.read()
            if not raw or len(raw) < 256:
                raise HTTPException(status_code=400, detail="参考音频无效")
            suffix = Path(ref_audio.filename or "ref.wav").suffix.lower() or ".wav"
            if suffix not in (".wav", ".mp3", ".flac", ".ogg", ".m4a", ".webm"):
                suffix = ".wav"
            voice_id = uuid.uuid4().hex[:12]
            d = api._voices_root() / voice_id
            d.mkdir(parents=True, exist_ok=True)
            ref_path = d / f"ref{suffix}"
            ref_path.write_bytes(raw)
            meta = {
                "id": voice_id,
                "name": label[:80],
                "ref": ref_path.name,
                "notes": (notes or "").strip()[:200],
                "created_at": _cn_now_str(),
            }
            (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
            return {
                "success": True,
                "id": voice_id,
                "name": meta["name"],
                "ref_url": api._public_url(ref_path),
                "created_at": meta["created_at"],
            }

        @app.post("/tts/voices/delete")
        @app.post("/api/tts/voices/delete")
        async def tts_voices_delete(voice_id: str = Form("")):
            try:
                deleted = delete_task_dir(api.output_root, f"voices/{(voice_id or '').strip()}", category="voices")
            except FileNotFoundError as e:
                raise HTTPException(status_code=404, detail=str(e)) from e
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            return {"success": True, "folder": rel_to_root(api.output_root, deleted)}

        @app.post("/tts/open-dir")
        @app.post("/api/tts/open-dir")
        async def tts_open_dir(folder: str = Form("")):
            rel = (folder or "").strip().replace("\\", "/")
            d = resolve_task_dir(api.output_root, rel)
            if d is None or not d.is_dir():
                raise HTTPException(status_code=404, detail="目录不存在")
            try:
                subprocess.Popen(["explorer", str(d)])
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))
            return {"success": True, "path": str(d)}
