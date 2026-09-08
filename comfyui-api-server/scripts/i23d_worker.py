#!/usr/bin/env python3
"""
Image-to-3D worker dispatcher.

Run with each engine's own venv Python when possible:
  D:\\sd\\triposr\\.venv\\Scripts\\python.exe i23d_worker.py --engine triposr ...
  D:\\sd\\hunyuan3d\\.venv\\Scripts\\python.exe i23d_worker.py --engine hunyuan3d ...
  D:\\sd\\trellis\\.venv\\Scripts\\python.exe i23d_worker.py --engine trellis ...

Outputs into --out-dir:
  mesh.glb (preferred) and/or mesh.obj
  preview.png (optional)
  result.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Windows 子进程默认控制台编码会把中文 print 弄成乱码；先钉 UTF-8
try:
    for _s in (sys.stdout, sys.stderr):
        _s.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
except Exception:
    pass


def _hf_snapshot_dir(repo_id: str) -> Path | None:
    """Resolve local HuggingFace hub snapshot dir if weights already cached."""
    name = "models--" + repo_id.replace("/", "--")
    hub = Path.home() / ".cache" / "huggingface" / "hub" / name / "snapshots"
    if not hub.is_dir():
        return None
    snaps = sorted([p for p in hub.iterdir() if p.is_dir()], key=lambda p: p.stat().st_mtime, reverse=True)
    for snap in snaps:
        if (snap / "config.yaml").is_file() and (
            (snap / "model.ckpt").is_file() or (snap / "model.safetensors").is_file()
        ):
            return snap
    return snaps[0] if snaps else None


def _ensure_engine_path(engine: str) -> Path:
    """Put cloned repo root on sys.path (TripoSR/TRELLIS are not always pip-installed)."""
    env_key = {
        "triposr": "TRIPOSR_ROOT",
        "hunyuan3d": "HUNYUAN3D_ROOT",
        "trellis": "TRELLIS_ROOT",
    }[engine]
    defaults = {
        "triposr": r"D:\sd\triposr",
        "hunyuan3d": r"D:\sd\hunyuan3d",
        "trellis": r"D:\sd\trellis",
    }
    root = Path(os.environ.get(env_key, defaults[engine])).resolve()
    s = str(root)
    if s not in sys.path:
        sys.path.insert(0, s)
    return root


def _write_meta(out_dir: Path, **kwargs) -> None:
    meta = {k: v for k, v in kwargs.items() if v is not None}
    (out_dir / "result.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def _run_triposr(image: Path, out_dir: Path, seed: int) -> Path:
    # Prefer installed package API; fallback to cloned repo run.py
    _ensure_engine_path("triposr")
    try:
        import numpy as np
        import rembg
        import torch
        from PIL import Image
        from tsr.system import TSR
        from tsr.utils import remove_background, resize_foreground

        device = "cuda" if torch.cuda.is_available() else "cpu"
        local = os.environ.get("TRIPOSR_MODEL_DIR", "").strip()
        model_src = local if local and Path(local).is_dir() else None
        if not model_src:
            snap = _hf_snapshot_dir("stabilityai/TripoSR")
            if snap is not None:
                model_src = str(snap)
        if not model_src:
            model_src = "stabilityai/TripoSR"
        print(f"triposr load from {model_src}", flush=True)
        # 本地已有权重时离线，避免 HF 镜像缺 commit header 直接炸
        if Path(model_src).is_dir():
            os.environ["HF_HUB_OFFLINE"] = "1"
        model = TSR.from_pretrained(
            model_src,
            config_name="config.yaml",
            weight_name="model.ckpt",
        )
        model.to(device)
        model.renderer.set_chunk_size(8192)

        img = Image.open(image).convert("RGBA")
        img = remove_background(img, rembg.new_session())
        img = resize_foreground(img, 0.85)
        img = np.array(img).astype(np.float32) / 255.0
        img = img[:, :, :3] * img[:, :, 3:4] + (1 - img[:, :, 3:4]) * 0.5
        img = Image.fromarray((img * 255.0).astype(np.uint8))

        with torch.no_grad():
            scene_codes = model([img], device=device)
        # signature: extract_mesh(scene_codes, has_vertex_color, resolution=…)
        meshes = model.extract_mesh(scene_codes, True, resolution=256)
        mesh_path = out_dir / "mesh.glb"
        try:
            meshes[0].export(str(mesh_path))
        except Exception:
            mesh_path = out_dir / "mesh.obj"
            meshes[0].export(str(mesh_path))
        return mesh_path
    except Exception as e1:
        # Repo layout: D:\sd\triposr\run.py
        print(f"TripoSR API path failed: {e1!r}", flush=True)
        root = Path(os.environ.get("TRIPOSR_ROOT", r"D:\sd\triposr"))
        run_py = root / "run.py"
        if not run_py.is_file():
            raise RuntimeError(f"TripoSR 未就绪：{e1}") from e1
        import subprocess

        cmd = [
            sys.executable,
            str(run_py),
            str(image),
            "--output-dir",
            str(out_dir),
            "--model-save-format",
            "obj",
        ]
        if seed >= 0:
            # TripoSR run.py may ignore seed; keep for forward compat
            pass
        print("fallback run.py:", " ".join(cmd), flush=True)
        env = os.environ.copy()
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        # run.py 仍会走 hub；有本地 snapshot 时离线
        snap = _hf_snapshot_dir("stabilityai/TripoSR")
        if snap is not None:
            env["HF_HUB_OFFLINE"] = "1"
        proc = subprocess.run(
            cmd,
            cwd=str(root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
        )
        sys.stdout.write(proc.stdout or "")
        sys.stderr.write(proc.stderr or "")
        if proc.returncode != 0:
            raise RuntimeError(f"TripoSR run.py failed ({proc.returncode})")
        # Official run.py writes <stem>.glb under output-dir
        cands = list(out_dir.glob("*.glb")) + list(out_dir.glob("**/*.glb"))
        if not cands:
            cands = list(out_dir.glob("*.obj")) + list(out_dir.glob("**/*.obj"))
        if not cands:
            raise RuntimeError("TripoSR 未写出 mesh")
        dest = out_dir / ("mesh.glb" if cands[0].suffix.lower() == ".glb" else "mesh.obj")
        if cands[0].resolve() != dest.resolve():
            dest.write_bytes(cands[0].read_bytes())
        return dest


def _run_hunyuan(image: Path, out_dir: Path, seed: int) -> Path:
    """Hunyuan3D-2 shape (+ optional texture if available)."""
    try:
        import torch
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
        from hy3dgen.rembg import BackgroundRemover
    except Exception as e:
        raise RuntimeError(
            "Hunyuan3D 未安装。请运行 scripts/setup_image_to_3d.py --engine hunyuan3d"
        ) from e

    device = "cuda" if torch.cuda.is_available() else "cpu"
    # mini 默认 subfolder 是 hunyuan3d-dit-v2-0（不对）；用官方 2.0 或显式 mini subfolder
    model_id = os.environ.get("HUNYUAN3D_MODEL", "tencent/Hunyuan3D-2")
    subfolder = os.environ.get("HUNYUAN3D_SUBFOLDER", "").strip()
    load_kw = {}
    if subfolder:
        load_kw["subfolder"] = subfolder
    elif "2mini" in model_id.replace("_", "-").lower():
        load_kw["subfolder"] = "hunyuan3d-dit-v2-mini"
    print(f"hunyuan load {model_id} {load_kw or '(default subfolder)'}", flush=True)
    print(
        "hunyuan: 优先读本地 ~/.cache/hy3dgen；若无完整权重才访问 HuggingFace",
        flush=True,
    )
    # 已有本地权重则离线，避免镜像/网络卡住
    base = Path(os.environ.get("HY3DGEN_MODELS", Path.home() / ".cache" / "hy3dgen")).expanduser()
    sub = load_kw.get("subfolder") or "hunyuan3d-dit-v2-0"
    local_dir = base / model_id / sub
    if local_dir.is_dir() and (
        any(local_dir.glob("model*.safetensors")) or any(local_dir.glob("model*.ckpt"))
    ):
        os.environ["HF_HUB_OFFLINE"] = "1"
        print(f"hunyuan: 使用本地权重 {local_dir}", flush=True)
    pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(model_id, **load_kw)
    print("hunyuan: 权重已加载，开始推理…", flush=True)
    pipe.to(device)
    rembg = BackgroundRemover()
    from PIL import Image

    img = Image.open(image).convert("RGBA")
    img = rembg(img)
    generator = None
    if seed >= 0:
        generator = torch.Generator(device=device).manual_seed(seed)
    mesh = pipe(image=img, generator=generator)[0]
    mesh_path = out_dir / "mesh.glb"
    mesh.export(str(mesh_path))
    return mesh_path


def _run_trellis(image: Path, out_dir: Path, seed: int) -> Path:
    _ensure_engine_path("trellis")
    try:
        import torch
        from trellis.pipelines import TrellisImageTo3DPipeline
    except Exception as e:
        raise RuntimeError(
            f"TRELLIS 未安装/导入失败：{e}。请运行 scripts/setup_image_to_3d.py --engine trellis"
        ) from e

    pipe = TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large")
    pipe.cuda()
    from PIL import Image

    img = Image.open(image).convert("RGBA")
    outputs = pipe.run(img, seed=seed if seed >= 0 else 1)
    mesh_path = out_dir / "mesh.glb"
    # 优先官方 to_glb（需 nvdiffrast）；否则直接导出无贴图 mesh，避免整条链路挂掉
    try:
        from trellis.utils import postprocessing_utils

        glb = postprocessing_utils.to_glb(
            outputs["gaussian"][0],
            outputs["mesh"][0],
            simplify=0.95,
            texture_size=1024,
        )
        glb.export(str(mesh_path))
    except Exception as e:
        print(f"trellis to_glb 回退无贴图导出：{e}", flush=True)
        import numpy as np
        import trimesh

        m = outputs["mesh"][0]
        verts = m.vertices.detach().cpu().numpy() if hasattr(m.vertices, "detach") else np.asarray(m.vertices)
        faces = m.faces.detach().cpu().numpy() if hasattr(m.faces, "detach") else np.asarray(m.faces)
        # TRELLIS 默认 z-up → y-up
        verts = verts @ np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=np.float32)
        tm = trimesh.Trimesh(vertices=verts, faces=faces)
        tm.export(str(mesh_path))
    return mesh_path


def main() -> int:
    for k in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        os.environ.pop(k, None)

    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", required=True, choices=("triposr", "hunyuan3d", "trellis"))
    ap.add_argument("--image", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--seed", type=int, default=-1)
    args = ap.parse_args()

    image = Path(args.image)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if not image.is_file():
        print(f"ERROR: missing image {image}", file=sys.stderr)
        return 2

    print(f"i23d engine={args.engine} image={image} out={out_dir}", flush=True)
    try:
        if args.engine == "triposr":
            mesh = _run_triposr(image, out_dir, args.seed)
        elif args.engine == "hunyuan3d":
            mesh = _run_hunyuan(image, out_dir, args.seed)
        else:
            mesh = _run_trellis(image, out_dir, args.seed)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        _write_meta(out_dir, engine=args.engine, ok=False, error=str(e))
        return 1

    _write_meta(
        out_dir,
        engine=args.engine,
        ok=True,
        mesh=mesh.name,
        bytes=mesh.stat().st_size if mesh.is_file() else 0,
    )
    print(f"OK {mesh} bytes={mesh.stat().st_size if mesh.is_file() else 0}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
