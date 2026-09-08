#!/usr/bin/env python3
"""Install Stable Audio Open 1.0 under D:\\sd\\stable-audio-open (isolated venv)."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.environ.get("STABLE_AUDIO_ROOT", r"D:\sd\stable-audio-open"))
MODEL_ID = os.environ.get("STABLE_AUDIO_MODEL", "stabilityai/stable-audio-open-1.0")
MODEL_DIR = ROOT / "model"
VENV = ROOT / ".venv"
PYTORCH_INDEX = os.environ.get("PYTORCH_INDEX", "https://download.pytorch.org/whl/cu128")
PIP_INDEX = os.environ.get("PIP_INDEX", "https://mirrors.aliyun.com/pypi/simple")


def run(cmd: list[str], env: dict | None = None) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, env=env)


def venv_python() -> Path:
    return VENV / "Scripts" / "python.exe"


def ensure_venv() -> Path:
    ROOT.mkdir(parents=True, exist_ok=True)
    py = venv_python()
    if not py.is_file():
        run([sys.executable, "-m", "venv", str(VENV)])
    run([str(py), "-m", "pip", "install", "-U", "pip", "wheel", "setuptools<81", "-i", PIP_INDEX])
    return py


def hf_token() -> str:
    tok = (os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or "").strip()
    if tok:
        return tok
    for p in (
        Path.home() / ".cache" / "huggingface" / "token",
        Path.home() / ".huggingface" / "token",
    ):
        if p.is_file():
            t = p.read_text(encoding="utf-8").strip()
            if t:
                return t
    return ""


def main() -> int:
    py = ensure_venv()
    # Torch CUDA first, then audio stack
    run(
        [
            str(py),
            "-m",
            "pip",
            "install",
            "torch",
            "torchaudio",
            "--index-url",
            PYTORCH_INDEX,
        ]
    )
    run(
        [
            str(py),
            "-m",
            "pip",
            "install",
            "diffusers>=0.31.0",
            "transformers>=4.40.0",
            "accelerate",
            "soundfile",
            "numpy",
            "huggingface_hub",
            "sentencepiece",
            "protobuf",
            "-i",
            PIP_INDEX,
        ]
    )

    token = hf_token()
    if not token:
        print(
            "ERROR: 需要 Hugging Face token（模型 gated）。"
            "请先在 https://huggingface.co/stabilityai/stable-audio-open-1.0 同意协议，"
            "并 huggingface-cli login 或设置 HF_TOKEN。",
            file=sys.stderr,
        )
        return 2

    env = os.environ.copy()
    env["HF_TOKEN"] = token
    env["HUGGING_FACE_HUB_TOKEN"] = token

    marker = MODEL_DIR / "model_index.json"
    if not marker.is_file():
        print(f"[info] downloading {MODEL_ID} → {MODEL_DIR}", flush=True)
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        code = (
            "from huggingface_hub import snapshot_download; "
            f"snapshot_download({MODEL_ID!r}, local_dir={str(MODEL_DIR)!r}, "
            "local_dir_use_symlinks=False, resume_download=True)"
        )
        run([str(py), "-c", code], env=env)
    else:
        print(f"[ok] model present: {MODEL_DIR}")

    ready = ROOT / ".tbc_ready"
    ready.write_text(f"{MODEL_ID}\n", encoding="utf-8")
    print(f"[done] Stable Audio Open ready at {ROOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
