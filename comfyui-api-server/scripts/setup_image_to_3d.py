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
        _run([str(py), "-m", "pip", "install", "-r", str(req), "-i", PIP_INDEX])
    _run([str(py), "-m", "pip", "install", "trimesh", "rembg", "onnxruntime-gpu", "-i", PIP_INDEX])
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
        _run([str(py), "-m", "pip", "install", "-r", str(req), "-i", PIP_INDEX])
    # TRELLIS often needs extra setup; mark ready if importable later
    (root / ".tbc_ready").write_text("trellis\n", encoding="utf-8")
    print("[done] trellis — 请按官方 README 补全额外依赖后重试", flush=True)


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
