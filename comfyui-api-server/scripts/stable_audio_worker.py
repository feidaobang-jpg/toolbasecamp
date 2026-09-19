#!/usr/bin/env python3
"""
Stable Audio Open worker — run with D:\\sd\\stable-audio-open\\.venv Python.

Usage:
  .../python.exe stable_audio_worker.py --prompt "whoosh" --out out.wav --seconds 3
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def main() -> int:
    for k in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        os.environ.pop(k, None)

    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--negative", default="low quality, muffled, distorted, singing, speech, vocals, music melody")
    ap.add_argument("--out", required=True)
    ap.add_argument("--seconds", type=float, default=5.0)
    ap.add_argument("--steps", type=int, default=50)
    ap.add_argument("--seed", type=int, default=-1)
    ap.add_argument("--guidance", type=float, default=7.0)
    ap.add_argument(
        "--model-dir",
        default=os.environ.get("STABLE_AUDIO_MODEL_DIR", r"D:\sd\stable-audio-open\model"),
    )
    args = ap.parse_args()

    prompt = (args.prompt or "").strip()
    if len(prompt) < 2:
        print("ERROR: empty prompt", file=sys.stderr)
        return 2
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    seconds = max(0.5, min(47.0, float(args.seconds or 5.0)))
    model_dir = Path(args.model_dir)
    if not (model_dir / "model_index.json").is_file():
        print(f"ERROR: missing model at {model_dir}", file=sys.stderr)
        return 3

    import numpy as np
    import soundfile as sf
    import torch
    from diffusers import StableAudioPipeline

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    print(f"loading Stable Audio Open from {model_dir} device={device}", flush=True)
    pipe = StableAudioPipeline.from_pretrained(str(model_dir), dtype=dtype)
    pipe = pipe.to(device)

    seed = int(args.seed)
    generator = None
    if seed >= 0:
        generator = torch.Generator(device=device).manual_seed(seed)

    # Diffusers API: audio_end_in_s controls effective length; buffer may pad silence.
    result = pipe(
        prompt,
        negative_prompt=(args.negative or "").strip() or None,
        num_inference_steps=max(10, min(200, int(args.steps or 50))),
        guidance_scale=float(args.guidance or 7.0),
        audio_end_in_s=seconds,
        num_waveforms_per_prompt=1,
        generator=generator,
    )
    audio = result.audios[0]
    if hasattr(audio, "detach"):
        audio = audio.detach().float().cpu()
    # shape: (channels, samples) or (samples, channels)
    arr = np.asarray(audio, dtype=np.float32)
    if arr.ndim == 1:
        arr = arr[None, :]
    if arr.shape[0] <= 8 and arr.shape[0] < arr.shape[-1]:
        # (C, T) → write as (T, C)
        wav = arr.T
    else:
        wav = arr

    sr = int(getattr(pipe, "sample_rate", None) or getattr(getattr(pipe, "vae", None), "sampling_rate", 44100) or 44100)
    # Peak normalize
    peak = float(np.max(np.abs(wav))) if wav.size else 0.0
    if peak > 1e-6:
        wav = wav / peak * 0.95

    sf.write(str(out), wav, sr)
    meta = {
        "prompt": prompt,
        "seconds_req": seconds,
        "sr": sr,
        "shape": list(wav.shape),
        "bytes": out.stat().st_size,
        "device": device,
    }
    (out.parent / "sao_result.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK {out} bytes={out.stat().st_size} sr={sr} seconds={seconds}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
