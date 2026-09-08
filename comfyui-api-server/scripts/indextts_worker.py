#!/usr/bin/env python3
"""
IndexTTS worker — run inside D:\\sd\\index-tts via `uv run`.

Usage:
  uv run python /path/to/indextts_worker.py --text "你好" --ref prompt.wav --out out.wav --lang ZH
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--ref", required=True, help="reference voice wav/mp3")
    ap.add_argument("--out", required=True)
    ap.add_argument("--lang", default="ZH", help="ZH/EN/JA/ES/AR")
    ap.add_argument("--cfg", default="checkpoints/config.yaml")
    ap.add_argument("--model-dir", default="checkpoints")
    ap.add_argument("--duration-factor", type=float, default=1.0)
    args = ap.parse_args()

    ref = Path(args.ref)
    out = Path(args.out)
    if not ref.is_file():
        print(f"ERROR: missing ref audio: {ref}", file=sys.stderr)
        return 2
    out.parent.mkdir(parents=True, exist_ok=True)

    text = (args.text or "").strip()
    if len(text) < 1:
        print("ERROR: empty text", file=sys.stderr)
        return 2

    from indextts.infer_v2_5 import IndexTTS2

    tts = IndexTTS2(
        cfg_path=args.cfg,
        model_dir=args.model_dir,
        use_bf16=True,
    )
    kwargs = {
        "spk_audio_prompt": str(ref),
        "text": text,
        "lang": (args.lang or "ZH").upper(),
        "output_path": str(out),
        "verbose": True,
    }
    try:
        tts.infer(**kwargs, duration_factor=float(args.duration_factor))
    except TypeError:
        tts.infer(**kwargs)
    if not out.is_file() or out.stat().st_size < 64:
        print(f"ERROR: output not written: {out}", file=sys.stderr)
        return 3
    print(f"OK {out} bytes={out.stat().st_size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
