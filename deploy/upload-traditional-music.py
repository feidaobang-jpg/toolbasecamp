#!/usr/bin/env python3
"""CLI fallback for batch transcode/upload — prefer admin UI「歌曲管理」.

Title from filename stem; lyrics fetched on server via DeepSeek during admin upload.

Requires: ffmpeg + ffprobe on PATH, SSH alias toolbasecamp-cn (or --host).

Usage:
  python deploy/upload-traditional-music.py --dry-run
  python deploy/upload-traditional-music.py --limit 3 --upload
  python deploy/upload-traditional-music.py --upload
  python deploy/upload-traditional-music.py --upload --force
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DEFAULT_MUSIC_DIR = REPO / "music"
DEFAULT_OUT_DIR = REPO / "deploy" / ".traditional-out"
DEFAULT_STATE = REPO / "deploy" / ".traditional-build-state.json"
DEFAULT_HOST = "toolbasecamp-cn"
DEFAULT_REMOTE = "/var/lib/toolbasecamp/traditional-music"


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess:
    print("+", " ".join(cmd))
    return subprocess.run(cmd, check=check)


def require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        print(f"Missing {name} on PATH. Install ffmpeg (includes ffprobe).", file=sys.stderr)
        sys.exit(1)
    return path


def file_sig(path: Path) -> str:
    st = path.stat()
    return f"{st.st_size}:{int(st.st_mtime)}"


def probe_duration(path: Path) -> int:
    ffprobe = require_tool("ffprobe")
    try:
        out = subprocess.check_output(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        return max(0, int(float(out or 0)))
    except Exception:
        return 0


def transcode(src: Path, dst: Path, *, bitrate: str) -> None:
    ffmpeg = require_tool("ffmpeg")
    dst.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(src),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            bitrate,
            "-ac",
            "2",
            "-ar",
            "44100",
            str(dst),
        ]
    )


def title_from_filename(path: Path) -> str:
    return path.stem.strip() or path.name


def track_id(index: int) -> str:
    return f"t{index:03d}"


def load_state(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def collect_sources(music_dir: Path, limit: int) -> list[Path]:
    files = sorted(music_dir.glob("*.mp3"), key=lambda p: p.name.casefold())
    if limit > 0:
        files = files[:limit]
    return files


def build_manifest(items: list[dict]) -> dict:
    return {"version": 1, "generatedBy": "upload-traditional-music.py", "items": items}


def upload_tar(host: str, remote_dir: str, staging: Path) -> None:
    archive = staging / "traditional-music.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        for p in staging.iterdir():
            if p.name == archive.name:
                continue
            tar.add(p, arcname=p.name)
    remote_tmp = "/tmp/traditional-music-upload.tar.gz"
    run(["scp", str(archive), f"{host}:{remote_tmp}"])
    run(
        [
            "ssh",
            host,
            " && ".join(
                [
                    f"sudo mkdir -p {remote_dir}",
                    f"sudo tar -xzf {remote_tmp} -C {remote_dir}",
                    f"sudo chown -R ubuntu:ubuntu {remote_dir}",
                    f"rm -f {remote_tmp}",
                ]
            ),
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcode + upload traditional music library")
    parser.add_argument("--music-dir", type=Path, default=DEFAULT_MUSIC_DIR)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--state-file", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--remote-dir", default=DEFAULT_REMOTE)
    parser.add_argument("--bitrate", default="128k", help="MP3 bitrate for web (default 128k)")
    parser.add_argument("--limit", type=int, default=0, help="Only process first N files (0=all)")
    parser.add_argument("--dry-run", action="store_true", help="List files only, no transcode/upload")
    parser.add_argument("--upload", action="store_true", help="Upload out-dir to VPS after build")
    parser.add_argument("--force", action="store_true", help="Re-transcode even if source unchanged")
    args = parser.parse_args()

    music_dir = args.music_dir.resolve()
    if not music_dir.is_dir():
        print(f"Music directory not found: {music_dir}", file=sys.stderr)
        return 1

    sources = collect_sources(music_dir, args.limit)
    if not sources:
        print(f"No MP3 files in {music_dir}", file=sys.stderr)
        return 1

    print(f"Found {len(sources)} source file(s) in {music_dir}")
    if args.dry_run:
        for i, src in enumerate(sources, 1):
            print(f"  {track_id(i)}  {src.name}  →  {title_from_filename(src)}")
        return 0

    require_tool("ffmpeg")
    state = load_state(args.state_file)
    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest_items: list[dict] = []
    for i, src in enumerate(sources, 1):
        tid = track_id(i)
        dst = out_dir / f"{tid}.mp3"
        sig = file_sig(src)
        cache_key = str(src.resolve())
        cached = state.get(cache_key, {})
        if (
            not args.force
            and cached.get("sig") == sig
            and cached.get("id") == tid
            and dst.is_file()
        ):
            print(f"[skip] {tid} {src.name} (unchanged)")
        else:
            print(f"[transcode] {tid} {src.name} @ {args.bitrate}")
            transcode(src, dst, bitrate=args.bitrate)
            state[cache_key] = {"sig": sig, "id": tid, "src": src.name}

        duration = probe_duration(dst)
        manifest_items.append(
            {
                "id": tid,
                "title": title_from_filename(src),
                "file": f"{tid}.mp3",
                "duration": duration,
                "contentType": "audio/mpeg",
                "source": src.name,
            }
        )

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(build_manifest(manifest_items), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    save_state(args.state_file, state)
    print(f"Built {len(manifest_items)} tracks → {out_dir}")
    print(f"Manifest: {manifest_path}")

    if not args.upload:
        print("Done (local only). Add --upload to push to VPS.")
        return 0

    staging = Path(tempfile.mkdtemp(prefix="tbc-trad-"))
    try:
        for item in manifest_items:
            shutil.copy2(out_dir / item["file"], staging / item["file"])
        shutil.copy2(manifest_path, staging / "manifest.json")
        print(f"Uploading to {args.host}:{args.remote_dir} …")
        upload_tar(args.host, args.remote_dir, staging)
        print("Upload complete.")
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
