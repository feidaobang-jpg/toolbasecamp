#!/usr/bin/env python3
"""
Install Image-to-3D engine roots under D:\\sd\\{triposr,hunyuan3d,trellis}.

Usage:
  python setup_image_to_3d.py --engine triposr
  python setup_image_to_3d.py --engine hunyuan3d
  python setup_image_to_3d.py --engine trellis
  python setup_image_to_3d.py --engine all
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import venv
from pathlib import Path

PIP_INDEX = os.environ.get("PIP_INDEX_URL", "https://pypi.tuna.tsinghua.edu.cn/simple")

ROOTS = {
    "triposr": Path(os.environ.get("TRIPOSR_ROOT", r"D:\sd\triposr")),
    "hunyuan3d": Path(os.environ.get("HUNYUAN3D_ROOT", r"D:\sd\hunyuan3d")),
    "trellis": Path(os.environ.get("TRELLIS_ROOT", r"D:\sd\trellis")),
}

REPOS = {
    "triposr": "https://github.com/VAST-AI-Research/TripoSR.git",
    "hunyuan3d": "https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git",
    "trellis": "https://github.com/microsoft/TRELLIS.git",
}


def _run(cmd: list[str], *, cwd: Path | None = None) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.check_call(cmd, cwd=str(cwd) if cwd else None)


def _ensure_venv(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    vdir = root / ".venv"
    py = vdir / "Scripts" / "python.exe"
    if not py.is_file():
        print(f"creating venv {vdir}", flush=True)
        venv.create(str(vdir), with_pip=True)
    return py


def _clone_if_needed(engine: str, root: Path) -> None:
    marker = root / ".git"
    if marker.is_dir() or (root / "run.py").is_file() or (root / "README.md").is_file():
        return
    root.mkdir(parents=True, exist_ok=True)
    # clone into temp then move? simpler: clone into root if empty
    if any(root.iterdir()):
        # has .venv only
        if list(root.iterdir()) == [root / ".venv"] or all(p.name.startswith(".") for p in root.iterdir()):
            pass
        else:
            return
    url = REPOS[engine]
    tmp = root.parent / f"_clone_{engine}"
    if tmp.exists():
        import shutil

        shutil.rmtree(tmp, ignore_errors=True)
    _run(["git", "clone", "--depth", "1", url, str(tmp)])
    # copy contents into root keeping .venv
    import shutil

    for p in tmp.iterdir():
        dest = root / p.name
        if dest.exists():
            continue
        if p.is_dir():
            shutil.copytree(p, dest)
        else:
            shutil.copy2(p, dest)
    shutil.rmtree(tmp, ignore_errors=True)


def setup_triposr(root: Path) -> None:
    _clone_if_needed("triposr", root)
    py = _ensure_venv(root)
    _run([str(py), "-m", "pip", "install", "-U", "pip", "setuptools", "wheel", "-i", PIP_INDEX])
    # torch cuda wheel — best effort
    _run(
        [
            str(py),
            "-m",
            "pip",
            "install",
            "torch",
            "torchvision",
            "--index-url",
            "https://download.pytorch.org/whl/cu124",
        ]
    )
    req = root / "requirements.txt"
    if req.is_file():
        # torchmcubes via git often fails on Windows; install rest then best-effort mcubes
        try:
            _run([str(py), "-m", "pip", "install", "-r", str(req), "-i", PIP_INDEX])
        except subprocess.CalledProcessError:
            print("[warn] requirements.txt 部分失败，继续装基础包", flush=True)
            for pkg in (
                "omegaconf==2.3.0",
                "Pillow",
                "einops==0.7.0",
                "transformers==4.35.0",
                "trimesh==4.0.5",
                "rembg",
                "huggingface-hub",
                "imageio",
                "xatlas==0.0.9",
            ):
                try:
                    _run([str(py), "-m", "pip", "install", pkg, "-i", PIP_INDEX])
                except subprocess.CalledProcessError:
                    print(f"[warn] skip {pkg}", flush=True)
    # numpy2 + old trimesh 会因 ndarray.ptp 导出 GLB 失败；钉新版 trimesh
    _run(
        [
            str(py),
            "-m",
            "pip",
            "install",
            "trimesh>=4.5",
            "rembg",
            "onnxruntime-gpu",
            "-i",
            PIP_INDEX,
        ]
    )
    # Verify import with repo on PYTHONPATH
    env = os.environ.copy()
    env["PYTHONPATH"] = str(root) + os.pathsep + env.get("PYTHONPATH", "")
    subprocess.check_call(
        [str(py), "-c", "import sys; sys.path.insert(0, r'%s'); from tsr.system import TSR" % str(root)],
        env=env,
    )
    (root / ".tbc_ready").write_text("triposr\n", encoding="utf-8")
    print("[done] triposr", flush=True)


def setup_hunyuan(root: Path) -> None:
    _clone_if_needed("hunyuan3d", root)
    py = _ensure_venv(root)
    _run([str(py), "-m", "pip", "install", "-U", "pip", "setuptools", "wheel", "-i", PIP_INDEX])
    _run(
        [
            str(py),
            "-m",
            "pip",
            "install",
            "torch",
            "torchvision",
            "--index-url",
            "https://download.pytorch.org/whl/cu124",
        ]
    )
    # Editable install if pyproject/setup exists
    if (root / "setup.py").is_file() or (root / "pyproject.toml").is_file():
        _run([str(py), "-m", "pip", "install", "-e", str(root), "-i", PIP_INDEX])
    req = root / "requirements.txt"
    if req.is_file():
        _run([str(py), "-m", "pip", "install", "-r", str(req), "-i", PIP_INDEX])
    (root / ".tbc_ready").write_text("hunyuan3d\n", encoding="utf-8")
    print("[done] hunyuan3d — 首次推理会从 HuggingFace 拉权重", flush=True)


def setup_trellis(root: Path) -> None:
    _clone_if_needed("trellis", root)
    py = _ensure_venv(root)
    _run([str(py), "-m", "pip", "install", "-U", "pip", "setuptools", "wheel", "-i", PIP_INDEX])
    _run(
        [
            str(py),
            "-m",
            "pip",
            "install",
            "torch",
            "torchvision",
            "--index-url",
            "https://download.pytorch.org/whl/cu124",
        ]
    )
    req = root / "requirements.txt"
    if req.is_file():
        try:
            _run([str(py), "-m", "pip", "install", "-r", str(req), "-i", PIP_INDEX])
        except subprocess.CalledProcessError:
            print("[warn] trellis requirements 部分失败", flush=True)
    # Replace PyPI kaolin placeholder with NVIDIA wheel (torch 2.6 + cu124)
    try:
        _run([str(py), "-m", "pip", "uninstall", "-y", "kaolin"])
    except subprocess.CalledProcessError:
        pass
    _run(
        [
            str(py),
            "-m",
            "pip",
            "install",
            "kaolin==0.18.0",
            "-f",
            "https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.6.0_cu124.html",
        ]
    )
    env = os.environ.copy()
    env["PYTHONPATH"] = str(root) + os.pathsep + env.get("PYTHONPATH", "")
    try:
        subprocess.check_call(
            [
                str(py),
                "-c",
                "import sys; sys.path.insert(0, r'%s'); from trellis.pipelines import TrellisImageTo3DPipeline"
                % str(root),
            ],
            env=env,
        )
    except subprocess.CalledProcessError as e:
        marker = root / ".tbc_ready"
        if marker.is_file():
            marker.unlink()
        print(
            "[fail] trellis import 仍失败（可能缺 spconv/flash_attn 等）。"
            "未写入 .tbc_ready。请按 microsoft/TRELLIS README 补依赖后重跑本脚本。",
            flush=True,
        )
        raise SystemExit(1) from e
    (root / ".tbc_ready").write_text("trellis\n", encoding="utf-8")
    print("[done] trellis", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default="triposr", choices=("triposr", "hunyuan3d", "trellis", "all"))
    args = ap.parse_args()
    engines = list(ROOTS.keys()) if args.engine == "all" else [args.engine]
    for eng in engines:
        root = ROOTS[eng]
        print(f"=== setup {eng} → {root} ===", flush=True)
        if eng == "triposr":
            setup_triposr(root)
        elif eng == "hunyuan3d":
            setup_hunyuan(root)
        else:
            setup_trellis(root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
