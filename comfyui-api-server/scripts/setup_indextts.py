#!/usr/bin/env python3
"""Install IndexTTS-2.5 under D:\\sd\\index-tts (Windows-friendly, no DeepSpeed)."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.environ.get("INDEXTTS_ROOT", r"D:\sd\index-tts"))
REPO = "https://github.com/index-tts/index-tts.git"
MIRROR = os.environ.get("UV_INDEX", "https://mirrors.aliyun.com/pypi/simple")


def run(cmd: list[str], cwd: Path | None = None, env: dict | None = None) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, env=env, check=True)


def main() -> int:
    ROOT.parent.mkdir(parents=True, exist_ok=True)
    if not (ROOT / ".git").exists():
        if ROOT.exists() and any(ROOT.iterdir()):
            print(f"ERROR: {ROOT} exists but is not a git repo", file=sys.stderr)
            return 1
        run(["git", "clone", "--depth", "1", REPO, str(ROOT)])
    else:
        print(f"[ok] repo exists: {ROOT}")

    uv = shutil.which("uv")
    if not uv:
        run([sys.executable, "-m", "pip", "install", "-U", "uv"])
        uv = shutil.which("uv") or str(Path(sys.executable).parent / "Scripts" / "uv.exe")

    # Windows: skip DeepSpeed; pull webui extra for usable deps.
    env = os.environ.copy()
    env.setdefault("UV_PYTHON", "3.11")
    run(
        [
            uv,
            "sync",
            "--extra",
            "webui",
            "--default-index",
            MIRROR,
        ],
        cwd=ROOT,
        env=env,
    )

    ckpt = ROOT / "checkpoints"
    if not (ckpt / "config.yaml").exists():
        print("[info] downloading IndexTTS-2.5 weights via modelscope …", flush=True)
        run(
            [uv, "tool", "install", "modelscope", "--default-index", MIRROR],
            cwd=ROOT,
        )
        # modelscope CLI may live under uv tools
        env = os.environ.copy()
        # Prefer modelscope python module if CLI path is awkward
        run(
            [
                uv,
                "run",
                "python",
                "-c",
                (
                    "from modelscope import snapshot_download; "
                    "snapshot_download('IndexTeam/IndexTTS-2.5', local_dir='checkpoints')"
                ),
            ],
            cwd=ROOT,
            env=env,
        )
    else:
        print(f"[ok] checkpoints present: {ckpt}")

    # Ensure example voices for smoke tests
    run(
        [
            uv,
            "run",
            "python",
            "-c",
            "from indextts.utils.examples_downloader import ensure_examples_available; ensure_examples_available()",
        ],
        cwd=ROOT,
    )

    marker = ROOT / ".tbc_ready"
    marker.write_text("IndexTTS-2.5\n", encoding="utf-8")
    print(f"[done] IndexTTS ready at {ROOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
