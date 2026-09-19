#!/usr/bin/env python3
"""Move (not copy) API-required assets from ComfyUI-aki to ComfyUI-main."""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

AKI = Path(r"D:/sd/ComfyUI-aki-v1.5")
MAIN = Path(r"D:/sd/ComfyUI-main")

REQUIRED_FILES = [
    "diffusion_models/z_image_turbo_bf16.safetensors",
    "text_encoders/qwen_3_4b.safetensors",
    "vae/ae.safetensors",
    "checkpoints/AllInOne/qwen/Qwen-Rapid-AIO-NSFW-v10.safetensors",
    "sam2/sam2_hiera_base_plus.safetensors",
]

REQUIRED_NODES = [
    "inspyrenet-rembg",
    "kjnodes",
    "segment-anything-2",
    "layerstyle",
    "object_detect_qwen",
    "easy-use",
    "rgthree",
]


def norm(s: str) -> str:
    return s.lower().replace("_", "").replace("-", "")


def find_node(root: Path, needle: str) -> Path | None:
    needle_n = norm(needle)
    cn = root / "custom_nodes"
    if not cn.is_dir():
        return None
    for p in cn.iterdir():
        if p.is_dir() and needle_n in norm(p.name):
            return p
    return None


def dir_size_gb(p: Path) -> float:
    if not p.exists():
        return 0.0
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) / 1e9


def main() -> int:
    if not AKI.is_dir():
        print(f"[ERROR] Aki root missing: {AKI}")
        return 1
    if not MAIN.is_dir():
        print(f"[ERROR] Main root missing: {MAIN}")
        return 1

    moved: list[str] = []
    skipped: list[str] = []
    errors: list[str] = []

    src_qwen = AKI / "models" / "Qwen"
    dst_qwen = MAIN / "models" / "Qwen"
    if src_qwen.is_dir():
        if dst_qwen.exists():
            skipped.append("models/Qwen already in main")
        else:
            dst_qwen.parent.mkdir(parents=True, exist_ok=True)
            try:
                shutil.move(str(src_qwen), str(dst_qwen))
                moved.append(f"models/Qwen -> main ({dir_size_gb(dst_qwen):.2f} GB)")
            except OSError as exc:
                errors.append(f"models/Qwen: {exc}")
    else:
        skipped.append("aki models/Qwen absent (already moved?)")

    for rel in REQUIRED_FILES:
        dest = MAIN / "models" / rel
        if dest.is_file():
            skipped.append(f"main has {rel}")
            continue
        name = Path(rel).name
        found = list((AKI / "models").rglob(name))
        if not found:
            errors.append(f"missing in both: {rel}")
            continue
        src = found[0]
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.move(str(src), str(dest))
            moved.append(f"{src.relative_to(AKI)} -> models/{rel}")
        except OSError as exc:
            errors.append(f"{rel}: {exc}")

    for needle in REQUIRED_NODES:
        main_node = find_node(MAIN, needle)
        aki_node = find_node(AKI, needle)
        if main_node:
            skipped.append(f"node {needle}: main has {main_node.name}")
            continue
        if not aki_node:
            errors.append(f"node {needle}: not in aki")
            continue
        dest = MAIN / "custom_nodes" / aki_node.name
        try:
            shutil.move(str(aki_node), str(dest))
            moved.append(f"custom_nodes/{aki_node.name}")
        except OSError as exc:
            errors.append(f"node {needle}: {exc}")

    print("=== MOVED ===")
    for line in moved:
        print(" +", line)
    if not moved:
        print(" (nothing moved)")

    print("\n=== SKIPPED ===")
    for line in skipped:
        print(" -", line)

    print("\n=== ERRORS ===")
    for line in errors:
        print(" !", line)

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
