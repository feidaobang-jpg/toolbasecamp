#!/usr/bin/env python3
"""Check ComfyUI object_info for class_types required by work-flow/*.json."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WF_DIR = ROOT / "work-flow"
HOST = os.environ.get("COMFYUI_HOST", "127.0.0.1:8188")


def required_class_types() -> dict[str, set[str]]:
    by_file: dict[str, set[str]] = {}
    for path in sorted(WF_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        types = {
            node.get("class_type")
            for node in data.values()
            if isinstance(node, dict) and node.get("class_type")
        }
        by_file[path.name] = types
    return by_file


def fetch_object_info() -> dict:
    url = f"http://{HOST}/object_info"
    with urllib.request.urlopen(url, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    print(f"ComfyUI: http://{HOST}/object_info")
    try:
        info = fetch_object_info()
    except urllib.error.URLError as e:
        print(f"FAIL: cannot reach ComfyUI — {e}")
        print("Start ComfyUI first (scripts/start-comfyui-main.bat).")
        return 1

    registered = set(info.keys())
    by_file = required_class_types()
    all_needed = set().union(*by_file.values())

    missing_global = sorted(t for t in all_needed if t not in registered)
    print(f"\nRegistered nodes: {len(registered)}")
    print(f"Workflow class_types: {len(all_needed)}")

    if missing_global:
        print("\n=== MISSING (install custom nodes or update ComfyUI) ===")
        for t in missing_global:
            files = [fn for fn, ts in by_file.items() if t in ts]
            print(f"  - {t}  <- {', '.join(files)}")
    else:
        print("\nOK: all workflow class_types are registered.")

    # API-facing workflows only (exclude kontext watermark)
    api_files = [
        "rembg.json",
        "z_image_turbo.json",
        "z_image_turbo_img2img.json",
        "qwen_image_edit_img2img.json",
        "qwen_describe_cutout.json",
    ]
    for fn in api_files:
        if fn not in by_file:
            continue
        miss = sorted(t for t in by_file[fn] if t not in registered)
        tag = "OK" if not miss else "FAIL"
        print(f"\n[{tag}] {fn}")
        if miss:
            for t in miss:
                print(f"      missing: {t}")

    # photo restore filename varies
    for fn, ts in by_file.items():
        if "老照片" in fn or "Qwen-Image-Edit" in fn:
            miss = sorted(t for t in ts if t not in registered)
            tag = "OK" if not miss else "FAIL"
            print(f"\n[{tag}] {fn}")
            if miss:
                for t in miss:
                    print(f"      missing: {t}")

    return 1 if missing_global else 0


if __name__ == "__main__":
    sys.exit(main())
