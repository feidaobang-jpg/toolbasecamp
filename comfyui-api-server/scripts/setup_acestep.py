#!/usr/bin/env python3
"""Install ACE-Step 1.5 under D:\\sd\\ACE-Step-1.5 and download turbo checkpoint."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.environ.get("ACESTEP_ROOT", r"D:\sd\ACE-Step-1.5"))
REPO = "https://github.com/ace-step/ACE-Step-1.5.git"
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

    env = os.environ.copy()
    env.setdefault("UV_PYTHON", "3.12")
    run([uv, "sync", "--default-index", MIRROR], cwd=ROOT, env=env)

    ckpt_root = ROOT / "checkpoints"
    turbo = ckpt_root / "acestep-v15-turbo"
    has_ckpt = turbo.is_dir() or (ckpt_root / "config.json").is_file() or any(ckpt_root.glob("*.safetensors"))
    if not has_ckpt:
        print("[info] downloading ACE-Step main pack (includes turbo) …", flush=True)
        run([uv, "run", "acestep-download"], cwd=ROOT, env=env)
    else:
        print(f"[ok] checkpoints present under {ckpt_root}")

    marker = ROOT / ".tbc_ready"
    marker.write_text("ACE-Step-1.5 main/turbo\n", encoding="utf-8")
    print(f"[done] ACE-Step ready at {ROOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
