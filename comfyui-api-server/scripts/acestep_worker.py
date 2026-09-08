#!/usr/bin/env python3
"""
ACE-Step 1.5 worker — run inside D:\\sd\\ACE-Step-1.5 via `uv run`.

DiT-only (thinking=False) for reliable 16GB VRAM use.
BGM: instrumental=True, lyrics=[Instrumental]
Song: pass lyrics (or [Instrumental] if empty)
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path


def main() -> int:
    for k in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        os.environ.pop(k, None)

    ap = argparse.ArgumentParser()
    ap.add_argument("--caption", required=True, help="style / scene description")
    ap.add_argument("--lyrics", default="", help="structured lyrics; empty → instrumental")
    ap.add_argument("--out", required=True, help="output wav/mp3/flac path")
    ap.add_argument("--mode", choices=("bgm", "song"), default="bgm")
    ap.add_argument("--duration", type=float, default=60.0)
    ap.add_argument("--bpm", type=int, default=0)
    ap.add_argument("--lang", default="zh", help="vocal language code")
    ap.add_argument("--seed", type=int, default=-1)
    ap.add_argument("--steps", type=int, default=8)
    ap.add_argument("--config-path", default="acestep-v15-turbo")
    ap.add_argument("--offload-cpu", action="store_true", default=True)
    ap.add_argument("--no-offload-cpu", action="store_true")
    args = ap.parse_args()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    caption = (args.caption or "").strip()
    if len(caption) < 2:
        print("ERROR: empty caption", file=sys.stderr)
        return 2

    instrumental = args.mode == "bgm" or not (args.lyrics or "").strip()
    lyrics = "[Instrumental]" if instrumental else (args.lyrics or "").strip()
    duration = float(args.duration or 60.0)
    duration = max(10.0, min(240.0, duration))
    lang = (args.lang or "zh").strip().lower() or "zh"
    if lang in ("zh-cn", "chinese", "cn"):
        lang = "zh"
    offload = not args.no_offload_cpu

    project_root = os.getcwd()
    save_dir = out.parent / "_ace_tmp"
    if save_dir.exists():
        shutil.rmtree(save_dir, ignore_errors=True)
    save_dir.mkdir(parents=True, exist_ok=True)

    from acestep.handler import AceStepHandler
    from acestep.inference import GenerationParams, GenerationConfig, generate_music

    dit = AceStepHandler()
    status_msg, ok = dit.initialize_service(
        project_root=project_root,
        config_path=args.config_path,
        device="auto",
        offload_to_cpu=offload,
    )
    if not ok:
        print(f"ERROR: DiT init failed: {status_msg}", file=sys.stderr)
        return 3
    print(f"DiT ready: {status_msg}", flush=True)

    params = GenerationParams(
        task_type="text2music",
        caption=caption,
        lyrics=lyrics,
        instrumental=instrumental,
        duration=duration,
        vocal_language=lang if not instrumental else "unknown",
        bpm=int(args.bpm) if args.bpm and args.bpm > 0 else None,
        inference_steps=max(4, min(32, int(args.steps or 8))),
        seed=int(args.seed) if args.seed is not None else -1,
        thinking=False,
        use_cot_metas=False,
        use_cot_caption=False,
        use_cot_language=False,
        use_cot_lyrics=False,
        enable_normalization=True,
    )
    config = GenerationConfig(
        batch_size=1,
        use_random_seed=(int(args.seed) < 0),
        seeds=[int(args.seed)] if int(args.seed) >= 0 else None,
        audio_format="wav",
    )

    result = generate_music(
        dit_handler=dit,
        llm_handler=None,
        params=params,
        config=config,
        save_dir=str(save_dir),
    )
    if not result.success:
        print(f"ERROR: generation failed: {result.error or result.status_message}", file=sys.stderr)
        return 4
    if not result.audios:
        print("ERROR: no audio in result", file=sys.stderr)
        return 5

    src = Path(result.audios[0].get("path") or "")
    if not src.is_file():
        print(f"ERROR: missing generated file: {src}", file=sys.stderr)
        return 6
    shutil.copy2(src, out)
    meta = {
        "mode": args.mode,
        "instrumental": instrumental,
        "caption": caption,
        "lyrics": lyrics,
        "duration_req": duration,
        "path": str(out),
        "bytes": out.stat().st_size,
        "status": result.status_message,
    }
    (out.parent / "ace_result.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"OK {out} bytes={out.stat().st_size}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
