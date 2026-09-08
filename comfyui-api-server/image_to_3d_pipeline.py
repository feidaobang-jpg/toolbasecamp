"""
图生 3D：多引擎依次生成便于对比。

引擎：
- triposr   快
- hunyuan3d 均衡
- trellis   质量

输出：output/mesh3d/{date}_i23d_*/{engine}/mesh.glb
"""
from __future__ import annotations

import asyncio
import json
import os
import platform
import subprocess
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List
from cn_time import CN_TZ, cn_now, cn_now_str, cn_stamp_dir

from fastapi import File, Form, HTTPException, UploadFile

from output_layout import (
    alloc_under,
    delete_task_dir,
    ensure_reserved_dirs,
    list_task_dirs,
    rel_to_root,
    resolve_task_dir,
)

_I23D_TASKS: Dict[str, dict] = {}

_WORKER = Path(__file__).resolve().parent / "scripts" / "i23d_worker.py"

_ENGINES = {
    "triposr": {
        "label": "TripoSR（快）",
        "tier": "fast",
        "root_env": "TRIPOSR_ROOT",
        "default_root": Path(r"D:\sd\triposr"),
    },
    "hunyuan3d": {
        "label": "Hunyuan3D（均衡）",
        "tier": "balanced",
        "root_env": "HUNYUAN3D_ROOT",
        "default_root": Path(r"D:\sd\hunyuan3d"),
    },
    "trellis": {
        "label": "TRELLIS（质量）",
        "tier": "quality",
        "root_env": "TRELLIS_ROOT",
        "default_root": Path(r"D:\sd\trellis"),
    },
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


def _decode_worker_line(raw: bytes) -> str:
    """Decode subprocess stdout: prefer UTF-8, fallback GBK (legacy Windows console)."""
    if not raw:
        return ""
    for enc in ("utf-8", "gbk", "cp936"):
        try:
            return raw.decode(enc).rstrip()
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace").rstrip()


def _worker_env(engine: str) -> dict:
    env = os.environ.copy()
    root = str(_engine_root(engine))
    env[_ENGINES[engine]["root_env"]] = root
    env["PYTHONPATH"] = root + os.pathsep + env.get("PYTHONPATH", "")
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    env["TQDM_DISABLE"] = "1"
    # 不默认强制 HF 镜像：hf-mirror 会导致 hub 报 missing commit header。
    # 需要镜像时由本机环境自行设置 HF_ENDPOINT。
    if engine == "triposr":
        env.setdefault("HF_HUB_OFFLINE", "1")
    if engine == "hunyuan3d":
        hy = Path(os.environ.get("HY3DGEN_MODELS", Path.home() / ".cache" / "hy3dgen")).expanduser()
        dit = hy / "tencent" / "Hunyuan3D-2" / "hunyuan3d-dit-v2-0"
        if dit.is_dir():
            env["HF_HUB_OFFLINE"] = "1"
    if engine == "trellis":
        # 默认 flash_attn；本机常无。先钉 xformers，避免加载失败后误走 Hub ckpts/*
        env.setdefault("ATTN_BACKEND", "xformers")
        env.setdefault("SPARSE_ATTN_BACKEND", "xformers")
    return env


def _engine_root(key: str) -> Path:
    meta = _ENGINES[key]
    raw = (os.environ.get(meta["root_env"]) or "").strip()
    return Path(raw) if raw else Path(meta["default_root"])


def _engine_python(key: str) -> Path:
    root = _engine_root(key)
    win = root / ".venv" / "Scripts" / "python.exe"
    if win.is_file():
        return win
    nix = root / ".venv" / "bin" / "python"
    if nix.is_file():
        return nix
    return Path(sys.executable)


def engine_ready(key: str) -> Dict[str, Any]:
    root = _engine_root(key)
    py = _engine_python(key)
    marker = root / ".tbc_ready"
    has_worker = _WORKER.is_file()
    ready = root.is_dir() and py.is_file() and marker.is_file() and has_worker
    return {
        "engine": key,
        "label": _ENGINES[key]["label"],
        "tier": _ENGINES[key]["tier"],
        "ready": bool(ready),
        "root": str(root),
        "has_python": py.is_file(),
        "has_marker": marker.is_file(),
        "has_worker": has_worker,
    }


def all_engines_status() -> Dict[str, Any]:
    items = {k: engine_ready(k) for k in _ENGINES}
    any_ready = any(v["ready"] for v in items.values())
    return {"engines": items, "any_ready": any_ready, "worker": str(_WORKER)}


def _parse_engines(raw: str) -> List[str]:
    text = (raw or "").strip()
    out: List[str] = []
    if text.startswith("["):
        try:
            arr = json.loads(text)
            if isinstance(arr, list):
                for x in arr:
                    k = str(x or "").strip().lower().replace("-", "_")
                    if k in ("hunyuan", "hy3d"):
                        k = "hunyuan3d"
                    if k in _ENGINES and k not in out:
                        out.append(k)
        except Exception:
            pass
    if not out:
        for part in text.replace(";", ",").split(","):
            k = part.strip().lower().replace("-", "_")
            if k in ("hunyuan", "hy3d"):
                k = "hunyuan3d"
            if k in _ENGINES and k not in out:
                out.append(k)
    if not out:
        out = ["triposr"]
    return out


class ImageTo3dAPI:
    def __init__(self, *, output_root: Path):
        self.output_root = Path(output_root)
        self.tasks = _I23D_TASKS
        ensure_reserved_dirs(self.output_root)

    def _alloc_dir(self) -> str:
        stamp = cn_stamp_dir()
        return alloc_under(self.output_root, "mesh3d", f"{stamp}_i23d")

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

    async def _run_engine(self, *, task: dict, engine: str, image_path: Path) -> dict:
        st = engine_ready(engine)
        if not st["ready"]:
            raise RuntimeError(
                f"{_ENGINES[engine]['label']} 未就绪。请运行 "
                f"scripts/setup_image_to_3d.py --engine {engine}"
            )
        task_dir = self._task_dir(task)
        eng_dir = task_dir / engine
        eng_dir.mkdir(parents=True, exist_ok=True)
        py = _engine_python(engine)
        cmd = [
            str(py),
            str(_WORKER),
            "--engine",
            engine,
            "--image",
            str(image_path),
            "--out-dir",
            str(eng_dir),
            "--seed",
            str(int(task.get("seed") or -1)),
        ]
        env = _worker_env(engine)
        if engine == "hunyuan3d":
            self._log(
                task,
                "hunyuan3d：优先使用本地权重；若缺失才会下载（可能较久）…",
            )
        self._log(task, f"{engine} 启动…")
        t0 = time.time()
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(_engine_root(engine)),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        assert proc.stdout is not None
        lines: List[str] = []
        while True:
            raw = await proc.stdout.readline()
            if not raw:
                break
            line = _decode_worker_line(raw)
            if not line:
                continue
            lines.append(line)
            s = line.strip()
            if not s or "it/s]" in s or "UserWarning" in s or "FutureWarning" in s:
                continue
            if "_torch_pytree" in s or "deprecated" in s.lower():
                continue
            self._log(task, s)
        await proc.wait()
        elapsed = round(time.time() - t0, 2)
        if proc.returncode != 0:
            # 失败时补几行尾部便于排查
            for s in lines[-8:]:
                if s.strip():
                    self._log(task, s.strip())
            raise RuntimeError(f"{engine} 失败 (code={proc.returncode})")
        mesh = eng_dir / "mesh.glb"
        if not mesh.is_file():
            mesh = eng_dir / "mesh.obj"
        if not mesh.is_file():
            raise RuntimeError(f"{engine} 未写出 mesh")
        preview = eng_dir / "preview.png"
        item = {
            "engine": engine,
            "label": _ENGINES[engine]["label"],
            "filename": mesh.name,
            "url": self._public_url(mesh),
            "preview_url": self._public_url(preview) if preview.is_file() else "",
            "elapsed_sec": elapsed,
            "bytes": mesh.stat().st_size,
        }
        self._log(task, f"{engine} 完成，耗时 {elapsed}s，{mesh.name} {item['bytes']} bytes")
        return item

    async def _execute(self, task_id: str) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        t0 = time.time()
        try:
            task["status"] = "running"
            task["stage"] = "prepare"
            task_dir = self._task_dir(task)
            image_path = Path(task.get("image_path") or "")
            if not image_path.is_file():
                raise RuntimeError("缺少输入图")
            engines: List[str] = list(task.get("engines") or ["triposr"])
            mesh_urls: List[dict] = []
            last = None
            total = len(engines)
            for i, eng in enumerate(engines):
                if task.get("cancel"):
                    task["status"] = "cancelled"
                    self._log(task, "已取消")
                    return
                task["stage"] = eng
                task["progress"] = {"current": i, "total": total}
                try:
                    item = await self._run_engine(task=task, engine=eng, image_path=image_path)
                    mesh_urls.append(item)
                    last = item
                except Exception as e:
                    self._log(task, f"{eng} 错误：{e}")
                    mesh_urls.append(
                        {
                            "engine": eng,
                            "label": _ENGINES[eng]["label"],
                            "error": str(e),
                            "url": "",
                            "elapsed_sec": 0,
                        }
                    )
            if not last or not last.get("url"):
                errs = [m.get("error") for m in mesh_urls if m.get("error")]
                raise RuntimeError("全部引擎失败：" + "; ".join(errs[:3]))
            task["mesh_url"] = last["url"]
            task["mesh_urls"] = mesh_urls
            task["status"] = "done"
            task["stage"] = "done"
            task["progress"] = {"current": total, "total": total}
            total_sec = round(time.time() - t0, 2)
            task["timing"] = {"total_sec": total_sec}
            self._log(task, f"全部完成，总耗时 {_format_elapsed(total_sec)}")
            meta = {
                "created_at": task.get("created_at_cn") or _cn_now_str(),
                "engines": engines,
                "prompt": task.get("prompt") or "",
                "seed": task.get("seed"),
                "mesh_url": task["mesh_url"],
                "mesh_urls": mesh_urls,
                "timing": task["timing"],
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

        @app.get("/image-to-3d/defaults")
        @app.get("/api/image-to-3d/defaults")
        async def i23d_defaults():
            st = all_engines_status()
            return {
                "success": True,
                "engines": {k: v["label"] for k, v in _ENGINES.items()},
                "engine_meta": st["engines"],
                "default_engines": ["triposr"],
                "hint": (
                    "图生 3D 多引擎对比：TripoSR（快）/ Hunyuan3D（均衡）/ TRELLIS（质量）。"
                    "可多选依次生成。未就绪请运行 scripts/setup_image_to_3d.py"
                ),
                **st,
            }

        @app.get("/image-to-3d/status")
        @app.get("/api/image-to-3d/status")
        async def i23d_engine_status():
            return {"success": True, **all_engines_status()}

        @app.post("/image-to-3d/start")
        @app.post("/api/image-to-3d/start")
        async def i23d_start(
            engines: str = Form("triposr"),
            prompt: str = Form(""),
            seed: str = Form("-1"),
            image: UploadFile = File(...),
        ):
            raw = await image.read()
            if not raw or len(raw) < 128:
                raise HTTPException(status_code=400, detail="请上传有效图片")
            modes = _parse_engines(engines)
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
                "progress": {"current": 0, "total": len(modes)},
                "logs": [],
                "error": "",
                "cancel": False,
                "created_at": _now_ms(),
                "created_at_cn": _cn_now_str(),
                "prompt": (prompt or "").strip(),
                "engines": modes,
                "seed": seed_i,
                "image_path": "",
                "mesh_url": "",
                "mesh_urls": [],
                "timing": {},
            }
            api.tasks[task_id] = task
            task_dir = api._task_dir(task)
            suffix = Path(image.filename or "input.png").suffix.lower() or ".png"
            if suffix not in (".png", ".jpg", ".jpeg", ".webp", ".bmp"):
                suffix = ".png"
            img_path = task_dir / f"input{suffix}"
            img_path.write_bytes(raw)
            task["image_path"] = str(img_path)
            api._log(task, f"任务创建 engines={modes} bytes={len(raw)}")
            asyncio.create_task(api._execute(task_id))
            return {"success": True, "task_id": task_id, "output_dir": out_dir}

        @app.get("/image-to-3d/task/{task_id}")
        @app.get("/api/image-to-3d/task/{task_id}")
        async def i23d_task(task_id: str):
            task = api.tasks.get(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            return {"success": True, **task}

        @app.post("/image-to-3d/cancel")
        @app.post("/api/image-to-3d/cancel")
        async def i23d_cancel(task_id: str = Form("")):
            task = api.tasks.get((task_id or "").strip())
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")
            task["cancel"] = True
            api._log(task, "收到取消请求…")
            return {"success": True}

        @app.get("/image-to-3d/history")
        @app.get("/api/image-to-3d/history")
        async def i23d_history(limit: int = 24):
            items: List[dict] = []
            for d in list_task_dirs(
                api.output_root, "mesh3d", limit=max(1, min(100, int(limit or 24)))
            ):
                meta: dict = {}
                mp = d / "meta.json"
                if mp.is_file():
                    try:
                        meta = json.loads(mp.read_text(encoding="utf-8"))
                    except Exception:
                        meta = {}
                rel = rel_to_root(api.output_root, d) or d.name
                mesh_urls = meta.get("mesh_urls") or []
                mesh_url = meta.get("mesh_url") or ""
                if not mesh_url:
                    for eng in _ENGINES:
                        for name in ("mesh.glb", "mesh.obj"):
                            p = d / eng / name
                            if p.is_file():
                                mesh_url = api._public_url(p)
                                break
                thumb = ""
                for cand in d.glob("input.*"):
                    thumb = api._public_url(cand)
                    break
                items.append(
                    {
                        "folder": rel,
                        "created_at": meta.get("created_at") or "",
                        "engines": meta.get("engines") or [],
                        "prompt": meta.get("prompt") or "",
                        "mesh_url": mesh_url,
                        "mesh_urls": mesh_urls,
                        "thumb_url": thumb,
                        "image_url": thumb,
                    }
                )
            return {"success": True, "items": items}

        @app.post("/image-to-3d/delete")
        @app.post("/api/image-to-3d/delete")
        async def i23d_delete(folder: str = Form("")):
            rel = (folder or "").strip().replace("\\", "/")
            if not rel:
                raise HTTPException(status_code=400, detail="缺少 folder")
            try:
                deleted = delete_task_dir(api.output_root, rel, category="mesh3d")
            except FileNotFoundError as e:
                raise HTTPException(status_code=404, detail=str(e)) from e
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            return {"success": True, "folder": rel_to_root(api.output_root, deleted)}

        @app.post("/image-to-3d/reveal-output")
        @app.post("/api/image-to-3d/reveal-output")
        async def i23d_reveal(task_id: str = Form(""), folder: str = Form("")):
            key = (folder or "").strip() or (task_id or "").strip()
            if not key:
                raise HTTPException(status_code=400, detail="缺少 task_id 或 folder")
            if key in api.tasks:
                d = api._task_dir(api.tasks[key])
            else:
                d = resolve_task_dir(api.output_root, key)
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
                raise HTTPException(status_code=500, detail=str(e))
            return {"success": True, "path": path}

        @app.post("/image-to-3d/open")
        @app.post("/api/image-to-3d/open")
        async def i23d_open(folder: str = Form("")):
            d = resolve_task_dir(api.output_root, (folder or "").strip())
            if d is None or not d.is_dir():
                raise HTTPException(status_code=404, detail="历史不存在")
            meta: dict = {}
            mp = d / "meta.json"
            if mp.is_file():
                try:
                    meta = json.loads(mp.read_text(encoding="utf-8"))
                except Exception:
                    meta = {}
            image_url = ""
            for cand in d.glob("input.*"):
                image_url = api._public_url(cand)
                break
            return {
                "success": True,
                "folder": rel_to_root(api.output_root, d),
                **meta,
                "image_url": image_url,
            }
