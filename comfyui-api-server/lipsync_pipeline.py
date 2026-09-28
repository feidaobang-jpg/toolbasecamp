"""
数字人 / 唇形同步流水线（本地引擎）。

链路：人物图 + 台词 ──┬─▶ TTS（本地 IndexTTS / Edge）─▶ 音频
                      └─▶ 静帧视频（ffmpeg 或 Wan2.2 I2V）
                                 ↓
                       唇形同步引擎（LatentSync / MuseTalk / Wav2Lip）
                                 ↓
                          output/lipsync/{date}_dh_*/talking.mp4

引擎以独立项目形式装在 D:\\sd\\{latentsync,musetalk,wav2lip}
（同 image_to_3d / index-tts 约定：各自 .venv + .tbc_ready + scripts/lipsync_worker.py）。

安装：python scripts/setup_lipsync.py --engine latentsync
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from fastapi import File, Form, HTTPException, UploadFile

from cn_time import cn_now, cn_now_str, cn_stamp_dir
from output_layout import (
    alloc_under,
    category_dir,
    delete_task_dir,
    list_task_dirs,
    rel_to_root,
    resolve_task_dir,
)

_TASKS: Dict[str, dict] = {}

_WORKER = Path(__file__).resolve().parent / "scripts" / "lipsync_worker.py"

# 单次生成音频上限（秒）。口型模型对长视频显存/耗时压力大，且口播场景通常不需要。
_MAX_AUDIO_SEC = 180.0

_ENGINES = {
    "musetalk": {
        "label": "MuseTalk 1.5（速度优先）",
        "tier": "fast",
        "root_env": "MUSETALK_ROOT",
        "default_root": Path(r"D:\sd\musetalk"),
        "hint": "≥8GB 显存可跑，几十秒视频通常在 1–3 分钟。",
        "weights": [
            "models/musetalkV15/unet.pth",
            "models/musetalkV15/musetalk.json",
            "models/whisper/pytorch_model.bin",
            "models/whisper/config.json",
            "models/whisper/preprocessor_config.json",
            "models/sd-vae/diffusion_pytorch_model.bin",
            "models/sd-vae/config.json",
            "models/dwpose/dw-ll_ucoco_384.pth",
            "models/face-parse-bisent/79999_iter.pth",
            "models/face-parse-bisent/resnet18-5c106cde.pth",
        ],
    },
    "latentsync": {
        "label": "LatentSync 1.6（质量优先）",
        "tier": "quality",
        "root_env": "LATENTSYNC_ROOT",
        "default_root": Path(r"D:\sd\latentsync"),
        "hint": "扩散式口型，细节最好；耗时明显长于 MuseTalk。",
        "weights": [
            "checkpoints/latentsync_unet.pt",
            "checkpoints/whisper/tiny.pt",
            "checkpoints/vae/diffusion_pytorch_model.safetensors",
        ],
    },
    "wav2lip": {
        "label": "Wav2Lip（最快·画质一般）",
        "tier": "draft",
        "root_env": "WAV2LIP_ROOT",
        "default_root": Path(r"D:\sd\wav2lip"),
        "hint": "嘴部区域 96px，糊但极快；适合先看效果。",
        "weights": [
            "checkpoints/wav2lip_gan.pth",
        ],
    },
}

_MOTIONS = {
    "still": "静态图 + 缓慢推近（ffmpeg，秒出，最稳）",
    "wan": "Wan2.2 I2V 生成带动作的视频（显存占用高，慢）",
    "none": "输入已是视频，不做运动预处理",
}


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


def _decode_line(raw: bytes) -> str:
    if not raw:
        return ""
    for enc in ("utf-8", "gbk", "cp936"):
        try:
            return raw.decode(enc).rstrip()
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace").rstrip()


def _engine_root(key: str) -> Path:
    meta = _ENGINES[key]
    raw = (os.environ.get(meta["root_env"]) or "").strip()
    return Path(raw) if raw else Path(meta["default_root"])


def _engine_python(key: str) -> Path:
    """引擎解释器；找不到 venv 时回退当前解释器（仅供报错时打印用）。"""
    root = _engine_root(key)
    win = root / ".venv" / "Scripts" / "python.exe"
    if win.is_file():
        return win
    nix = root / ".venv" / "bin" / "python"
    if nix.is_file():
        return nix
    return Path(sys.executable)


def _has_engine_venv(key: str) -> bool:
    """venv 必须真实存在才算就绪；不能靠回退解释器蒙混过关。"""
    root = _engine_root(key)
    return (root / ".venv" / "Scripts" / "python.exe").is_file() or (
        root / ".venv" / "bin" / "python"
    ).is_file()


def _missing_weights(key: str, root: Path) -> list[str]:
    return [rel for rel in _ENGINES[key].get("weights", []) if not (root / rel).is_file()]


def engine_ready(key: str) -> Dict[str, Any]:
    root = _engine_root(key)
    marker = root / ".tbc_ready"
    has_worker = _WORKER.is_file()
    has_venv = _has_engine_venv(key)
    missing = _missing_weights(key, root) if root.is_dir() else []
    ready = root.is_dir() and has_venv and marker.is_file() and has_worker and not missing
    info: Dict[str, Any] = {
        "engine": key,
        "label": _ENGINES[key]["label"],
        "tier": _ENGINES[key]["tier"],
        "hint": _ENGINES[key]["hint"],
        "ready": bool(ready),
        "root": str(root),
        "has_python": has_venv,
        "has_marker": marker.is_file(),
        "has_worker": has_worker,
        "missing_weights": missing,
    }
    if not ready:
        if not root.is_dir():
            info["reason"] = f"未安装。执行：python scripts/setup_lipsync.py --engine {key}"
        elif not has_venv:
            info["reason"] = (
                f"缺少 venv（{root / '.venv'}）。执行："
                f"python scripts/setup_lipsync.py --engine {key}"
            )
        elif missing:
            shown = "、".join(missing[:3]) + ("…" if len(missing) > 3 else "")
            info["reason"] = (
                f"缺 {len(missing)} 个权重文件（{shown}）。"
                f"下载后执行：python scripts/setup_lipsync.py --engine {key} --mark-ready"
            )
        elif not marker.is_file():
            info["reason"] = (
                f"权重已就位但未写就绪标记。执行："
                f"python scripts/setup_lipsync.py --engine {key} --mark-ready"
            )
        elif not has_worker:
            info["reason"] = f"缺少 worker：{_WORKER}"
    return info


def all_engines_status() -> Dict[str, Any]:
    items = {k: engine_ready(k) for k in _ENGINES}
    return {
        "engines": items,
        "any_ready": any(v["ready"] for v in items.values()),
        "default_engine": next((k for k, v in items.items() if v["ready"]), "musetalk"),
        "worker": str(_WORKER),
    }


def _normalize_engine(raw: str) -> str:
    k = str(raw or "").strip().lower().replace("-", "").replace("_", "")
    if k in ("musetalk", "muse"):
        return "musetalk"
    if k in ("latentsync", "latent"):
        return "latentsync"
    if k in ("wav2lip", "w2l"):
        return "wav2lip"
    return ""


def _even(n: int) -> int:
    return int(n) - (int(n) % 2)


class LipsyncAPI:
    def __init__(
        self,
        output_root: Path,
        *,
        synthesize: Optional[Callable[..., Any]] = None,
        audio_duration_seconds: Optional[Callable[[Path], float]] = None,
        transcode_audio_to_wav: Optional[Callable[[Path, Path], None]] = None,
        ffmpeg_bin: Optional[Callable[[], str]] = None,
        wan_i2v: Optional[Callable[..., Any]] = None,
    ) -> None:
        self.output_root = Path(output_root)
        self.synthesize = synthesize
        self.audio_duration_seconds = audio_duration_seconds
        self.transcode_audio_to_wav = transcode_audio_to_wav
        self.ffmpeg_bin = ffmpeg_bin or (lambda: "ffmpeg")
        self.wan_i2v = wan_i2v
        self.tasks = _TASKS

    # ------------------------------------------------------------------ #
    # 路径 / 日志
    # ------------------------------------------------------------------ #

    def _alloc_dir(self) -> str:
        return alloc_under(self.output_root, "lipsync", f"{cn_stamp_dir()}_dh")

    def _task_dir(self, task: dict) -> Path:
        return Path(self.output_root) / task["folder"]

    def _log(self, task: dict, msg: str) -> None:
        line = f"[{cn_now_str()}] {msg}"
        task.setdefault("logs", []).append(line)
        try:
            with open(self._task_dir(task) / "pipeline.log", "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass

    def _public_url(self, path: Path) -> str:
        rel = rel_to_root(self.output_root, path)
        return f"/output/{rel}".replace("\\", "/")

    # ------------------------------------------------------------------ #
    # 阶段一：拿到音频
    # ------------------------------------------------------------------ #

    async def _resolve_audio(self, task: dict, task_dir: Path) -> Path:
        out_wav = task_dir / "speech.wav"
        text = (task.get("text") or "").strip()
        src = task.get("audio_path")

        if text:
            if not self.synthesize:
                raise RuntimeError("服务端未接入 TTS，无法用文字生成语音；请改为上传音频")
            task["stage"] = "tts"
            task["stage_label"] = "合成语音"
            self._log(task, f"TTS 合成 {len(text)} 字（{task.get('voice') or '默认音色'}）…")
            await self.synthesize(text, out_wav, task.get("voice") or None, task.get("speed"))
            if not out_wav.is_file() or out_wav.stat().st_size < 512:
                raise RuntimeError("TTS 未产出音频")
            task["engine_used_tts"] = "tts"
            return out_wav

        if not src:
            raise RuntimeError("需要上传音频，或填写要说的文字")

        src_path = Path(src)
        task["stage"] = "audio"
        task["stage_label"] = "准备音频"
        if self.transcode_audio_to_wav:
            await asyncio.to_thread(self.transcode_audio_to_wav, src_path, out_wav)
        else:
            shutil.copyfile(src_path, out_wav)
        if not out_wav.is_file() or out_wav.stat().st_size < 512:
            raise RuntimeError("音频转码失败")
        return out_wav

    # ------------------------------------------------------------------ #
    # 阶段二：拿到视频（口型引擎都要视频输入）
    # ------------------------------------------------------------------ #

    def _probe_image_size(self, image_path: Path) -> tuple[int, int]:
        try:
            from PIL import Image

            with Image.open(image_path) as im:
                w, h = im.size
        except Exception:
            w, h = 720, 1280
        long_side = max(w, h) or 1
        scale = 1.0
        if long_side > 1280:
            scale = 1280.0 / long_side
        elif long_side < 512:
            scale = 512.0 / long_side
        return max(2, _even(int(w * scale))), max(2, _even(int(h * scale)))

    def _still_to_video(self, image_path: Path, out_video: Path, seconds: float, zoom: float, task: dict) -> None:
        """静态图 → 时长匹配音频的视频。zoom>1 时叠加极缓慢推近。

        注意 zoompan 的写法：必须让单帧用 d=<总帧数> 展开，zoom 才会在帧间累积。
        若用 `-loop 1` + `d=1`，每个输入帧只出 1 帧且 zoom 不累积，表现为完全不缩放。
        """
        w, h = self._probe_image_size(image_path)
        dur = max(1.0, float(seconds or 3.0))
        fps = 25
        total = max(1, int(round(dur * fps)))
        ff = self.ffmpeg_bin()

        if zoom and zoom > 1.0001:
            z = float(zoom)
            # 单帧用 d=<总帧数> 展开，zoom 才会逐帧累积
            in_args = ["-i", str(image_path)]
            vf = (
                f"scale={w}:{h}:force_original_aspect_ratio=increase,"
                f"crop={w}:{h},"
                f"zoompan=z='min(zoom+{(z - 1.0) / total:.8f},{z})'"
                f":d={total}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}:fps={fps},"
                f"format=yuv420p"
            )
        else:
            # 不缩放时用 -loop 1 循环单帧铺满时长
            in_args = ["-loop", "1", "-i", str(image_path)]
            vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},format=yuv420p"

        cmd = [
            ff, "-y",
            *in_args,
            "-vf", vf,
            "-t", f"{dur:.3f}",
            "-r", str(fps),
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-an",
            str(out_video),
        ]
        self._log(task, f"静帧转视频：{w}x{h} · {dur:.1f}s · {total} 帧" + (f" · 推近 1→{zoom}" if zoom and zoom > 1.0001 else ""))
        proc = subprocess.run(cmd, capture_output=True)
        if proc.returncode != 0 or not out_video.is_file() or out_video.stat().st_size < 1024:
            err = _decode_line(proc.stderr or proc.stdout or b"")[-600:]
            raise RuntimeError(f"ffmpeg 生成视频失败：{err}")

    async def _resolve_video(self, task: dict, task_dir: Path, audio_path: Path) -> Path:
        if task.get("source_video"):
            task["stage"] = "video"
            task["stage_label"] = "使用上传视频"
            self._log(task, "直接使用上传的视频")
            return Path(task["source_video"])

        image_path = Path(task["image_path"])
        dur = float(task.get("audio_duration") or 0.0)
        if dur <= 0:
            dur = 6.0
        out_video = task_dir / "base.mp4"
        motion = task.get("motion") or "still"

        if motion == "wan" and self.wan_i2v:
            task["stage"] = "motion"
            task["stage_label"] = "生成动作视频"
            self._log(task, f"Wan2.2 I2V 生成 {dur:.1f}s 运动视频（较慢）…")
            await self.wan_i2v(image_path, out_video, task.get("motion_prompt") or "", dur)
            if not out_video.is_file() or out_video.stat().st_size < 1024:
                raise RuntimeError("Wan I2V 未产出视频")
            return out_video

        if motion == "wan" and not self.wan_i2v:
            self._log(task, "服务端未接入 Wan I2V，回退静帧视频")

        task["stage"] = "motion"
        task["stage_label"] = "准备画面"
        await asyncio.to_thread(
            self._still_to_video,
            image_path,
            out_video,
            dur,
            float(task.get("still_zoom") or 1.0),
            task,
        )
        return out_video

    # ------------------------------------------------------------------ #
    # 阶段三：唇形同步
    # ------------------------------------------------------------------ #

    def _worker_cmd(self, engine: str, video: Path, audio: Path, out: Path, task: dict) -> List[str]:
        cmd = [
            str(_engine_python(engine)),
            str(_WORKER),
            "--engine", engine,
            "--video", str(video),
            "--audio", str(audio),
            "--out", str(out),
            "--root", str(_engine_root(engine)),
            "--seed", str(int(task.get("seed") or 1247)),
        ]
        if engine == "musetalk":
            cmd += ["--version", str(task.get("musetalk_version") or "v15")]
            cmd += ["--bbox-shift", str(int(task.get("bbox_shift") or 0))]
        elif engine == "latentsync":
            cmd += ["--steps", str(int(task.get("steps") or 20))]
            cmd += ["--guidance", str(float(task.get("guidance") or 1.5))]
        elif engine == "wav2lip":
            cmd += ["--resize-factor", str(int(task.get("resize_factor") or 1))]
        return cmd

    def _worker_env(self, engine: str) -> dict:
        env = os.environ.copy()
        root = str(_engine_root(engine))
        env[_ENGINES[engine]["root_env"]] = root
        env["PYTHONPATH"] = root + os.pathsep + env.get("PYTHONPATH", "")
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        env.setdefault("TQDM_DISABLE", "1")
        if os.environ.get("HF_ENDPOINT"):
            env["HF_ENDPOINT"] = os.environ["HF_ENDPOINT"]
        return env

    async def _run_worker(self, engine: str, video: Path, audio: Path, out: Path, task: dict) -> None:
        cmd = self._worker_cmd(engine, video, audio, out, task)
        self._log(task, "引擎命令：" + " ".join(cmd))
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(_engine_root(engine)),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=self._worker_env(engine),
        )
        task["_proc"] = proc
        assert proc.stdout is not None

        tail: List[str] = []
        pct = 0

        async def _pump() -> None:
            nonlocal pct
            while True:
                raw = await proc.stdout.readline()
                if not raw:
                    break
                line = _decode_line(raw)
                if not line:
                    continue
                tail.append(line)
                del tail[:-40]
                s = line.strip()
                if s.startswith("RUN "):
                    task["stage_label"] = "引擎推理中"
                elif pct < 95:
                    pct = min(95, pct + 1)
                    task["progress"] = {"current": pct, "total": 100}
                self._log(task, s)

        pump = asyncio.create_task(_pump())
        try:
            while not pump.done():
                if task.get("cancel"):
                    proc.kill()
                    await asyncio.gather(pump, return_exceptions=True)
                    raise RuntimeError("已取消")
                await asyncio.sleep(0.3)
            await pump
        finally:
            task.pop("_proc", None)

        rc = int(proc.returncode or 0)
        if rc != 0:
            detail = "\n".join(tail[-12:])
            raise RuntimeError(f"引擎退出码 {rc}。末尾日志：\n{detail}")
        if not out.is_file() or out.stat().st_size < 1024:
            raise RuntimeError("引擎未产出视频文件")

    # ------------------------------------------------------------------ #
    # 主执行
    # ------------------------------------------------------------------ #

    async def _execute(self, task_id: str) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        t0 = time.time()
        try:
            task["status"] = "running"
            task_dir = self._task_dir(task)
            task_dir.mkdir(parents=True, exist_ok=True)
            engine = task["engine"]
            self._log(task, f"引擎：{_ENGINES[engine]['label']}（{_engine_root(engine)}）")

            audio_path = await self._resolve_audio(task, task_dir)
            dur = 0.0
            if self.audio_duration_seconds:
                try:
                    dur = float(self.audio_duration_seconds(audio_path))
                except Exception:
                    dur = 0.0
            task["audio_duration"] = dur
            if dur > _MAX_AUDIO_SEC:
                raise RuntimeError(f"音频 {dur:.0f}s 超过单次上限 {_MAX_AUDIO_SEC:.0f}s，请分段生成")
            self._log(task, f"音频就绪：{dur:.1f}s" if dur else "音频就绪")

            video_path = await self._resolve_video(task, task_dir, audio_path)

            task["stage"] = "lipsync"
            task["stage_label"] = "口型同步"
            task["progress"] = {"current": 0, "total": 100}
            out_mp4 = task_dir / "talking.mp4"
            self._log(task, "开始口型同步…")
            await self._run_worker(engine, video_path, audio_path, out_mp4, task)

            url = self._public_url(out_mp4)
            elapsed = time.time() - t0
            task["video_url"] = url
            task["video_urls"] = [url]
            task["progress"] = {"current": 100, "total": 100}
            task["timing"] = {"total_sec": round(elapsed, 2)}
            self._log(task, f"完成，耗时 {_format_elapsed(elapsed)}")
            task["status"] = "done"
            task["stage"] = "done"
            task["stage_label"] = "完成"

            (task_dir / "meta.json").write_text(
                json.dumps(
                    {
                        "task_id": task_id,
                        "created_at": task.get("created_at_cn") or cn_now().strftime("%Y-%m-%d %H:%M:%S"),
                        "engine": engine,
                        "text": task.get("text") or "",
                        "voice": task.get("voice") or "",
                        "motion": task.get("motion"),
                        "audio_duration": dur,
                        "elapsed_sec": round(elapsed, 2),
                        "video": "talking.mp4",
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
        except Exception as e:
            task["status"] = "error"
            task["error"] = str(e)
            self._log(task, f"失败：{e}")

    # ------------------------------------------------------------------ #
    # 路由
    # ------------------------------------------------------------------ #

    def register(self, app) -> None:
        api = self

        @app.get("/lipsync/defaults")
        @app.get("/api/lipsync/defaults")
        async def lipsync_defaults():
            st = all_engines_status()
            return {
                "success": True,
                "engines": st["engines"],
                "default_engine": st["default_engine"],
                "any_ready": st["any_ready"],
                "motions": _MOTIONS,
                "default_motion": "still",
                "tts_available": bool(api.synthesize),
                "max_audio_sec": _MAX_AUDIO_SEC,
                "hint": (
                    "本地唇形同步：人物图 + 台词 → 说话视频。"
                    "引擎需先执行 scripts/setup_lipsync.py 安装。"
                ),
                "privacy_note": "全部计算在本机完成，素材不出内网。",
            }

        @app.get("/lipsync/status")
        @app.get("/api/lipsync/status")
        async def lipsync_status():
            return {"success": True, **all_engines_status()}

        @app.post("/lipsync/start")
        @app.post("/api/lipsync/start")
        async def lipsync_start(
            image: Optional[UploadFile] = File(None),
            audio: Optional[UploadFile] = File(None),
            video: Optional[UploadFile] = File(None),
            text: str = Form(""),
            engine: str = Form(""),
            motion: str = Form("still"),
            motion_prompt: str = Form(""),
            still_zoom: str = Form("1.0"),
            voice: str = Form(""),
            speed: str = Form("1.0"),
            seed: str = Form("1247"),
            steps: str = Form("20"),
            guidance: str = Form("1.5"),
            musetalk_version: str = Form("v15"),
            bbox_shift: str = Form("0"),
            resize_factor: str = Form("1"),
        ):
            body = (text or "").strip()
            if not image and not video:
                raise HTTPException(status_code=400, detail="请上传人物图片或视频")
            if not body and not audio:
                raise HTTPException(status_code=400, detail="请填写要说的文字，或上传音频")

            raw_engine = (engine or "").strip()
            eng = _normalize_engine(raw_engine)
            if raw_engine and not eng:
                allowed = "、".join(_ENGINES)
                raise HTTPException(
                    status_code=400, detail=f"未知引擎：{raw_engine}（可选：{allowed}）"
                )
            if not eng:
                eng = all_engines_status()["default_engine"]
            ready = engine_ready(eng)
            if not ready["ready"]:
                raise HTTPException(
                    status_code=400,
                    detail=ready.get("reason") or f"引擎 {eng} 未就绪",
                )

            mt = (motion or "still").strip().lower()
            if mt not in _MOTIONS:
                mt = "still"
            if video:
                mt = "none"

            folder = api._alloc_dir()
            task_dir = Path(api.output_root) / folder
            task_dir.mkdir(parents=True, exist_ok=True)

            task_id = uuid.uuid4().hex[:12]
            task: dict = {
                "task_id": task_id,
                "folder": folder,
                "status": "queued",
                "stage": "queued",
                "stage_label": "排队中",
                "created_at_cn": cn_now().strftime("%Y-%m-%d %H:%M:%S"),
                "engine": eng,
                "motion": mt,
                "motion_prompt": (motion_prompt or "").strip()[:600],
                "text": body,
                "voice": (voice or "").strip(),
                "logs": [],
                "progress": {"current": 0, "total": 100},
            }
            try:
                task["speed"] = float(speed or "1.0")
            except ValueError:
                task["speed"] = 1.0
            try:
                task["still_zoom"] = float(still_zoom or "1.0")
            except ValueError:
                task["still_zoom"] = 1.0
            numeric_raw = {
                "seed": seed,
                "steps": steps,
                "bbox_shift": bbox_shift,
                "resize_factor": resize_factor,
            }
            for key, cast, default in (
                ("seed", int, 1247),
                ("steps", int, 20),
                ("bbox_shift", int, 0),
                ("resize_factor", int, 1),
            ):
                try:
                    task[key] = cast(str(numeric_raw[key] or default))
                except (ValueError, TypeError):
                    task[key] = default
            try:
                task["guidance"] = float(guidance or "1.5")
            except ValueError:
                task["guidance"] = 1.5
            task["musetalk_version"] = (musetalk_version or "v15").strip() or "v15"

            if image is not None:
                ext = Path(image.filename or "face.png").suffix.lower()
                if ext not in (".jpg", ".jpeg", ".png", ".webp", ".bmp"):
                    ext = ".png"
                img_path = task_dir / f"face{ext}"
                img_path.write_bytes(await image.read())
                if img_path.stat().st_size < 512:
                    raise HTTPException(status_code=400, detail="图片文件过小或读取失败")
                task["image_path"] = str(img_path)

            if audio is not None:
                ext = Path(audio.filename or "speech.wav").suffix.lower()
                if ext not in (".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac"):
                    ext = ".wav"
                aud_path = task_dir / f"input_audio{ext}"
                aud_path.write_bytes(await audio.read())
                if aud_path.stat().st_size < 512:
                    raise HTTPException(status_code=400, detail="音频文件过小或读取失败")
                task["audio_path"] = str(aud_path)

            if video is not None:
                ext = Path(video.filename or "source.mp4").suffix.lower()
                if ext not in (".mp4", ".mov", ".mkv", ".webm", ".avi"):
                    ext = ".mp4"
                vid_path = task_dir / f"source{ext}"
                vid_path.write_bytes(await video.read())
                if vid_path.stat().st_size < 1024:
                    raise HTTPException(status_code=400, detail="视频文件过小或读取失败")
                task["source_video"] = str(vid_path)

            self.tasks[task_id] = task
            asyncio.create_task(self._execute(task_id))
            return {"success": True, "task_id": task_id, "folder": folder, "engine": eng}

        @app.get("/lipsync/task/{task_id}")
        @app.get("/api/lipsync/task/{task_id}")
        async def lipsync_task(task_id: str):
            task = api.tasks.get(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            safe = {k: v for k, v in task.items() if not k.startswith("_")}
            return {"success": True, **safe}

        @app.post("/lipsync/cancel/{task_id}")
        @app.post("/api/lipsync/cancel/{task_id}")
        async def lipsync_cancel(task_id: str):
            task = api.tasks.get(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            task["cancel"] = True
            return {"success": True}

        @app.get("/lipsync/history")
        @app.get("/api/lipsync/history")
        async def lipsync_history(limit: int = 30):
            items: List[dict] = []
            for d in list_task_dirs(api.output_root, "lipsync", limit=max(1, min(100, int(limit or 30)))):
                meta_path = d / "meta.json"
                meta: dict = {}
                if meta_path.is_file():
                    try:
                        meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    except Exception:
                        meta = {}
                mp4 = d / "talking.mp4"
                rel = rel_to_root(api.output_root, d) or d.name
                items.append(
                    {
                        "folder": rel,
                        "created_at": meta.get("created_at") or "",
                        "text": meta.get("text") or "",
                        "engine": meta.get("engine") or "",
                        "motion": meta.get("motion") or "",
                        "audio_duration": meta.get("audio_duration"),
                        "elapsed_sec": meta.get("elapsed_sec"),
                        "video_url": api._public_url(mp4) if mp4.is_file() else "",
                    }
                )
            return {"success": True, "items": items}

        @app.post("/lipsync/delete")
        @app.post("/api/lipsync/delete")
        async def lipsync_delete(folder: str = Form("")):
            rel = (folder or "").strip().replace("\\", "/")
            if not rel:
                raise HTTPException(status_code=400, detail="缺少 folder")
            try:
                deleted = delete_task_dir(api.output_root, rel, category="lipsync")
            except FileNotFoundError as e:
                raise HTTPException(status_code=404, detail=str(e)) from e
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            return {"success": True, "folder": rel_to_root(api.output_root, deleted)}

        @app.post("/lipsync/open-dir")
        @app.post("/api/lipsync/open-dir")
        async def lipsync_open_dir(folder: str = Form("")):
            rel = (folder or "").strip().replace("\\", "/")
            d = resolve_task_dir(api.output_root, rel)
            if d is None or not d.is_dir():
                raise HTTPException(status_code=404, detail="目录不存在")
            try:
                subprocess.Popen(["explorer", str(d)])
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))
            return {"success": True, "path": str(d)}
