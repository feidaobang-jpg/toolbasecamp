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


# 面数档位：游戏低模默认；生成后再做一次目标面数简化（若引擎已较低则跳过）
_MESH_DETAIL: dict[str, dict] = {
    "game": {
        "label": "游戏低模",
        "triposr_resolution": 128,
        "trellis_simplify": 0.97,
        "target_faces": 6000,
    },
    "mid": {
        "label": "中等",
        "triposr_resolution": 192,
        "trellis_simplify": 0.95,
        "target_faces": 30000,
    },
    "high": {
        "label": "高模",
        "triposr_resolution": 256,
        "trellis_simplify": 0.90,
        "target_faces": 0,  # 0 = 不额外减面
    },
}


def _normalize_mesh_detail(raw: str | None) -> str:
    key = (raw or "game").strip().lower()
    if key in ("low", "game-low", "lowpoly", "game_low"):
        return "game"
    if key in ("medium", "med", "normal"):
        return "mid"
    if key in ("max", "full", "quality"):
        return "high"
    return key if key in _MESH_DETAIL else "game"


def _detail_cfg(detail: str) -> dict:
    return _MESH_DETAIL[_normalize_mesh_detail(detail)]


def _simplify_mesh_file(path: Path, target_faces: int) -> Path:
    """将 mesh 减到约 target_faces（游戏低模）。失败则保留原文件。"""
    if target_faces <= 0 or not path.is_file():
        return path
    try:
        import trimesh
    except Exception as e:
        print(f"mesh simplify skip（无 trimesh）: {e}", flush=True)
        return path

    try:
        loaded = trimesh.load(str(path), force="mesh")
        if isinstance(loaded, trimesh.Scene):
            geoms = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
            if not geoms:
                return path
            mesh = trimesh.util.concatenate(geoms) if len(geoms) > 1 else geoms[0]
        else:
            mesh = loaded
        if not isinstance(mesh, trimesh.Trimesh) or mesh.faces is None:
            return path
        before = int(len(mesh.faces))
        if before <= target_faces:
            print(f"mesh faces={before} ≤ target={target_faces}，无需减面", flush=True)
            return path
        print(f"mesh simplify {before} → ~{target_faces} faces…", flush=True)
        simplified = None
        try:
            simplified = mesh.simplify_quadric_decimation(face_count=int(target_faces))
        except TypeError:
            # 旧版 trimesh：percent = 保留比例
            try:
                ratio = max(0.01, min(0.99, float(target_faces) / float(before)))
                simplified = mesh.simplify_quadric_decimation(percent=ratio)
            except Exception:
                simplified = None
        except Exception as e:
            print(f"mesh simplify_quadric 失败，尝试 open3d/保留原模: {e}", flush=True)
            simplified = None
        if simplified is None or not isinstance(simplified, trimesh.Trimesh):
            return path
        after = int(len(simplified.faces))
        # 保留同后缀写出
        simplified.export(str(path))
        print(f"mesh simplify done faces {before} → {after} bytes={path.stat().st_size}", flush=True)
        return path
    except Exception as e:
        print(f"mesh simplify error（保留原模）: {e}", flush=True)
        return path


def _run_triposr(image: Path, out_dir: Path, seed: int, detail: str = "game") -> Path:
    cfg = _detail_cfg(detail)
    res = int(cfg["triposr_resolution"])
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
        print(f"triposr load from {model_src} detail={_normalize_mesh_detail(detail)} res={res}", flush=True)
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
        meshes = model.extract_mesh(scene_codes, True, resolution=res)
        mesh_path = out_dir / "mesh.glb"
        try:
            meshes[0].export(str(mesh_path))
        except Exception:
            mesh_path = out_dir / "mesh.obj"
            meshes[0].export(str(mesh_path))
        return _simplify_mesh_file(mesh_path, int(cfg["target_faces"]))
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
        return _simplify_mesh_file(dest, int(cfg["target_faces"]))


def _run_hunyuan(image: Path, out_dir: Path, seed: int, detail: str = "game") -> Path:
    """Hunyuan3D-2 shape (+ optional texture if available)."""
    cfg = _detail_cfg(detail)
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
    print(
        f"hunyuan load {model_id} {load_kw or '(default subfolder)'} "
        f"detail={_normalize_mesh_detail(detail)}",
        flush=True,
    )
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
    return _simplify_mesh_file(mesh_path, int(cfg["target_faces"]))


def _pick_trellis_attn_backend() -> str:
    """TRELLIS 默认 flash_attn；Windows 常未装。缺则用 xformers，再退 sdpa（仅 dense）。"""
    import importlib.util as iu

    if iu.find_spec("flash_attn") is not None:
        return "flash_attn"
    if iu.find_spec("xformers") is not None:
        return "xformers"
    return "sdpa"


# torch.hub 默认落盘路径；TRELLIS image_cond 用 dinov2_vitl14_reg
_DINOV2_CKPT_NAME = "dinov2_vitl14_reg4_pretrain.pth"
_DINOV2_URL = (
    "https://dl.fbaipublicfiles.com/dinov2/dinov2_vitl14/dinov2_vitl14_reg4_pretrain.pth"
)
# 完整权重约 1.13GB；小于此视为残缺/中断
_DINOV2_MIN_BYTES = 1_100_000_000


def _dinov2_ckpt_path() -> Path:
    return Path.home() / ".cache" / "torch" / "hub" / "checkpoints" / _DINOV2_CKPT_NAME


def _download_file_resumable(url: str, dest: Path, *, min_bytes: int, label: str) -> None:
    """断点续传下载；国内直连 Facebook CDN 易中断，多试几次。"""
    import urllib.request

    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".tbc.partial")
    # 清掉 torch.hub 留下的哈希 partial，避免占盘干扰
    for junk in dest.parent.glob(dest.name + ".*.partial"):
        try:
            junk.unlink()
        except OSError:
            pass

    attempts = 5
    for i in range(1, attempts + 1):
        have = part.stat().st_size if part.is_file() else 0
        headers = {"User-Agent": "toolbasecamp-i23d/1.0"}
        if have > 0:
            headers["Range"] = f"bytes={have}-"
        print(f"{label}: 下载 {dest.name}（第 {i}/{attempts} 次，已有 {have} bytes）…", flush=True)
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=120) as resp, open(part, "ab" if have else "wb") as out:
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
            size = part.stat().st_size
            if size < min_bytes:
                raise RuntimeError(f"文件过小 {size} < {min_bytes}，可能未下完")
            part.replace(dest)
            print(f"{label}: 已就绪 {dest} ({size} bytes)", flush=True)
            return
        except Exception as e:
            print(f"{label}: 下载中断 {e}", flush=True)
            if i >= attempts:
                raise RuntimeError(
                    f"{label} 权重下载失败（常因 Facebook CDN 不稳定）。"
                    f"请稍后重试，或手动把文件放到 {dest} 。URL: {url}。原因：{e}"
                ) from e


def _ensure_dinov2_checkpoint() -> Path:
    """TRELLIS 会经 torch.hub 拉 DINOv2；国内直连易报 chunk/separator。先保证本地完整。"""
    dest = _dinov2_ckpt_path()
    if dest.is_file() and dest.stat().st_size >= _DINOV2_MIN_BYTES:
        print(f"trellis: 使用本地 DINOv2 {dest} ({dest.stat().st_size} bytes)", flush=True)
        return dest
    if dest.is_file():
        print(f"trellis: 本地 DINOv2 不完整 ({dest.stat().st_size} bytes)，重新下载…", flush=True)
        try:
            dest.unlink()
        except OSError:
            pass
    _download_file_resumable(_DINOV2_URL, dest, min_bytes=_DINOV2_MIN_BYTES, label="trellis DINOv2")
    return dest


def _run_trellis(image: Path, out_dir: Path, seed: int, detail: str = "game") -> Path:
    cfg = _detail_cfg(detail)
    _ensure_engine_path("trellis")
    # 必须在 import trellis 之前设好：缺 flash_attn 时 Pipeline 裸 except 会把
    # ckpts/xxx 误当成独立 Hub repo，报「locate file on the Hub」。
    attn = _pick_trellis_attn_backend()
    os.environ["ATTN_BACKEND"] = attn
    # sparse 只认 xformers / flash_attn
    os.environ["SPARSE_ATTN_BACKEND"] = "xformers" if attn == "sdpa" else attn
    if attn != "flash_attn":
        print(f"trellis: 未检测到 flash_attn，改用 attention={attn}", flush=True)
    print(f"trellis detail={_normalize_mesh_detail(detail)}", flush=True)

    try:
        import torch
        from trellis.pipelines import TrellisImageTo3DPipeline
    except Exception as e:
        raise RuntimeError(
            f"TRELLIS 未安装/导入失败：{e}。请运行 scripts/setup_image_to_3d.py --engine trellis"
        ) from e

    try:
        _ensure_dinov2_checkpoint()
    except Exception as e:
        msg = str(e)
        if "Separator is not found" in msg or "chunk exceed" in msg.lower():
            raise RuntimeError(
                "TRELLIS 依赖的 DINOv2 权重下载中断（Facebook CDN）。"
                f"请再跑一次，或手动下载到 {_dinov2_ckpt_path()} 。原因：{e}"
            ) from e
        raise

    need = [
        "ckpts/ss_dec_conv3d_16l8_fp16",
        "ckpts/ss_flow_img_dit_L_16l8_fp16",
        "ckpts/slat_dec_gs_swin8_B_64l8gs32_fp16",
        "ckpts/slat_dec_rf_swin8_B_64l8r16_fp16",
        "ckpts/slat_dec_mesh_swin8_B_64l8m256c_fp16",
        "ckpts/slat_flow_img_dit_L_64l8p2_fp16",
    ]

    def _snap_missing(snap: Path) -> list[str]:
        miss: list[str] = []
        for n in need:
            if not (snap / f"{n}.safetensors").is_file() or not (snap / f"{n}.json").is_file():
                miss.append(n)
        return miss

    local: Path | None = None
    hub = Path.home() / ".cache" / "huggingface" / "hub" / "models--microsoft--TRELLIS-image-large" / "snapshots"
    if hub.is_dir():
        snaps = sorted([p for p in hub.iterdir() if p.is_dir()], key=lambda p: p.stat().st_mtime, reverse=True)
        for snap in snaps:
            if not (snap / "pipeline.json").is_file():
                continue
            miss = _snap_missing(snap)
            if not miss:
                local = snap
                break
            print(f"trellis: 本地 snapshot 缺权重 {miss}，继续找/下载…", flush=True)

    def _friendly_trellis_err(e: BaseException, prefix: str) -> RuntimeError:
        msg = str(e)
        if "Separator is not found" in msg or "chunk exceed" in msg.lower():
            return RuntimeError(
                f"{prefix}：DINOv2/依赖下载中断（Facebook CDN）。"
                f"本地应有 {_dinov2_ckpt_path()} 。请重试。原因：{e}"
            )
        return RuntimeError(f"{prefix}：{e}")

    if local is not None:
        print(f"trellis load from local {local}", flush=True)
        os.environ["HF_HUB_OFFLINE"] = "1"
        # 从本地目录加载，避免把 ckpts/xxx 误解析成独立 Hub repo
        try:
            pipe = TrellisImageTo3DPipeline.from_pretrained(str(local))
        except Exception as e:
            raise _friendly_trellis_err(
                e,
                f"TRELLIS 本地权重加载失败（attention={attn}；缺 xformers/flash_attn 时也会异常）",
            ) from e
    else:
        print(
            "trellis: 本地 microsoft/TRELLIS-image-large 不完整，开始从 HuggingFace 拉取（数 GB）…",
            flush=True,
        )
        os.environ.pop("HF_HUB_OFFLINE", None)
        try:
            pipe = TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large")
        except Exception as e:
            raise RuntimeError(
                "TRELLIS 权重未下全且无法从 HuggingFace 补齐。"
                "请联网后运行：python scripts/setup_image_to_3d.py --engine trellis"
                f"（或 huggingface-cli download microsoft/TRELLIS-image-large）。原因：{e}"
            ) from e
    pipe.cuda()
    from PIL import Image

    img = Image.open(image).convert("RGBA")
    try:
        outputs = pipe.run(img, seed=seed if seed >= 0 else 1)
    except Exception as e:
        raise _friendly_trellis_err(e, "TRELLIS 推理失败") from e
    mesh_path = out_dir / "mesh.glb"
    # 优先官方 to_glb（需 nvdiffrast）；否则直接导出无贴图 mesh，避免整条链路挂掉
    try:
        from trellis.utils import postprocessing_utils

        glb = postprocessing_utils.to_glb(
            outputs["gaussian"][0],
            outputs["mesh"][0],
            simplify=float(cfg["trellis_simplify"]),
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
    return _simplify_mesh_file(mesh_path, int(cfg["target_faces"]))


def main() -> int:
    for k in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        os.environ.pop(k, None)

    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", required=True, choices=("triposr", "hunyuan3d", "trellis"))
    ap.add_argument("--image", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--seed", type=int, default=-1)
    ap.add_argument(
        "--mesh-detail",
        default="game",
        help="game=低模(~6k面) | mid(~30k) | high(不额外减面)",
    )
    args = ap.parse_args()

    image = Path(args.image)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if not image.is_file():
        print(f"ERROR: missing image {image}", file=sys.stderr)
        return 2

    detail = _normalize_mesh_detail(args.mesh_detail)
    print(f"i23d engine={args.engine} detail={detail} image={image} out={out_dir}", flush=True)
    try:
        if args.engine == "triposr":
            mesh = _run_triposr(image, out_dir, args.seed, detail)
        elif args.engine == "hunyuan3d":
            mesh = _run_hunyuan(image, out_dir, args.seed, detail)
        else:
            mesh = _run_trellis(image, out_dir, args.seed, detail)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        _write_meta(out_dir, engine=args.engine, ok=False, error=str(e), mesh_detail=detail)
        return 1

    _write_meta(
        out_dir,
        engine=args.engine,
        ok=True,
        mesh=mesh.name,
        bytes=mesh.stat().st_size if mesh.is_file() else 0,
        mesh_detail=detail,
        target_faces=_detail_cfg(detail)["target_faces"],
    )
    print(f"OK {mesh} bytes={mesh.stat().st_size if mesh.is_file() else 0}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
